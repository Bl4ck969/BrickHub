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

Es gibt keine automatisierten Tests. `npx eslint src/` meldet aktuell 7 vorbestehende
Errors und 3 Warnings (unbenutzte `err`-Variablen, `exhaustive-deps`, ein
`react-refresh`-Hinweis) — die sind Bestand, kein Ergebnis der letzten Änderung.

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

### Frontend (React 19 + Vite 8 + Tailwind 3)

- **Einstieg**: `frontend/src/main.jsx` → `App.jsx` (react-router v8, lazy-loaded Pages)
- **Router**: Paket heißt `react-router` (nicht `react-router-dom`). Genutzt wird nur der
  deklarative Modus – kein RSC, kein SSR, keine Loader/Actions
- **API-Client**: `frontend/src/api/client.js` – Axios mit `withCredentials: true`, 401-Interceptor, organisiert als `authApi`, `usersApi`, `setsApi`, `boxesApi`, `imagesApi`, `settingsApi`, `backupApi`, `labelsApi`
- **Auth**: `frontend/src/hooks/useAuth.jsx` (muss .jsx sein wegen JSX im Hook)
- **Proxy**: Vite leitet `/api` → `http://localhost:8000` weiter (konfiguriert in `vite.config.js`)

> **Ohne laufendes Backend bleibt die App dauerhaft im Suspense-Spinner.** Das ist kein
> Fehler, sondern der fehlende Auth-Call. Wer eine UI-Änderung prüfen will, braucht beide
> Server — ein reiner `npm run preview` zeigt nie mehr als den Spinner.

### Datenfluss Bilder

1. Upload-Raw → `save_original()` → Auto-Eckenerkennung (`detect_corners` via OpenCV)
2. User platziert Ecken im `ImageEditor.jsx` Canvas
3. Preview → `apply_perspective_transform()` + optional `apply_rotation()`
4. Finalize → `finalize_image()`: rembg Hintergrundentfernung → Skalierung → Thumbnail
5. DB speichert 6 Pfade pro Set: `{front,back}cover_{original,edited,thumbnail}`

### PDF-Generierung

- `pdf_service.py` nutzt ReportLab Canvas API + Platypus Flowables
- Logo-Pfad: `BrickHub/Logo.png` (Projektroot, nicht backend/)

## Design-System

- Navy `#1E3A5F` (Navbar, Buttons, Überschriften), Yellow `#FFD700` (Akzent, aktive Links)
- CSS-Klassen: `.input-field`, `.btn-primary`, `.btn-danger`, `.card`, `.table-th`, `.table-td`
- Icons: `@heroicons/react` v2 (outline)

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
