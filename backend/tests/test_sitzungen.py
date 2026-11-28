"""Sitzungen: Anmelden, Erneuern (Rotation, Gnadenfrist, Diebstahl), Abmelden,
Passwortwechsel. Laeuft gegen eine Wegwerf-SQLite im Temp-Ordner.

Aufruf (aus backend/):  python -m pytest -q tests/test_sitzungen.py

⚠ Nie ueber Umgebungsvariablen umbiegen: Die Datenbank-Adresse legt der erste Import von
app.config fest, und ein anderer Test kann das schon getan haben - dann landen die
Testbenutzer in der echten data/database.db (28.11.2026 passiert). Darum eine eigene
Engine plus `dependency_overrides`, und der App-Start (create_tables, Migrationen auf
die echte DB) wird nie ausgeloest: TestClient ohne `with`.
"""
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import box, set_model, setting  # noqa: F401 - Tabellen registrieren
from app.models.user import RefreshToken, User
from app.routers import auth as auth_router
from app.utils import sitzungen
from app.utils.auth import hash_password

_TMP = Path(tempfile.mkdtemp(prefix="brickhub-test-"))
_engine = create_engine(f"sqlite:///{_TMP / 'test.db'}", connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

ORIGIN = {"Origin": "http://testserver"}
PASSWORT = "Lange-Test-Passphrase-1"


def _test_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def _app():
    Base.metadata.create_all(bind=_engine)
    app.dependency_overrides[get_db] = _test_db
    db = TestSession()
    db.add(User(username="tester", password_hash=hash_password(PASSWORT), role="admin",
                must_change_password=False, created_at=datetime.utcnow()))
    db.commit()
    db.close()
    yield app
    app.dependency_overrides.pop(get_db, None)
    _engine.dispose()


@pytest.fixture
def client(_app):
    auth_router._login_attempts.clear()
    auth_router._refresh_attempts.clear()
    c = TestClient(_app)  # ohne `with`: kein Start-Ereignis, keine Migration auf die echte DB
    r = c.post("/api/auth/login", json={"username": "tester", "password": PASSWORT})
    assert r.status_code == 200, r.text
    return c


def _refresh_wert(c: TestClient) -> str:
    return c.cookies.get("brickhub_refresh", path="/api/auth")


def test_login_setzt_beide_cookies(client):
    assert client.cookies.get("brickhub_access")
    assert _refresh_wert(client)
    assert client.get("/api/auth/me").status_code == 200


def test_refresh_braucht_passenden_origin(client):
    assert client.post("/api/auth/refresh").status_code == 403
    assert client.post("/api/auth/refresh", headers={"Origin": "http://192.168.178.95:9999"}).status_code == 403
    alt = _refresh_wert(client)
    r = client.post("/api/auth/refresh", headers=ORIGIN)
    assert r.status_code == 200, r.text
    assert _refresh_wert(client) != alt


def test_ohne_zugangs_cookie_rettet_refresh(client):
    client.cookies.delete("brickhub_access")
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/refresh", headers=ORIGIN).status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_wettlauf_in_gnadenfrist_ist_kein_diebstahl(client):
    alt = _refresh_wert(client)
    assert client.post("/api/auth/refresh", headers=ORIGIN).status_code == 200
    neu = _refresh_wert(client)
    # zweiter Tab kommt mit dem alten Token
    zweiter = TestClient(app)
    zweiter.cookies.set("brickhub_refresh", alt, path="/api/auth")
    r = zweiter.post("/api/auth/refresh", headers=ORIGIN)
    assert r.status_code == 200
    assert "brickhub_refresh" not in r.headers.get("set-cookie", "")  # kein zweiter Zweig
    # die Kette lebt weiter
    assert client.post("/api/auth/refresh", headers=ORIGIN).status_code == 200
    assert _refresh_wert(client) != neu


def _mit_token(wert: str) -> TestClient:
    c = TestClient(app)
    c.cookies.set("brickhub_refresh", wert, path="/api/auth")
    return c


def test_wiederverwendung_nach_benutztem_nachfolger_widerruft_die_kette(client, monkeypatch):
    monkeypatch.setattr(sitzungen, "GNADENFRIST", timedelta(0))
    alt = _refresh_wert(client)
    assert client.post("/api/auth/refresh", headers=ORIGIN).status_code == 200
    assert client.post("/api/auth/refresh", headers=ORIGIN).status_code == 200  # Nachfolger benutzt
    assert _mit_token(alt).post("/api/auth/refresh", headers=ORIGIN).status_code == 401
    # auch der rechtmaessige Inhaber ist jetzt abgemeldet
    assert client.post("/api/auth/refresh", headers=ORIGIN).status_code == 401


def test_verlorene_antwort_meldet_nicht_ab(client, monkeypatch):
    """Antwort der Erneuerung kam nie an: Browser hat noch das alte Token."""
    monkeypatch.setattr(sitzungen, "GNADENFRIST", timedelta(0))
    alt = _refresh_wert(client)
    assert client.post("/api/auth/refresh", headers=ORIGIN).status_code == 200
    verloren = _refresh_wert(client)  # diesen Nachfolger hat der Browser nie bekommen
    browser = _mit_token(alt)
    assert browser.post("/api/auth/refresh", headers=ORIGIN).status_code == 200
    assert browser.get("/api/auth/me").status_code == 200
    # Taucht der verworfene Nachfolger doch noch auf, ist das ein Seitenzweig -> Kette tot
    assert _mit_token(verloren).post("/api/auth/refresh", headers=ORIGIN).status_code == 401
    assert browser.post("/api/auth/refresh", headers=ORIGIN).status_code == 401


def test_fremder_origin_wird_abgewiesen(client):
    fremd = {"Origin": "http://192.168.178.95:9999"}
    assert client.post("/api/auth/logout", headers=fremd).status_code == 403
    assert client.patch("/api/sets/1/inline", json={"notes": "x"}, headers=fremd).status_code == 403
    # ohne Origin (Skripte) bleibt es beim alten Verhalten - hier: Set fehlt -> 404, nicht 403
    assert client.patch("/api/sets/999999/inline", json={"notes": "x"}).status_code == 404
    assert client.get("/api/auth/me", headers=fremd).status_code == 200  # Lesen bleibt erlaubt


def test_neuer_benutzer_startet_mit_zufaelliger_token_version():
    db = TestSession()
    try:
        versionen = set()
        for i in range(3):
            u = User(username=f"zufall{i}", password_hash="x", role="user", created_at=datetime.utcnow())
            db.add(u)
            db.flush()
            versionen.add(u.token_version)
        assert len(versionen) == 3
        db.rollback()
    finally:
        db.close()


def test_abmelden_beendet_die_sitzung_auf_dem_server(client):
    wert = _refresh_wert(client)
    assert client.post("/api/auth/logout").status_code == 403  # ohne Origin keine Abmeldung
    assert client.post("/api/auth/logout", headers=ORIGIN).status_code == 200
    nachzuegler = TestClient(app)
    nachzuegler.cookies.set("brickhub_refresh", wert, path="/api/auth")
    assert nachzuegler.post("/api/auth/refresh", headers=ORIGIN).status_code == 401


def test_passwortwechsel_meldet_andere_geraete_ab(client):
    auth_router._login_attempts.clear()
    anderes = TestClient(app)
    assert anderes.post("/api/auth/login", json={"username": "tester", "password": PASSWORT}).status_code == 200
    neu = "Noch-Laengere-Passphrase-2"
    r = client.post("/api/auth/change-password", json={
        "current_password": PASSWORT, "new_password": neu, "new_password_confirm": neu,
        "security_questions": [],
    })
    assert r.status_code == 200, r.text
    try:
        # dieses Geraet bleibt angemeldet, das andere nicht
        assert client.get("/api/auth/me").status_code == 200
        assert anderes.get("/api/auth/me").status_code == 401
        assert anderes.post("/api/auth/refresh", headers=ORIGIN).status_code == 401
    finally:
        db = TestSession()
        u = db.query(User).filter(User.username == "tester").first()
        u.password_hash = hash_password(PASSWORT)
        db.commit()
        db.close()


def test_abgelaufenes_token_gilt_nicht(client):
    db = TestSession()
    db.query(RefreshToken).update({RefreshToken.expires_at: datetime.utcnow() - timedelta(seconds=1)})
    db.commit()
    db.close()
    assert client.post("/api/auth/refresh", headers=ORIGIN).status_code == 401


def test_nur_hash_in_der_datenbank(client):
    wert = _refresh_wert(client)
    db = TestSession()
    try:
        assert not db.query(RefreshToken).filter(RefreshToken.token_hash == wert).first()
        assert db.query(RefreshToken).filter(RefreshToken.token_hash == sitzungen._hash(wert)).first()
    finally:
        db.close()
