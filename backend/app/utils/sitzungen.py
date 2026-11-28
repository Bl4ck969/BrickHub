"""Sitzungen: kurzes Zugangs-Token plus gleitendes Erneuerungs-Token.

Zugangs-Token (JWT, Cookie `brickhub_access`, 15 min) traegt Benutzername und
`token_version`. Das Erneuerungs-Token ist ein Zufallswert im Cookie
`brickhub_refresh` (nur unter /api/auth, SameSite=Strict); in der Datenbank liegt
nur sein SHA-256-Hash. Jede Erneuerung ersetzt es durch ein neues und schiebt das
Ablaufdatum um `refresh_token_expire_days` nach hinten.

Richtlinie: Funktionskarte "Login & Benutzerverwaltung" (Vault), Variante BrickHub
mit Cookie statt Bearer-Header.
"""
import hashlib
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings, _is_production
from app.models.user import RefreshToken, User
from app.utils.auth import ACCESS_COOKIE, create_access_token

REFRESH_COOKIE = "brickhub_refresh"
# Pfad /api/auth statt nur /api/auth/refresh: auch das Abmelden muss das Token
# sehen, um die Kette auf dem Server zu beenden.
REFRESH_PATH = "/api/auth"
ALTES_COOKIE = "access_token"

# Zwei Tabs (oder Tab + Handy-Browser mit geteiltem Cookie) erneuern gleichzeitig:
# Der zweite kommt mit dem eben ersetzten Token. Innerhalb dieser Frist ist das
# kein Diebstahl, sondern ein Wettlauf.
GNADENFRIST = timedelta(seconds=30)

# Ist der direkte Nachfolger eines Tokens nie benutzt worden, ging die Antwort der
# Erneuerung verloren (Tab zu, Handy eingeschlafen) - dann wird neu ausgestellt statt
# abgemeldet. Restrisiko, bewusst hingenommen: Wer eine Kopie des VORLETZTEN Tokens hat,
# waehrend der Besitzer seinen Nachfolger noch nicht benutzt hat, bekommt so eine Kette;
# der naechste Zugriff des Besitzers widerruft sie dann (widerrufenes Token -> Kette tot).
# Die Frist begrenzt, wie lange ein altes Token dafuer taugt.
VERLORENE_ANTWORT_FRIST = timedelta(hours=12)

# Nur im Entwicklungsbetrieb: Der Vite-Proxy (changeOrigin) schreibt den Host auf
# localhost:8000 um, der Browser meldet aber localhost:5173 als Origin.
_DEV_ORIGINS = {"localhost:5173", "127.0.0.1:5173"}

_nicht_angemeldet = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nicht angemeldet")


def _hash(roh: str) -> str:
    return hashlib.sha256(roh.encode("utf-8")).hexdigest()


def _jetzt() -> datetime:
    return datetime.utcnow()


def zugang_setzen(response: Response, user: User) -> None:
    token = create_access_token(
        {"sub": user.username, "tv": user.token_version},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",  # lax: Bilder (<img>) und Downloads muessen es mitschicken
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


def sitzung_beginnen(
    db: Session, request: Request, response: Response, user: User, familie: str | None = None
) -> RefreshToken:
    """Legt ein neues Erneuerungs-Token an und setzt beide Cookies. Ohne `familie`
    beginnt eine neue Kette (Anmeldung), mit `familie` wird eine fortgesetzt."""
    jetzt = _jetzt()
    roh = secrets.token_urlsafe(32)
    zeile = RefreshToken(
        user_id=user.id,
        family_id=familie or secrets.token_hex(16),
        token_hash=_hash(roh),
        token_version=user.token_version,
        created_at=jetzt,
        expires_at=jetzt + timedelta(days=settings.refresh_token_expire_days),
        user_agent=(request.headers.get("user-agent") or "")[:255] or None,
    )
    db.add(zeile)
    db.flush()
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=roh,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
        max_age=settings.refresh_token_expire_days * 86400,
        path=REFRESH_PATH,
    )
    zugang_setzen(response, user)
    # Altlast vor der Umstellung entfernen
    response.delete_cookie(ALTES_COOKIE, path="/")
    return zeile


def cookies_loeschen(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH)
    response.delete_cookie(ALTES_COOKIE, path="/")


def kette_widerrufen(db: Session, familie: str) -> None:
    db.query(RefreshToken).filter(
        RefreshToken.family_id == familie, RefreshToken.revoked_at.is_(None)
    ).update({RefreshToken.revoked_at: _jetzt()}, synchronize_session=False)


def alle_widerrufen(db: Session, user: User) -> None:
    """Passwortwechsel und Reset: alle Geraete abmelden. Die erhoehte token_version
    macht auch die noch laufenden Zugangs-Token ungueltig."""
    user.token_version = (user.token_version or 0) + 1
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
    ).update({RefreshToken.revoked_at: _jetzt()}, synchronize_session=False)


def abgelaufene_entfernen(db: Session) -> None:
    db.query(RefreshToken).filter(RefreshToken.expires_at < _jetzt()).delete(synchronize_session=False)


def origin_erlaubt(request: Request) -> bool | None:
    """True/False, ob der Origin-Kopf zum Host passt; None, wenn er fehlt.

    SameSite schuetzt nicht gegen andere Apps auf derselben IP (andere Ports sind
    "same-site"), also muss der Origin samt Port passen. X-Forwarded-Host zaehlt mit,
    damit ein Reverse Proxy, der den Host umschreibt, nicht jede Erneuerung sperrt -
    ein fremder Browser-Ursprung kann diesen Kopf ohne CORS-Freigabe nicht setzen."""
    origin = request.headers.get("origin")
    if not origin:
        return None
    erlaubt = {
        h.strip().lower()
        for h in (request.headers.get("host"), request.headers.get("x-forwarded-host"))
        if h
    }
    if not _is_production:
        erlaubt |= _DEV_ORIGINS
    teile = urlsplit(origin)
    return teile.scheme in ("http", "https") and teile.netloc.lower() in erlaubt


def origin_pruefen(request: Request) -> None:
    """Fuer alles, was das Erneuerungs-Cookie benutzt: Origin ist Pflicht."""
    ok = origin_erlaubt(request)
    if ok is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Herkunft fehlt")
    if not ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Herkunft nicht erlaubt")


def erneuern(db: Session, request: Request, response: Response) -> User:
    roh = request.cookies.get(REFRESH_COOKIE)
    if not roh:
        raise _nicht_angemeldet
    jetzt = _jetzt()
    abgelaufene_entfernen(db)  # sonst waechst die Tabelle, wer sich nie neu anmeldet
    zeile = db.query(RefreshToken).filter(RefreshToken.token_hash == _hash(roh)).first()
    if not zeile or zeile.expires_at <= jetzt:
        db.commit()
        raise _nicht_angemeldet
    if zeile.revoked_at is not None:
        # Ein widerrufenes Token taucht auf: Entweder ist die Kette schon tot (dann
        # schadet es nicht), oder es war ein Seitenzweig, den jemand anderes weiterfuehrt.
        kette_widerrufen(db, zeile.family_id)
        db.commit()
        raise _nicht_angemeldet

    user = db.query(User).filter(User.id == zeile.user_id).first()
    if not user or user.token_version != zeile.token_version:
        kette_widerrufen(db, zeile.family_id)
        db.commit()
        raise _nicht_angemeldet

    if zeile.replaced_at is not None:
        if jetzt - zeile.replaced_at <= GNADENFRIST:
            # Wettlauf zweier Tabs: Der Browser hat das Nachfolge-Cookie schon,
            # also nur ein frisches Zugangs-Token - kein zweiter Zweig der Kette.
            zugang_setzen(response, user)
            return user
        nachfolger = (
            db.query(RefreshToken).filter(RefreshToken.id == zeile.replaced_by_id).first()
            if zeile.replaced_by_id else None
        )
        if (
            nachfolger is not None and nachfolger.replaced_at is None
            and nachfolger.revoked_at is None and nachfolger.expires_at > jetzt
            and jetzt - zeile.replaced_at <= VERLORENE_ANTWORT_FRIST
        ):
            # Der Nachfolger wurde nie benutzt: Die Antwort der letzten Erneuerung ist
            # verloren gegangen (Tab zu, Handy eingeschlafen). Nachfolger verwerfen und
            # neu ausstellen, statt den Benutzer abzumelden. Taucht der verworfene spaeter
            # doch auf, greift oben die Regel fuer widerrufene Token.
            nachfolger.revoked_at = jetzt
        else:
            # Ein laengst ersetztes Token, dessen Kette schon weiterlief: Es wurde kopiert.
            kette_widerrufen(db, zeile.family_id)
            db.commit()
            raise _nicht_angemeldet

    zeile.replaced_at = jetzt
    neu = sitzung_beginnen(db, request, response, user, familie=zeile.family_id)
    zeile.replaced_by_id = neu.id
    db.commit()
    return user


def abmelden(db: Session, request: Request, response: Response) -> None:
    roh = request.cookies.get(REFRESH_COOKIE)
    if roh:
        zeile = db.query(RefreshToken).filter(RefreshToken.token_hash == _hash(roh)).first()
        if zeile:
            kette_widerrufen(db, zeile.family_id)
            db.commit()
    cookies_loeschen(response)
