# Fehlerbehandlung (BH-2, 25.11.2026)

## Backend – `backend/app/fehler.py`

- Jede Fehlerantwort ist `{"detail": <deutscher Text>, "code": <KENNUNG>}`. **`detail` ist immer ein Text.**
  FastAPIs Standard-422 liefert dort eine Liste von Objekten; als React-Kind gerendert machte das die Seite weiß.
- Neue fachliche Fehler: Kennung in `CODES` eintragen und `raise AppFehler("KENNUNG")` (optional eigener Text),
  nicht mehr deutschen Text in eine `HTTPException` schreiben. Vorhandene `HTTPException(detail="…")` laufen
  unverändert weiter (Text bleibt, nur `code` kommt dazu) und wurden nicht umgebaut.
- Unerwartete Ausnahmen: Stacktrace im Log (`logger.exception`), Nutzer sieht nur den allgemeinen Text.
  ⚠ Der `Exception`-Handler läuft in Starlettes äußerster Middleware – diese Antworten tragen die Header aus
  `SecurityHeadersMiddleware` nicht.
- Tests: `cd backend && python -m unittest discover -s tests` (nur fastapi + httpx nötig; importiert `app.main` bewusst nicht).

## Frontend

- `src/lib/fehler.js` → `fehlerText(err, 'Fallback')` macht aus jedem axios-Fehler einen Text (422-Liste,
  Zeitüberschreitung, Netzfehler). **Nie mehr `err.response?.data?.detail` direkt in `setError`/`toast`.**
  Test: `node --test src/lib/fehler.test.js`.
- `fehlerOderMeldung(err, 'Fallback')` dort, wo axios-Fehler und eigene `new Error('…')` im selben `catch` landen
  (Backup-Seite: Start per axios, Fortschritt per EventSource). ⚠ `err.message` eines axios-Fehlers ist englisch
  („Request failed with status code 409“) – so verschluckte die Backup-Seite die deutsche Sperr-Meldung (Review BH-6).
- ⚠ Der Riegel aus BH-3 (ein Import/Export gleichzeitig) gilt nur für Export/Import von Hand; automatische Sicherung
  und „Jetzt sichern“ (`backup_scheduler._create_backup`) prüfen ihn nicht.
- `components/ErrorBoundary.jsx`: eine Grenze um den Inhalt neben der Seitenleiste (setzt sich beim
  Seitenwechsel zurück), eine äußere für Seiten ohne Seitenleiste.
- `api/client.js`: Zeitgrenze 300 s – bewusst großzügig, weil Bild-Finalisierung (rembg), PDF-Export und
  Backup-Import legitim lange dauern. Ausnahme `backupApi.startImport`: `timeout: 0` (Upload einer ~600-MB-Sicherung).
  Die Backup-Fortschritts-Verbindung (SSE) läuft nicht über axios.
