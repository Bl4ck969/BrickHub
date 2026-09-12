# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sprache

Alle Kommunikation und Kommentare auf Deutsch.

## Entwicklungsumgebung starten

```bash
# Beide Server gleichzeitig (Windows) – Menü mit Start/Stop/Restart/Status
.\brickhub.bat

# Oder einzeln:
# Backend (aus backend/)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (aus frontend/)
npm run dev   # Port 5173
```

Backend-API-Docs: http://localhost:8000/docs

Die lokale `backend/data/database.db` enthält **Echtdaten, keine Testaccounts**. Wer für
einen UI-Test einen Login braucht, legt einen temporären Benutzer an und löscht ihn danach
(`app.utils.auth.hash_password`, Tabelle `users`, Spalte `password_hash`, `created_at` ist
NOT NULL) — vorhandene Konten und deren Passwörter bleiben unangetastet.

## Build & Deployment

```bash
# Frontend Build
cd frontend && npm run build      # Output: frontend/dist/

# Docker lokal zum Ausprobieren (Port 8080)
docker-compose up -d
```

**Produktion läuft auf Unraid und wird NICHT über docker-compose deployt.** Der Weg ist:
Push auf `main` → GitHub Actions baut `ghcr.io/bl4ck969/brickhub:latest` → im Unraid-Docker-UI
auf „Update" klicken. Maßgeblich ist dort das **Template**, nicht `docker-compose.yml`:

- Repo: `BrickHub-unraid-template.xml` · Server: `/boot/config/plugins/dockerMan/templates-user/my-Brickhub.xml`
- Beide bei jeder Änderung an Env, Mount, Port oder ExtraParams **gemeinsam** pflegen —
  was nur in `docker-compose.yml` steht, geht beim GUI-Update still verloren
- Vor Releases den Skill `unraid-container-deployment` verwenden
- **`<Icon>` zeigt seit 08.08.2026 auf `http://192.168.178.95:8049/logo.png`** — der Container
  liefert sein Logo selbst aus. Die frühere `raw.githubusercontent`-URL funktionierte nur, weil
  BrickHub als einziges eigenes Repo **öffentlich** ist; bei den privaten Repos (AllMyBooks,
  AllMyMovies) antwortet GitHub 404 und die Kachel bekommt ein Fragezeichen. Damit hängt das Icon
  hier nicht mehr am Repo-Zustand, und alle eigenen Container folgen demselben Muster.
  ⚠ `[IP]`/`[PORT:…]` werden im Icon-Feld **nicht** ersetzt (nur in `<WebUI>`), Host-Pfade kann
  Unraid gar nicht — es holt das Icon per curl. Details: Skill `unraid-container-deployment`, Pflicht 5

## Lint

```bash
cd frontend && npx eslint src/
```

`npx eslint src/` meldet aktuell **21 Errors und 5 Warnings** — Bestand, kein Ergebnis
der letzten Änderung. Die Zahl ist seit dem Sprung auf **eslint 10** (12.09.2026) höher:
`eslint-plugin-react-hooks` 7.x bringt die React-Compiler-Regeln `static-components`,
`set-state-in-effect`, `purity`, `immutability` und `incompatible-library` mit, die
vorbestehende Muster zum ersten Mal melden. Sie sind bewusst **nicht** stummgeschaltet.

⚠ **Lint läuft weder im Dockerfile noch in GitHub Actions** — er bricht also nichts.
Wer die Zahl senken will, fasst Code an, nicht die Konfiguration.

## Rauchtest

```bash
cd tests && npm install          # einmalig
BH_USER=<benutzer> BH_PASS=<passwort> npm test
```

Prüft mit **echten Klicks** gegen die laufende Entwicklungsumgebung (beide Server nötig):
Anmeldung, Sortierung, Inline-Bearbeitung **inklusive belegtem `PATCH`**, Status- und
Kistenauswahl, Bild-Vergrößerung, Galerie, Theme, alle sechs Navigationsziele und die
schmale Ansicht. Details und Grenzen in `tests/README.md`.

⚠ **Der Test schreibt einen Wert in die Datenbank und setzt ihn zurück.** Meldet er
`Testwert zurückgesetzt — BITTE PRÜFEN`, von Hand nachsehen. Für das Konto gilt die
Regel oben: temporären Benutzer anlegen, danach löschen.

⚠ **Playwright liegt in `tests/`, nicht in `frontend/`** — das Dockerfile kopiert
`frontend/` komplett und führt dort `npm ci` aus; in `frontend/package.json` würde
Playwright bei jedem Image-Bau mitinstalliert.

## Architektur

Monorepo mit getrenntem Python-Backend und React-Frontend. In Produktion (Docker) bedient FastAPI das gebaute Frontend als statische Dateien.

### Backend (FastAPI + SQLAlchemy + SQLite)

- **Einstieg**: `backend/app/main.py` – FastAPI-App mit NoCacheMiddleware, CORS, StaticFiles-Mount
- **Config**: `backend/.env` (nicht im Root!) → geladen über `backend/app/config.py` (Pydantic Settings).
  In Produktion kommt der `SECRET_KEY` aus `data/.env` auf dem persistenten Volume
- **Datenbank**: SQLite unter `backend/data/database.db` (NICHT brickhub.db)
- **Routers**: `backend/app/routers/` – auth, users, sets, boxes, images, labels, settings, backup (alle unter `/api/`)
- **Services**: `backend/app/services/` – image_service (rembg, OpenCV, Pillow), pdf_service (ReportLab), ollama_service, backup_scheduler
- **Auth-Flow**: bcrypt(rounds=12) + JWT/HS256 in HTTP-only Cookie. Dependencies: `get_current_user`, `require_admin`

> ⚠️ **Routen-Reihenfolge:** Am Ende von `main.py` steht die SPA-Catch-All
> `@app.get("/{full_path:path}")`. Starlette prüft Routen in Registrierungsreihenfolge —
> **jede echte API-Route muss davor stehen**, sonst wird sie nie erreicht und liefert
> stumm `index.html` mit Status 200. Lokal fällt das nicht auf, weil `backend/frontend/dist`
> dort fehlt und der ganze Block übersprungen wird. Genau so war `/api/health` monatelang tot.

### Frontend (React 19 + Vite 8 + Tailwind 4)

- **Einstieg**: `frontend/src/main.jsx` → `App.jsx` (react-router v8, lazy-loaded Pages)
- **Router**: Paket heißt `react-router` (nicht `react-router-dom`). Genutzt wird nur der
  deklarative Modus – kein RSC, kein SSR, keine Loader/Actions
- **API-Client**: `frontend/src/api/client.js` – Axios mit `withCredentials: true`, 401-Interceptor, organisiert als `authApi`, `usersApi`, `setsApi`, `boxesApi`, `imagesApi`, `settingsApi`, `backupApi`, `labelsApi`
- **Auth**: `frontend/src/hooks/useAuth.jsx` (muss .jsx sein wegen JSX im Hook)
- **Proxy**: Vite leitet `/api` → `http://localhost:8000` weiter (konfiguriert in `vite.config.js`)
- **Navigation**: `components/Sidebar.jsx` (seit 2.0 eine Seitenleiste, keine Navbar mehr).
  Die `adminOnly`-Marken je Punkt sind dieselben wie vorher — wer dort etwas ändert,
  ändert die Sichtbarkeit für Nicht-Admins
- **Gerüste**: `components/PageShell.jsx` (Seiten hinter der Anmeldung) und
  `components/AuthShell.jsx` (Anmeldung, Ersteinrichtung, Passwort vergessen/ändern).
  Jede Seite nutzt eins davon — wer eine neue anlegt, auch
- **Theme**: `hooks/useTheme.jsx` plus ein Inline-Skript im `<head>` von `index.html`.
  ⚠ Das Skript muss **vor** React laufen, sonst blitzt beim Laden das falsche Theme auf

> **Ohne laufendes Backend bleibt die App dauerhaft im Suspense-Spinner.** Das ist kein
> Fehler, sondern der fehlende Auth-Call. Wer eine UI-Änderung prüfen will, braucht beide
> Server — ein reiner `npm run preview` zeigt nie mehr als den Spinner.

### Datenfluss Bilder

1. Upload-Raw → `save_original()` → Auto-Eckenerkennung (`detect_corners` via OpenCV)
2. User platziert Ecken im `ImageEditor.jsx` Canvas
3. Preview → `apply_perspective_transform()` + optional `apply_rotation()`
4. Finalize → `finalize_image()`: rembg Hintergrundentfernung → Skalierung → Thumbnail
5. DB speichert 6 Pfade pro Set: `{front,back}cover_{original,edited,thumbnail}`

> ⚠ **Der Editor zeichnet beim Öffnen nichts, wenn das Bild kleiner ist als der
> verfügbare Platz** (gemessen 12.09.2026, besteht schon vor dem Design-Umbau).
> `baseScale` startet auf `1`; im `img.onload` wird
> `s = Math.min(verfügbar/Breite, verfügbar/Höhe, 1)` berechnet. Passt das Bild
> vollständig hinein, ist `s` **exakt 1** — `setBaseScale(1)` auf den bereits
> gesetzten Wert löst **kein Rerender** aus, und
> `useEffect(() => drawCanvas(), [corners, scale, drawCanvas])` läuft nie.
> Die Leinwand bleibt leer, bis man Zoom oder Rotation anfasst.
>
> Gerechnet: ein 600×450-Original ergibt `s = 1` (kaputt), ein Handyfoto
> 3024×4032 ergibt `s = 0,127` (läuft). Deshalb fällt es im Alltag kaum auf —
> abfotografierte Verpackungen sind groß. **Fix wäre, `drawCanvas()` im `onload`
> direkt anzustoßen**, statt sich auf das Rerender durch `setBaseScale` zu verlassen.
> Noch offen.

### PDF-Generierung

- `pdf_service.py` nutzt ReportLab Canvas API + Platypus Flowables
- Logo-Pfad: `BrickHub/Logo.png` (Projektroot, nicht backend/)

## Design-System (2.0, seit 12.09.2026)

**Es gibt keine `tailwind.config.js` mehr.** Tailwind 4 konfiguriert sich in CSS —
alles steht in `frontend/src/index.css`:

- **Semantische Tokens** in `:root` und `.dark` (Präfix `--bh-`), durchgereicht über
  `@theme inline`. ⚠ Das `inline` ist Pflicht: Ohne es friert Tailwind den Wert ein
  und der Dunkelmodus bleibt wirkungslos
- **Farben nie hart schreiben.** `bg-surface`, `text-ink`, `text-ink-2`, `text-ink-3`,
  `border-line`, `text-heading`, `bg-gold`, dazu `st-new|st-build|st-done|st-rest` für
  Status und `crit` für Kritisches. Ein `bg-white` oder `text-gray-500` in einer Seite
  ist ein Fehler — es bricht den Dunkelmodus
- **Markenfarben bleiben fest** (`brand-navy`, `brand-yellow`, `rail-*`): Die
  Seitenleiste ist in beiden Modi dunkel, und Text auf gelbem Grund bleibt dunkel.
  Diese dürfen **nicht** semantisch umschlagen
- **Komponenten-Klassen** (`@utility`): `.btn-primary`, `.btn-secondary`, `.btn-danger`,
  `.btn-yellow`, `.input-field`, `.card`, `.panel`, `.table-th`, `.table-td`,
  `.table-row`, `.status-pill`, `.eyebrow`, `.studs-bg`. Die Namen sind dieselben wie in
  1.0 — wer sie ändert, ändert das Aussehen aller Seiten auf einmal
- **Schrift**: Archivo (Überschriften und Zahlen), IBM Plex Sans (Oberfläche),
  IBM Plex Mono (Herstellernummern — das sind Codes)
- **Steinart-Farben** kommen aus `src/lib/stein.js`, damit dieselbe Farbe überall
  dieselbe Steinart meint. Nicht dupliziert werden
- **Dunkelmodus** hängt an der Klasse `dark` auf `<html>`, gesetzt vom Startskript aus
  gemerkter Wahl oder Systemeinstellung
- Icons: `@heroicons/react` v2 (outline); die drei isometrischen Kennzahl-Icons in
  `components/BrickIcons.jsx`
- Entwürfe mit Begründungen: `docs/design-2.0-mockup.html` (Gesamtbild) und
  `docs/statistikleiste-varianten.html` (sechs Varianten der Kennzahlenleiste,
  umgesetzt ist **A — eine Zeile**)

## Screenshots für die README

Liegen in `docs/screenshots/`. Die der **Weboberfläche** wurden am 12.09.2026 auf
2.0 neu aufgenommen; `pdf-export.png` und `schilder.png` zeigen erzeugte **PDFs**
und bleiben unverändert, solange `pdf_service.py` sich nicht ändert.

Aufgenommen mit Playwright aus `tests/` (nutzt den installierten Edge). Muster:
anmelden, navigieren, `page.screenshot()`. Zwei Dinge, die dabei Zeit gekostet haben:

- **Ein Login je Screenshot ist zu fragil** — nach fünf Kontexten lief der
  nächste in einen Timeout. Eine Sitzung nehmen und darin navigieren; das Theme
  über `localStorage` plus `reload()` umschalten.
- **Der Bildeditor braucht einen Anstoß**, sonst bleibt die Leinwand leer (siehe
  Warnung unter „Datenfluss Bilder“): Zoom „+“ klicken, dann „Reset“ auf 100 %.

## Docker-Image

- Zwei Stufen: `node:22-alpine` baut das Frontend, `python:3.12-slim` serviert es.
  **Node 22 ist Pflicht** – react-router 8 verlangt ≥22.22.0, Vite 8 mindestens
  `^20.19 || >=22.12`. Node 20 ist seit April 2026 EOL
- **`curl` ist im Image NICHT installiert** (nur libglib, libgl, libgomp, tzdata).
  Alles, was im Container HTTP sprechen muss, geht über Python
- Der `HEALTHCHECK` steht bewusst im **Dockerfile**, nicht in den Template-ExtraParams –
  im Image überlebt er ein GUI-Update. Er prüft den **JSON-Inhalt** von `/api/health`,
  nicht nur den Statuscode: Die SPA-Catch-All liefert für jeden Pfad 200, ein
  Statuscode-Check wäre immer „gesund"
- Läuft als non-root (`brickhub`, uid 1000)

## Wichtige Konventionen

- Bildpfade in DB sind relativ zu `backend/`: `data/uploads/{Hersteller - SetName}/...`
- Dateiname-Prefix "Thumbmail" (Schreibfehler, nicht ändern ohne DB-Migration)
- `API_BASE = ''` in dev (Proxy), FastAPI bedient Frontend statisch in Prod
- `imagesApi.fileUrl()` hat keinen Cache-Buster eingebaut – Pages nutzen `&t=Date.now()` manuell
- Inline-Updates: `PATCH /api/sets/{id}/inline` akzeptiert nur: status, bag_count, plate_count, box_id, notes
- Box mit `allowed_stone_types = []` → kompatibel mit allen Steinarten

---

## Geheimnisse gehören NICHT in diesen Ordner — seit 21.08.2026

**Dieser Projektordner wird per Syncthing auf den Unraid gespiegelt**, und dort
läuft seit dem 21.08.2026 eine **Claude-Agent-VM**, die diese Dateien unter
`/workspace` liest. Alles, was hier liegt, ist damit für einen Agenten lesbar.

**Was an dem Tag gefunden wurde** (adversariales Sicherheitsreview): Im
gespiegelten Ordner lagen der **Unraid-Root-Schlüssel**, ein **GitHub-PAT**, der
`THALIA_PASSWORD_KEY` (AES-256-Master), Tolino-OAuth-Token, der Paperless-Token
sowie sämtliche Datenbank- und JWT-Geheimnisse. Der Agent konnte sich damit am
eigens gebauten Vermittler vorbei eine **Root-Shell auf dem Server** holen — im
Review vorgeführt.

**Daraus folgt für die Arbeit in diesem Projekt:**

* **Niemals** `.env`, private Schlüssel, `*.pem`, Token- oder Zugangsdateien in
  diesen Ordner schreiben. `.env.example` ohne Werte ist in Ordnung.
* Syncthing ignoriert im Ordner `Setups` inzwischen `**/.env`, `**/*.pem`,
  Schlüssel- und Token-Dateien. **Verlass dich nicht darauf** — das ist ein Netz,
  keine Erlaubnis, Geheimnisse hier abzulegen.
* Neue Zugangsdateien außerhalb des gespiegelten Ordners ablegen
  (Muster: `%USERPROFILE%\OneDrive\Dokumente\...-Secrets\`) und den Pfad per Umgebungsvariable hereinreichen.
* **Vor jedem neuen Dienst, der auf diesen Ordner zugreift**, prüfen, was darin
  tatsächlich liegt:
  `find . \( -name '.env' -o -name '*_key' -o -name '*.pem' -o -name '*token*' \) -not -path '*/node_modules/*'`

**Die Lehre:** Eine Zugangsschleuse ist nur so viel wert wie die Aussage „dort
liegt nichts Verwertbares". Genau diese Prüfung war beim Bau der VM versäumt
worden.

Vollständige Aufarbeitung: `Claude Agent Container/README.md` im selben Sync-Ordner.
