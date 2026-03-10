# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sprache

Alle Kommunikation und Kommentare auf Deutsch.

## Entwicklungsumgebung starten

```bash
# Beide Server gleichzeitig (Windows)
.\start-dev.bat

# Oder einzeln:
# Backend (aus backend/)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (aus frontend/)
npm run dev   # Port 5173
```

Backend-API-Docs: http://localhost:8000/docs

## Build & Deployment

```bash
# Frontend Build
cd frontend && npm run build      # Output: frontend/dist/

# Docker (Produktion, Port 8080)
docker-compose up -d
```

## Lint

```bash
cd frontend && npx eslint src/
```

Es gibt keine automatisierten Tests.

## Architektur

Monorepo mit getrenntem Python-Backend und React-Frontend. In Produktion (Docker) bedient FastAPI das gebaute Frontend als statische Dateien.

### Backend (FastAPI + SQLAlchemy + SQLite)

- **Einstieg**: `backend/app/main.py` – FastAPI-App mit NoCacheMiddleware, CORS, StaticFiles-Mount
- **Config**: `backend/.env` (nicht im Root!) → geladen über `backend/app/config.py` (Pydantic Settings)
- **Datenbank**: SQLite unter `backend/data/database.db` (NICHT brickhub.db)
- **Routers**: `backend/app/routers/` – auth, users, sets, boxes, images, labels (alle unter `/api/`)
- **Services**: `backend/app/services/` – image_service (rembg, OpenCV, Pillow), pdf_service (ReportLab), ollama_service
- **Auth-Flow**: bcrypt(rounds=12) + JWT/HS256 in HTTP-only Cookie. Dependencies: `get_current_user`, `require_admin`

### Frontend (React 18 + Vite + Tailwind)

- **Einstieg**: `frontend/src/main.jsx` → `App.jsx` (React Router v6, lazy-loaded Pages)
- **API-Client**: `frontend/src/api/client.js` – Axios mit `withCredentials: true`, 401-Interceptor, organisiert als `authApi`, `setsApi`, `boxesApi`, `imagesApi`, `labelsApi`
- **Auth**: `frontend/src/hooks/useAuth.jsx` (muss .jsx sein wegen JSX im Hook)
- **Proxy**: Vite leitet `/api` → `http://localhost:8000` weiter (konfiguriert in `vite.config.js`)

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

## Wichtige Konventionen

- Bildpfade in DB sind relativ zu `backend/`: `data/uploads/{Hersteller - SetName}/...`
- Dateiname-Prefix "Thumbmail" (Schreibfehler, nicht ändern ohne DB-Migration)
- `API_BASE = ''` in dev (Proxy), FastAPI bedient Frontend statisch in Prod
- `imagesApi.fileUrl()` hat keinen Cache-Buster eingebaut – Pages nutzen `&t=Date.now()` manuell
- Inline-Updates: `PATCH /api/sets/{id}/inline` akzeptiert nur: status, bag_count, plate_count, box_id, notes
- Box mit `allowed_stone_types = []` → kompatibel mit allen Steinarten
