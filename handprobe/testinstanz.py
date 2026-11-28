"""Testinstanz für die Handprobe vor dem Release (Karte BH-1).

Vorlage: handprobe/testinstanz.py in AllMyMovies-DB (Karte AMM-15), angepasst an BrickHub.
Fester Aufruf (Kanban-Leitstand, docs/projekt-anbinden.md), nur Python-Standardbibliothek:

    python -I handprobe/testinstanz.py bauen     --name <projekt> --port <p> --image <tag> --sicherung <ordner>
    python -I handprobe/testinstanz.py abraeumen --name <projekt> [--port … --image … --sicherung …]

<ordner> ist eine Kopie der neuesten automatischen Sicherung: ein Ordner, der wie die ZIP heißt, mit oder ohne `.zip`
(`brickhub-auto-JJJJ-MM-TT_HH-MM[.zip]`; der Leitstand nimmt den Namen mit Endung), und genau diese ZIP enthält. Das Rezept liest sie nur – es entpackt,
benennt und legt dort nichts an (der Leitstand hebt eine unveränderte Kopie für den nächsten Versuch auf).

bauen
    1. Compose-Projekt <projekt> mit dem lokalen Image <tag> auf Port <p> starten, Wegwerf-Volumes für
       /app/data, /app/export und /app/backup, /api/health abwarten.
    2. Wegwerf-Admin anlegen (POST /api/auth/register-first-admin) und anmelden – SOFORT nach dem Start:
       Solange es keinen Benutzer gibt, könnte jedes Gerät im Netz selbst erster Admin werden.
    3. Automatische Sicherung abschalten (PUT /api/backup/schedule, backup_enabled=false) – VOR dem
       Einspielen, siehe „Warum vorher abschalten“.
    4. Über den Weg der App einspielen: POST /api/backup/import/start?mode=replace (Upload der ZIP),
       Fortschritt über /api/backup/import/progress/<id> (Server-Sent Events).
    5. Nachprüfen im Container (SQLite): Sets und Benutzer wie in data.json der Sicherung, Wegwerf-Admin
       weg, Sicherungsplan aus, Ollama aus. Danach: Die Sicherungskopie ist unverändert (Größe, Zeitstempel).

abraeumen
    docker compose -p <projekt> down -v – nur, wenn jeder Container und jedes Volume des Projekts die Marke
    `de.brickhub.testinstanz` trägt. Ein fremdes Projekt (z. B. die lokale Entwicklung) wird abgelehnt.

Exitcodes: 0 = fertig, 1 = Schritt gescheitert (Instanz bleibt zur Diagnose stehen, danach `abraeumen`),
2 = falscher Aufruf / Vorbedingung verletzt.

Warum vorher abschalten: Einspielen mit `replace` löscht alle Benutzer und legt die aus der Sicherung an.
Danach gehört das Anmelde-Cookie des Wegwerf-Admins zu niemandem mehr, jede Admin-Anfrage bekäme 401.
Der Sicherungsplan liegt in der Tabelle `settings`, die das Einspielen nicht löscht und (bis auf
`onedrive_base_url`) nicht beschreibt – die Abschaltung von vorher überlebt also. Nachgeprüft wird
deshalb direkt in der Datenbank im Container, nicht über die API.

Außenwirkung: BrickHub spricht nur über Ollama (Bilderkennung) nach außen, und das kommt allein aus
Umgebungsvariablen (`OLLAMA_ENABLED`), die Compose-Datei setzt es aus. Mail, Sync oder Fremd-APIs gibt es
nicht. `onedrive_base_url` aus der Sicherung bleibt: Es ist nur der Anfang der Links zu Anleitungen, die
Andreas selbst anklickt.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from http.cookies import SimpleCookie
from pathlib import Path

HIER = Path(__file__).resolve().parent
COMPOSE_DATEI = HIER / "docker-compose.testinstanz.yml"
MARKE = "de.brickhub.testinstanz"

# Name wie in app/services/backup_scheduler.py (_create_backup): brickhub-auto-JJJJ-MM-TT_HH-MM.zip
SICHERUNGS_NAME = re.compile(r"^brickhub-auto-[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}$")
# Compose-Projektnamen: klein, Ziffern, Bindestrich, Unterstrich.
PROJEKT_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")
# Namen echter Installationen – nie als Testinstanz. `brickhub` ist der Compose-Projektname der
# lokalen docker-compose.yml (Ordnername) und der Container auf dem Unraid heißt `Brickhub`.
GESPERRTE_NAMEN = {"brickhub", "brickhub-db"}
# Wie _BACKUP_VERSION in app/routers/backup.py – eine andere Version lehnt die App ab.
SICHERUNGS_VERSION = 1

# Gespiegelte Ordner (Syncthing, OneDrive, Agent-VM): dort darf keine Kopie der Sicherung liegen –
# sie enthält Passwort-Hashes und die Antworten-Hashes der Sicherheitsfragen.
GESPIEGELT = ("e:/setups", "/workspace", "/vault")

START_ZEITLIMIT = 300       # Sekunden bis /api/health
UPLOAD_ZEITLIMIT = 1800     # Sekunden für den Upload der ZIP (~600 MB über localhost)
EINSPIELEN_ZEITLIMIT = 3600  # Sekunden, bis das Einspielen fertig gemeldet ist

# Backslashes gehen auf dem Weg in diese Datei leicht verloren – darum als Zahl.
CRLF = bytes([13, 10])
RUECKSTRICH = chr(92)


class Abbruch(Exception):
    """Ein Schritt ist gescheitert. `code` ist der Exitcode."""

    def __init__(self, text: str, code: int = 1):
        super().__init__(text)
        self.code = code


def melde(text: str) -> None:
    print(f"[testinstanz] {text}", flush=True)


# ── Docker ─────────────────────────────────────────────────────────────────


def docker(args: list[str], umgebung: dict[str, str] | None = None,
           zeitlimit: int = 900) -> subprocess.CompletedProcess:
    """Ruft `docker …` auf, Ausgabe als Text, Eingabe geschlossen."""
    try:
        return subprocess.run(
            ["docker", *args],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            env=umgebung, stdin=subprocess.DEVNULL, timeout=zeitlimit,
        )
    except FileNotFoundError as exc:
        raise Abbruch("docker nicht gefunden (Docker Desktop installiert und gestartet?)", 2) from exc
    except subprocess.TimeoutExpired as exc:
        raise Abbruch(f"docker {' '.join(args[:4])} … kehrte nach {zeitlimit} s nicht zurück") from exc


def compose_umgebung(image: str, port: int, schluessel: str) -> dict[str, str]:
    umgebung = dict(os.environ)
    umgebung.update({
        "HANDPROBE_IMAGE": image,
        "HANDPROBE_PORT": str(port),
        "HANDPROBE_SECRET_KEY": schluessel,
    })
    return umgebung


def compose(name: str, args: list[str], umgebung: dict[str, str],
            zeitlimit: int = 900) -> subprocess.CompletedProcess:
    return docker(["compose", "-p", name, "-f", str(COMPOSE_DATEI), *args], umgebung, zeitlimit)


def pruefe(ergebnis: subprocess.CompletedProcess, was: str) -> str:
    if ergebnis.returncode != 0:
        raise Abbruch(f"{was} gescheitert (Exit {ergebnis.returncode}):\n"
                      f"{(ergebnis.stderr or ergebnis.stdout).strip()}")
    return ergebnis.stdout


def _json_zeilen(ausgabe: str) -> list[dict[str, str]]:
    return [json.loads(z) for z in ausgabe.splitlines() if z.strip()]


def container_des_projekts(name: str) -> list[dict[str, str]]:
    """Alle Container (auch gestoppte) mit dem Compose-Label dieses Projekts."""
    ergebnis = docker(["ps", "-a", "--filter", f"label=com.docker.compose.project={name}",
                       "--format", "{{json .}}"])
    return _json_zeilen(pruefe(ergebnis, "docker ps"))


def volumes_des_projekts(name: str) -> list[dict[str, str]]:
    """Alle Volumes mit dem Compose-Label dieses Projekts.

    Bliebe ein altes `daten`-Volume liegen, startete die neue Instanz mit dessen Datenbank –
    darum prüft `bauen` auch hierauf, nicht nur auf Container.
    """
    ergebnis = docker(["volume", "ls", "--filter", f"label=com.docker.compose.project={name}",
                       "--format", "{{json .}}"])
    return _json_zeilen(pruefe(ergebnis, "docker volume ls"))


def traegt_marke(eintrag: dict[str, str]) -> bool:
    """`Labels` aus `docker ps/volume ls --format json` ist `k=v,k=v`."""
    labels = eintrag.get("Labels", "") or ""
    return any(teil.split("=", 1)[0] == MARKE for teil in labels.split(","))


def port_belegt(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


# ── HTTP ───────────────────────────────────────────────────────────────────


def http(methode: str, url: str, daten: dict | None = None, cookie: str | None = None,
         zeitlimit: float = 30, rumpf=None, kopf: dict[str, str] | None = None):
    """Eine Anfrage. Gibt (Status, JSON oder Text, Antwortkopf) zurück.

    Angemeldet wird per Cookie; `cookie` ist das fertige Paar `name=wert` aus `cookie_aus`
    (seit der Sitzungs-Umstellung heißt es `brickhub_access`, davor `access_token`).
    """
    kopfzeilen = {"Accept": "application/json", **(kopf or {})}
    if daten is not None:
        rumpf = json.dumps(daten).encode("utf-8")
        kopfzeilen["Content-Type"] = "application/json"
    if cookie:
        kopfzeilen["Cookie"] = cookie
    anfrage = urllib.request.Request(url, data=rumpf, headers=kopfzeilen, method=methode)
    try:
        with urllib.request.urlopen(anfrage, timeout=zeitlimit) as antwort:
            status, roh, koepfe = antwort.status, antwort.read(), antwort.headers
    except urllib.error.HTTPError as fehler:
        status, roh, koepfe = fehler.code, fehler.read(), fehler.headers
    except (urllib.error.URLError, OSError) as fehler:
        raise Abbruch(f"{methode} {url}: keine Antwort ({fehler})") from fehler
    text = roh.decode("utf-8", errors="replace")
    try:
        return status, json.loads(text), koepfe
    except ValueError:
        return status, text, koepfe


# Neuer Name zuerst; der alte bleibt, damit das Rezept auch ältere Images anmeldet.
ZUGANGS_COOKIES = ("brickhub_access", "access_token")


def cookie_aus(koepfe) -> str | None:
    """Zugangs-Cookie als `name=wert` aus den Set-Cookie-Zeilen der Anmeldung."""
    for zeile in (koepfe.get_all("Set-Cookie") or []) if koepfe is not None else []:
        keks = SimpleCookie()
        try:
            keks.load(zeile)
        except Exception:  # noqa: BLE001 – fremde Cookies dürfen nicht stören
            continue
        for name in ZUGANGS_COOKIES:
            if name in keks and keks[name].value:
                return f"{name}={keks[name].value}"
    return None


def warte_auf_gesundheit(basis: str, zeitlimit: int = START_ZEITLIMIT) -> None:
    """/api/health muss `{"status": "ok"}` liefern – ein Status 200 allein reicht nicht.

    Die SPA-Catch-All in main.py beantwortet jeden unbekannten Pfad mit index.html und 200.
    """
    ende = time.monotonic() + zeitlimit
    letzter = "keine Antwort"
    while time.monotonic() < ende:
        try:
            status, antwort, _ = http("GET", f"{basis}/api/health", zeitlimit=5)
            if status == 200 and isinstance(antwort, dict) and antwort.get("status") == "ok":
                return
            letzter = f"HTTP {status}"
        except Abbruch as fehler:
            letzter = str(fehler)
        time.sleep(2)
    raise Abbruch(f"/api/health nach {zeitlimit} s nicht gesund (zuletzt: {letzter})")


def warte_auf_app(name: str, basis: str, umgebung: dict[str, str]) -> None:
    """Wie warte_auf_gesundheit, bei Fehlschlag mit Zustand und Ende des Startlogs."""
    try:
        warte_auf_gesundheit(basis)
    except Abbruch as fehler:
        zusatz = []
        for args, titel in ((["ps", "-a", "app"], "Zustand"),
                            (["logs", "--no-color", "--tail", "60", "app"], "Startlog der App (Ende)")):
            try:
                ergebnis = compose(name, args, umgebung, zeitlimit=60)
                text = ((ergebnis.stdout or "") + (ergebnis.stderr or "")).strip()
            except Abbruch as folge:
                text = str(folge)
            zusatz.append(f"--- {titel} ---" + chr(10) + (text or "(leer)"))
        raise Abbruch(f"{fehler}" + chr(10) + chr(10).join(zusatz), fehler.code) from fehler


# ── Sicherung ──────────────────────────────────────────────────────────────


def _sicherungs_name(ordner: Path) -> str:
    # Der Leitstand (`backlog.py testinstanz bauen`) legt den Ordner unter dem Originalnamen der
    # Sicherung an – bei BrickHub ist das die ZIP selbst, also MIT ".zip" (gefunden BH-6, 25.11.2026).
    # Von Hand angelegt heißt er ohne Endung. Beides gilt; die ZIP darin heißt immer <name>.zip.
    return ordner.name[:-4] if ordner.name.endswith(".zip") else ordner.name


def zip_der_sicherung(ordner: Path) -> Path:
    return ordner / f"{_sicherungs_name(ordner)}.zip"


def pruefe_sicherung(ordner: Path) -> dict[str, int]:
    """Prüft Ordner und ZIP und liest aus data.json, was ankommen muss.

    Öffnet die ZIP nur lesend. Gibt {"sets": n, "users": n, "boxes": n} zurück.
    """
    if not ordner.is_dir():
        raise Abbruch(f"--sicherung '{ordner}' ist kein Ordner", 2)
    if not SICHERUNGS_NAME.match(_sicherungs_name(ordner)):
        raise Abbruch("Der Sicherungsordner muss brickhub-auto-JJJJ-MM-TT_HH-MM heißen "
                      f"(wie die ZIP, mit oder ohne .zip), nicht '{ordner.name}'", 2)
    datei = zip_der_sicherung(ordner)
    if not datei.is_file():
        raise Abbruch(f"In '{ordner}' fehlt {datei.name}", 2)
    try:
        with zipfile.ZipFile(datei) as zf:
            daten = json.loads(zf.read("data.json"))
    except (zipfile.BadZipFile, KeyError, ValueError, OSError) as exc:
        raise Abbruch(f"{datei.name} ist keine lesbare BrickHub-Sicherung ({exc})", 2) from exc
    if not isinstance(daten, dict) or daten.get("version") != SICHERUNGS_VERSION:
        version = daten.get("version") if isinstance(daten, dict) else "?"
        raise Abbruch(f"{datei.name}: Sicherungs-Version {version}, die App kennt nur {SICHERUNGS_VERSION}", 2)
    mengen = {k: len(daten.get(k) or []) for k in ("sets", "users", "boxes")}
    if mengen["users"] == 0:
        # Ohne Benutzer stünde die Instanz nach dem Einspielen ohne Konto da – dann könnte jedes
        # Gerät im Netz per register-first-admin Admin werden und käme an die echten Sets.
        raise Abbruch(f"{datei.name} enthält keine Benutzer – so nicht einspielbar", 2)
    return mengen


def fingerabdruck(datei: Path) -> tuple[int, int]:
    """Größe und Änderungszeit – daran sieht man, dass die Kopie unverändert blieb."""
    info = datei.stat()
    return info.st_size, info.st_mtime_ns


def pruefe_ablageort(ordner: Path) -> None:
    pfad = str(ordner).replace(RUECKSTRICH, "/").lower()
    teile = [t for t in pfad.split("/") if t]
    repo = str(HIER.parent).replace(RUECKSTRICH, "/").lower()
    if (any(pfad.startswith(g) for g in GESPIEGELT)
            or any(t.startswith("onedrive") for t in teile)
            or pfad == repo or pfad.startswith(repo + "/")):
        raise Abbruch(f"Die Sicherung liegt in einem gespiegelten Ordner oder im Repo ('{ordner}') – "
                      "bitte außerhalb ablegen (z. B. unter %TEMP%) und danach löschen", 2)


def pruefe_name(name: str) -> None:
    if not PROJEKT_NAME.match(name):
        raise Abbruch(f"--name '{name}' ist kein gültiger Compose-Projektname "
                      "(klein, Ziffern, '-' und '_')", 2)
    if name in GESPERRTE_NAMEN:
        raise Abbruch(f"--name '{name}' ist der Name einer echten Installation – "
                      "bitte einen eigenen Namen wählen", 2)


def pruefe_docker_desktop() -> None:
    """Nur gegen Docker Desktop auf diesem PC – nie gegen einen fernen Docker.

    Zeigt DOCKER_HOST oder der Kontext z. B. auf den Unraid, landete die Instanz samt echter
    Sicherung dort (und `abraeumen` räumte dort ab).
    """
    system = pruefe(docker(["info", "--format", "{{.OperatingSystem}}"]), "docker info").strip()
    if "Docker Desktop" not in system:
        raise Abbruch(f"docker spricht nicht mit Docker Desktop auf diesem PC, sondern mit "
                      f"'{system}' (DOCKER_HOST/Kontext prüfen) – abgebrochen", 2)


# ── Wegwerf-Zugang ─────────────────────────────────────────────────────────


def wegwerf_passwort() -> str:
    """Erfüllt app/schemas/user.py: ≥ 8 Zeichen, groß, klein, Ziffer."""
    return "Hp" + secrets.token_hex(12) + "Z9"


def wegwerf_admin(basis: str) -> tuple[str, str, str]:
    """Legt den ersten Admin an und meldet ihn an. Gibt (Benutzer, Passwort, Cookie) zurück."""
    melde("Lege Wegwerf-Admin an …")
    # Zufälliger Name: Hieße ein Konto der Sicherung genauso, übersprünge das Einspielen es
    # (users_skipped), und der Wegwerf-Admin bliebe mit unbekanntem Passwort stehen.
    benutzer, passwort = f"handprobe-{secrets.token_hex(4)}", wegwerf_passwort()
    fragen = [{"question": f"Wegwerf-Frage {i}", "answer": secrets.token_hex(8)} for i in (1, 2, 3)]
    status, antwort, _ = http("POST", f"{basis}/api/auth/register-first-admin", {
        "username": benutzer, "password": passwort, "password_confirm": passwort,
        "role": "admin", "security_questions": fragen,
    })
    if status == 403:
        raise Abbruch("Erster Admin war schon vergeben, bevor das Rezept ihn anlegen konnte – "
                      "jemand anderes hat die frische Instanz übernommen. Abräumen und neu bauen.")
    if status != 200:
        raise Abbruch(f"POST /api/auth/register-first-admin: HTTP {status} {antwort}")
    melde("Melde den Wegwerf-Admin an …")
    status, antwort, koepfe = http("POST", f"{basis}/api/auth/login",
                                   {"username": benutzer, "password": passwort})
    cookie = cookie_aus(koepfe) if status == 200 else None
    if not cookie:
        raise Abbruch(f"POST /api/auth/login: HTTP {status} {antwort} (ohne Zugangs-Cookie)")
    return benutzer, passwort, cookie


def sicherungsplan_aus(basis: str, cookie: str) -> None:
    melde("Schalte die automatische Sicherung ab …")
    status, antwort, _ = http("PUT", f"{basis}/api/backup/schedule", {"backup_enabled": "false"}, cookie=cookie)
    if status != 200 or not isinstance(antwort, dict) or antwort.get("backup_enabled") != "false":
        raise Abbruch(f"PUT /api/backup/schedule: HTTP {status} {antwort}")


# ── Einspielen ─────────────────────────────────────────────────────────────


def multipart(datei: Path, grenze: str) -> tuple[list[bytes], int]:
    """Kopf und Fuß des Uploads (Feld `file`) und die Gesamtlänge – der Inhalt wird gestreamt."""
    kopf = (b"--" + grenze.encode("ascii") + CRLF
            + b'Content-Disposition: form-data; name="file"; filename="' + datei.name.encode("utf-8") + b'"' + CRLF
            + b"Content-Type: application/zip" + CRLF + CRLF)
    fuss = CRLF + b"--" + grenze.encode("ascii") + b"--" + CRLF
    return [kopf, fuss], len(kopf) + datei.stat().st_size + len(fuss)


def upload_strom(datei: Path, kopf: bytes, fuss: bytes, stueck: int = 1024 * 1024):
    yield kopf
    with open(datei, "rb") as f:  # nur lesen – die Kopie bleibt unverändert
        while True:
            teil = f.read(stueck)
            if not teil:
                break
            yield teil
    yield fuss


def starte_einspielen(basis: str, cookie: str, datei: Path) -> str:
    grenze = "handprobe" + secrets.token_hex(16)
    (kopf, fuss), laenge = multipart(datei, grenze)
    melde(f"Lade {datei.name} ({laenge / 2**20:.0f} MB) hoch und spiele ein (Modus replace) …")
    status, antwort, _ = http(
        "POST", f"{basis}/api/backup/import/start?mode=replace", cookie=cookie,
        rumpf=upload_strom(datei, kopf, fuss), zeitlimit=UPLOAD_ZEITLIMIT,
        kopf={"Content-Type": f"multipart/form-data; boundary={grenze}", "Content-Length": str(laenge)},
    )
    if status != 200 or not isinstance(antwort, dict) or not antwort.get("task_id"):
        raise Abbruch(f"POST /api/backup/import/start: HTTP {status} {antwort}")
    return antwort["task_id"]


def sse_ereignisse(zeilen):
    """Liest `data: {…}`-Zeilen eines Event-Streams und liefert die JSON-Objekte."""
    for roh in zeilen:
        zeile = roh.decode("utf-8", errors="replace").strip() if isinstance(roh, bytes) else roh.strip()
        if zeile.startswith("data:"):
            try:
                yield json.loads(zeile[5:].strip())
            except ValueError:
                continue


def anmelden(basis: str, benutzer: str, passwort: str) -> str | None:
    """Meldet an und gibt das Zugangs-Cookie zurück; None, wenn es das Konto nicht (mehr) gibt."""
    status, _, koepfe = http("POST", f"{basis}/api/auth/login", {"username": benutzer, "password": passwort})
    return cookie_aus(koepfe) if status == 200 else None


def warte_auf_einspielen(basis: str, cookie: str, aufgabe: str,
                         zeitlimit: int = EINSPIELEN_ZEITLIMIT,
                         neu_anmelden=None) -> dict | None:
    """Folgt dem Fortschritt bis `done` oder `error`. Gibt `result` zurück.

    Der Strom der App endet nach 20 Minuten von selbst; dann wird neu verbunden. Antwortet die
    App beim Neuverbinden mit 401, ist das Einspielen schon übernommen (der Wegwerf-Admin ist mit
    den alten Benutzern gelöscht) – dann `None`, und die Prüfung in der Datenbank entscheidet.
    """
    ende = time.monotonic() + zeitlimit
    zuletzt = ""
    frisch_angemeldet = False
    while time.monotonic() < ende:
        anfrage = urllib.request.Request(f"{basis}/api/backup/import/progress/{aufgabe}",
                                         headers={"Cookie": cookie,
                                                  "Accept": "text/event-stream"})
        try:
            with urllib.request.urlopen(anfrage, timeout=120) as antwort:
                frisch_angemeldet = False
                for ereignis in sse_ereignisse(antwort):
                    zustand = ereignis.get("status")
                    text = f"{ereignis.get('phase', '')} {ereignis.get('current', 0)}/{ereignis.get('total', 0)}"
                    if text != zuletzt and ereignis.get("phase") == "extracting" and ereignis.get("current", 0) % 200 == 0:
                        melde(f"  Einspielen: Bilder {ereignis.get('current')} / {ereignis.get('total')}")
                    zuletzt = text
                    if zustand == "done":
                        return ereignis.get("result") or {}
                    if zustand == "error":
                        raise Abbruch(f"Einspielen gescheitert: {ereignis.get('error')}")
        except urllib.error.HTTPError as fehler:
            if fehler.code == 401:
                # Das Zugangs-Token gilt nur 15 min, der Strom endet nach 20: Ein 401 kann auch
                # nur „abgelaufen“ heißen. Klappt die Anmeldung noch, läuft das Einspielen weiter.
                neu = neu_anmelden() if (neu_anmelden and not frisch_angemeldet) else None
                if neu:
                    melde("  Zugang abgelaufen – neu angemeldet, verfolge weiter …")
                    cookie, frisch_angemeldet = neu, True
                    continue
                melde("  Fortschritt nicht mehr abrufbar (401) – Benutzer sind schon ersetzt, prüfe in der Datenbank.")
                return None
            raise Abbruch(f"Fortschritt des Einspielens: HTTP {fehler.code}") from fehler
        except (urllib.error.URLError, OSError) as fehler:
            melde(f"  Fortschritt unterbrochen ({fehler}), verbinde neu …")
            time.sleep(2)
    raise Abbruch(f"Einspielen nach {zeitlimit} s nicht fertig gemeldet")


# Prüfung in der Datenbank des Containers. Ohne Backslashes, Benutzer kommt als Argument.
PRUEF_PY = (
    "import json, sqlite3, sys; "
    "from app.config import settings; "
    "c = sqlite3.connect(settings.database_url.replace('sqlite:///', '')); "
    "q = lambda s, *a: c.execute(s, a).fetchone(); "
    "w = q('select value from settings where key = ?', 'backup_enabled'); "
    "print(json.dumps({'sets': q('select count(*) from sets')[0], "
    "'users': q('select count(*) from users')[0], "
    "'boxes': q('select count(*) from boxes')[0], "
    "'admins': q('select count(*) from users where role = ?', 'admin')[0], "
    "'wegwerf': q('select count(*) from users where username = ?', sys.argv[1])[0], "
    "'backup_enabled': w[0] if w else None, "
    "'ollama_enabled': bool(settings.ollama_enabled)}))"
)


def stand_in_der_datenbank(name: str, umgebung: dict[str, str], benutzer: str) -> dict:
    ausgabe = pruefe(compose(name, ["exec", "-T", "app", "python", "-c", PRUEF_PY, benutzer], umgebung,
                             zeitlimit=120), "Prüfen in der Datenbank")
    try:
        return json.loads(ausgabe.strip().splitlines()[-1])
    except (IndexError, ValueError) as exc:
        raise Abbruch(f"Prüfung in der Datenbank lieferte kein JSON: '{ausgabe.strip()}'") from exc


def bewerte_stand(stand: dict, erwartet: dict[str, int]) -> None:
    """Wirft, wenn etwas nicht angekommen ist oder noch an ist."""
    fehler = []
    for art in ("sets", "users", "boxes"):
        if stand.get(art) != erwartet[art]:
            fehler.append(f"{art}: {stand.get(art)} statt {erwartet[art]} wie in der Sicherung")
    if stand.get("wegwerf") != 0:
        fehler.append("der Wegwerf-Admin ist noch da (Einspielen nicht übernommen?)")
    if not stand.get("admins"):
        fehler.append("kein Admin unter den eingespielten Benutzern")
    if stand.get("backup_enabled") != "false":
        fehler.append(f"automatische Sicherung nicht aus ({stand.get('backup_enabled')!r})")
    if stand.get("ollama_enabled") is not False:
        fehler.append("Ollama ist an")
    if fehler:
        raise Abbruch("Nach dem Einspielen: " + "; ".join(fehler))


def notbremse(name: str, umgebung: dict[str, str]) -> None:
    """Nach einem Fehler ab dem Upload: App anhalten.

    Die Instanz kann dann echte Daten halb eingespielt tragen. Sie bleibt zur Diagnose stehen,
    aber nicht erreichbar im Netz.
    """
    try:
        compose(name, ["stop", "app"], umgebung, zeitlimit=120)
    except Exception as folge:  # noqa: BLE001 – nur melden, den ursprünglichen Fehler nicht verdecken
        melde(f"  stop app: {folge}")


# ── Befehle ────────────────────────────────────────────────────────────────


def bauen(name: str, port: int, image: str, sicherung: Path) -> None:
    pruefe_name(name)
    if not 1 <= port <= 65535:
        raise Abbruch(f"--port {port} liegt außerhalb 1..65535", 2)
    if not image:
        raise Abbruch("--image fehlt (BrickHub hat ein Dockerfile in der Wurzel, das Image baut der Skill)", 2)
    erwartet = pruefe_sicherung(sicherung)
    pruefe_ablageort(sicherung)
    datei = zip_der_sicherung(sicherung)
    vorher = fingerabdruck(datei)
    pruefe_docker_desktop()
    if container_des_projekts(name) or volumes_des_projekts(name):
        raise Abbruch(f"Projekt '{name}' hat schon Container oder Volumes – erst "
                      f"`abraeumen --name {name}` oder einen anderen Namen wählen", 2)
    if port_belegt(port):
        raise Abbruch(f"Port {port} ist schon belegt", 2)
    ergebnis = docker(["image", "inspect", "--format", "{{.Id}}", image])
    if ergebnis.returncode != 0:
        raise Abbruch(f"Image '{image}' gibt es lokal nicht – erst bauen bzw. bewusst ziehen", 2)
    image_id = ergebnis.stdout.strip()

    umgebung = compose_umgebung(image, port, secrets.token_hex(32))
    basis = f"http://127.0.0.1:{port}"
    melde(f"Starte Projekt '{name}' (Image {image} = {image_id[:19]}, Port {port}) …")
    pruefe(compose(name, ["up", "-d", "app"], umgebung), "Start der App")
    warte_auf_app(name, basis, umgebung)
    melde("App antwortet.")

    benutzer, passwort, cookie = wegwerf_admin(basis)
    sicherungsplan_aus(basis, cookie)

    try:
        aufgabe = starte_einspielen(basis, cookie, datei)
        ergebnis_app = warte_auf_einspielen(basis, cookie, aufgabe,
                                            neu_anmelden=lambda: anmelden(basis, benutzer, passwort))
        if ergebnis_app is not None:
            melde(f"  App meldet: {ergebnis_app}")
            if ergebnis_app.get("users_skipped"):
                raise Abbruch(f"Einspielen übersprang {ergebnis_app['users_skipped']} Benutzer")
        stand = stand_in_der_datenbank(name, umgebung, benutzer)
        melde(f"Datenbank: {stand['sets']} Sets, {stand['boxes']} Kisten, {stand['users']} Benutzer.")
        bewerte_stand(stand, erwartet)
        if fingerabdruck(datei) != vorher:
            raise Abbruch(f"Die Sicherungskopie {datei} hat sich während des Baus verändert")
    except BaseException:
        melde("Fehler ab dem Einspielen – halte die App an …")
        notbremse(name, umgebung)
        raise

    melde(f"Fertig: http://localhost:{port} – Anmeldung mit den Zugangsdaten aus der Sicherung.")
    melde("Automatische Sicherung und Ollama sind aus.")
    melde(f"Abräumen: python -I handprobe/testinstanz.py abraeumen --name {name}")


def abraeumen(name: str) -> None:
    """Entfernt die Instanz samt Volumes. Die Sicherungskopie gehört dem Aufrufer und bleibt."""
    pruefe_name(name)
    pruefe_docker_desktop()
    container = container_des_projekts(name)
    volumes = volumes_des_projekts(name)
    fremde = ([c.get("Names", "?") for c in container if not traegt_marke(c)]
              + [v.get("Name", "?") for v in volumes if not traegt_marke(v)])
    if fremde:
        raise Abbruch(f"Projekt '{name}' ist keine Testinstanz (ohne Marke {MARKE}: "
                      f"{', '.join(fremde)}) – nichts entfernt", 2)
    # Platzhalter: `down` braucht die Variablen nur, damit die Datei gültig ist.
    umgebung = compose_umgebung("platzhalter", 1, "platzhalter")
    melde(f"Entferne Projekt '{name}' samt Volumes …")
    pruefe(compose(name, ["down", "-v", "--remove-orphans"], umgebung), "docker compose down -v")
    rest = ([c.get("Names", "?") for c in container_des_projekts(name)]
            + [v.get("Name", "?") for v in volumes_des_projekts(name)])
    if rest:
        raise Abbruch(f"Nach dem Abräumen steht noch: {', '.join(rest)}")
    melde("Abgeräumt.")


def main(argv: list[str] | None = None) -> int:
    try:
        # In einer Umleitung (Agent, Log) sonst cp1252 – Umlaute kämen zerlegt an.
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass
    parser = argparse.ArgumentParser(prog="testinstanz.py",
                                     description="BrickHub-Testinstanz für die Handprobe bauen oder abräumen.")
    unter = parser.add_subparsers(dest="befehl", required=True)
    p_bauen = unter.add_parser("bauen")
    p_bauen.add_argument("--name", required=True)
    p_bauen.add_argument("--port", required=True, type=int)
    p_bauen.add_argument("--image", required=True)
    p_bauen.add_argument("--sicherung", required=True, type=Path)
    p_ab = unter.add_parser("abraeumen")
    p_ab.add_argument("--name", required=True)
    # Der Leitstand ruft beide Befehle mit denselben Angaben – beim Abräumen werden sie angenommen, nicht gebraucht.
    p_ab.add_argument("--port", help=argparse.SUPPRESS)
    p_ab.add_argument("--image", help=argparse.SUPPRESS)
    p_ab.add_argument("--sicherung", help=argparse.SUPPRESS)
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return 2 if exc.code else 0

    try:
        if args.befehl == "bauen":
            bauen(args.name, args.port, args.image, args.sicherung.resolve())
        else:
            abraeumen(args.name)
    except Abbruch as fehler:
        melde(f"FEHLER: {fehler}")
        if args.befehl == "bauen" and fehler.code == 1:
            melde(f"Die Instanz bleibt zur Diagnose stehen. Abräumen: "
                  f"python -I handprobe/testinstanz.py abraeumen --name {args.name}")
        return fehler.code
    return 0


if __name__ == "__main__":
    sys.exit(main())
