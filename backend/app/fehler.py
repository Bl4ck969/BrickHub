"""Zentrale Fehlerbehandlung: einheitliche Antwort {"detail": <deutscher Text>, "code": <KENNUNG>}.

Entscheidungen (BH-2):
- `detail` bleibt immer ein **Text**. Das Frontend (lib/fehler.js) und alle bisherigen
  HTTPException-Aufrufe erwarten das; FastAPIs Standard-422 liefert dort eine Liste von
  Objekten, die als React-Kind die Seite weiß machte.
- `code` ist eine stabile Kennung aus CODES. Neue Fehler: Eintrag im Katalog ergänzen und
  `AppFehler("KENNUNG")` werfen, statt deutschen Text in eine HTTPException zu schreiben.
- Unerwartete Ausnahmen werden mit Stacktrace protokolliert; der Nutzer sieht nur den
  allgemeinen Text (keine Interna).
- Ein `Exception`-Handler in Starlette läuft in der äußersten Middleware (ServerErrorMiddleware):
  Die Antwort trägt dort keine Security-Header der eigenen Middlewares.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

# Kennung -> (HTTP-Status, deutscher Text)
CODES: dict[str, tuple[int, str]] = {
    "VALIDIERUNG": (422, "Die Eingabe ist ungültig."),
    "NICHT_GEFUNDEN": (404, "Der Eintrag wurde nicht gefunden."),
    "KEIN_ZUGRIFF": (403, "Dafür fehlt die Berechtigung."),
    "KONFLIKT": (409, "Das ist zurzeit nicht möglich, weil es mit dem aktuellen Stand kollidiert."),
    "INTERN": (500, "Es ist ein unerwarteter Fehler aufgetreten. Bitte später noch einmal versuchen."),
}

FELDNAMEN = {
    "username": "Benutzername",
    "password": "Passwort",
    "new_password": "Neues Passwort",
    "old_password": "Altes Passwort",
    "email": "E-Mail",
    "name": "Name",
}

TYP_TEXTE = {
    "missing": "fehlt",
    "string_too_short": "ist zu kurz",
    "string_too_long": "ist zu lang",
    "string_type": "muss ein Text sein",
    "int_parsing": "muss eine ganze Zahl sein",
    "int_type": "muss eine ganze Zahl sein",
    "float_parsing": "muss eine Zahl sein",
    "bool_parsing": "muss Ja oder Nein sein",
    "greater_than": "ist zu klein",
    "greater_than_equal": "ist zu klein",
    "less_than": "ist zu groß",
    "less_than_equal": "ist zu groß",
    "json_invalid": "ist kein gültiges JSON",
}


class AppFehler(Exception):
    """Fachlicher Fehler mit Kennung aus CODES. `text` überschreibt den Katalogtext."""

    def __init__(self, code: str, text: str | None = None, status: int | None = None):
        if code not in CODES:
            raise ValueError(f"Unbekannter Fehlercode: {code}")
        self.code = code
        self.status = status or CODES[code][0]
        self.text = text or CODES[code][1]
        super().__init__(self.text)


def _antwort(status: int, code: str, text: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": text, "code": code, **extra})


def validierungstext(fehler: list[dict]) -> str:
    """Pydantic-Fehlerliste -> ein deutscher Satz (nie leer)."""
    teile = []
    for e in fehler:
        loc = [str(t) for t in e.get("loc", ()) if t not in ("body", "query", "path")]
        feld = FELDNAMEN.get(loc[-1], loc[-1]) if loc else None
        typ = str(e.get("type", ""))
        text = TYP_TEXTE.get(typ) or ("ist ungültig" if typ.startswith("value_error") else None)
        if feld and text:
            teile.append(f"{feld} {text}")
        elif feld:
            teile.append(f"{feld}: Eingabe ungültig")
    return "; ".join(dict.fromkeys(teile)) or CODES["VALIDIERUNG"][1]


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppFehler)
    async def _app_fehler(request: Request, exc: AppFehler):
        return _antwort(exc.status, exc.code, exc.text)

    @app.exception_handler(RequestValidationError)
    async def _validierung(request: Request, exc: RequestValidationError):
        return _antwort(422, "VALIDIERUNG", validierungstext(exc.errors()))

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        # Bestehende HTTPException(detail="…") bleiben unverändert im Text; nur der Code kommt dazu.
        code = {404: "NICHT_GEFUNDEN", 403: "KEIN_ZUGRIFF", 409: "KONFLIKT"}.get(exc.status_code, "HTTP")
        text = exc.detail if isinstance(exc.detail, str) else CODES.get(code, CODES["INTERN"])[1]
        resp = _antwort(exc.status_code, code, text)
        if exc.headers:
            resp.headers.update(exc.headers)
        return resp

    @app.exception_handler(Exception)
    async def _unerwartet(request: Request, exc: Exception):
        logger.exception("Unbehandelter Fehler bei %s %s", request.method, request.url.path)
        return _antwort(500, "INTERN", CODES["INTERN"][1])
