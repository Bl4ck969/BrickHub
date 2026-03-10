# BrickHub

Webapplikation zur Verwaltung, Inventarisierung und Einlagerung von Klemmbausteinsets. Entwickelt für den Einsatz auf einem Unraid-Server via Docker.

![Python](https://img.shields.io/badge/Python-3.12+-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)

---

## Funktionsumfang

### Set-Verwaltung
- **CRUD-Operationen**: Sets anlegen, bearbeiten, löschen mit allen relevanten Daten (Name, Hersteller, Artikelnummer, Teilezahl, Steingröße, Kategorie, Unterkategorie, Preis, Status, Anmerkungen)
- **Inline-Bearbeitung**: Status, Tütenanzahl, Plattenanzahl, Kistenzuordnung und Anmerkungen direkt in der Tabellenansicht ändern
- **Sortierung & Filterung**: Volles Sorting über alle Spalten via TanStack Table
- **Summary-Dashboard**: Übersichtskarten mit Gesamtanzahl Sets, Gesamtteile, Gesamtwert sowie Aufschlüsselung nach Steinart

### Bildverarbeitung
- **Upload & Eckenerkennung**: Bilder hochladen mit automatischer Eckenerkennung (OpenCV Canny Edge Detection, 6 Strategien)
- **Perspektivkorrektur**: Interaktiver ImageEditor mit manueller Eckplatzierung, Mausrad-Zoom, Drag-to-Pan
- **Bildanpassungen**: Helligkeit- und Farbintensität-Slider mit Live-Vorschau
- **Hintergrundentfernung**: Automatische Hintergrundentfernung via rembg (u2net)
- **Thumbnail-Generierung**: Automatische Erstellung von Thumbnails für Front- und Backcover
- **Bestehendes Bild erneut bearbeiten**: Bereits hochgeladene Bilder können jederzeit neu bearbeitet werden

### Kistenverwaltung (Lager)
- **Kisten anlegen**: Name, Standort, Füllgrad (0–100%), erlaubte Steinarten
- **Kompatibilitätsprüfung**: Sets können nur Kisten zugewiesen werden, die zur Steingröße passen
- **Kisten-Inventar**: Übersicht welche Sets in welcher Kiste liegen, mit sortierbaren Spalten

### Schildergenerierung (PDF)
- **Setliste als PDF**: Alle Sets als formatierte Liste exportieren (ReportLab)
- **Einzelschilder**: Schilder mit Cover-Bildern und Set-Informationen generieren
- **Anpassbares Layout**: Logo-Integration, automatische Seitenumbrüche

### Benutzerverwaltung & Authentifizierung
- **Rollenbasiert**: Admin- und Leser-Rollen (Leser können nur ansehen, Admins können alles bearbeiten)
- **Sichere Authentifizierung**: bcrypt (12 Runden) Passwort-Hashing + JWT (HS256) in HTTP-only Cookies
- **Erster Start**: Setup-Seite zur Erstellung des ersten Admin-Accounts
- **Passwort ändern/zurücksetzen**: Eigenes Passwort ändern, Admins können Passwörter anderer User zurücksetzen

### Optionale KI-Integration
- **Ollama-Anbindung** (optional): Automatische Set-Erkennung aus Bildern via LLaVA-Modell
- Deaktivierbar über Umgebungsvariable (`OLLAMA_ENABLED=false`)

---

## Tech Stack

| Komponente | Technologie |
|---|---|
| **Backend** | Python 3.12+ · FastAPI · SQLAlchemy 2.0 · SQLite |
| **Frontend** | React 19 · Vite 7 · Tailwind CSS 3 · TanStack Table v8 |
| **Auth** | bcrypt · python-jose (JWT/HS256) · HTTP-only Cookies |
| **Bildverarbeitung** | OpenCV · Pillow · rembg (u2net) |
| **PDF** | ReportLab (Canvas API + Platypus) |
| **Icons** | Heroicons v2 (Outline) |
| **Deployment** | Docker (Multi-Stage Build) · Docker Compose |

---

## Projektstruktur

```
BrickHub/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI-Einstiegspunkt
│   │   ├── config.py            # Pydantic Settings (.env)
│   │   ├── database.py          # SQLAlchemy Engine + Session
│   │   ├── models/              # SQLAlchemy-Modelle (User, BrickSet, Box)
│   │   ├── schemas/             # Pydantic-Schemas (Request/Response)
│   │   ├── routers/             # API-Endpoints (auth, users, sets, boxes, images, labels)
│   │   ├── services/            # Business-Logik (image_service, pdf_service, ollama_service)
│   │   └── utils/               # Auth-Utilities (JWT, Dependencies)
│   ├── data/                    # SQLite-DB + Uploads (nicht im Repo)
│   ├── .env                     # Umgebungsvariablen (nicht im Repo)
│   ├── .env.example             # Vorlage für .env
│   └── requirements.txt
├── frontend/
│   ├── public/                  # Statische Assets (Logo, Icons)
│   ├── src/
│   │   ├── App.jsx              # Router-Setup (React Router v6, Lazy Loading)
│   │   ├── api/client.js        # Axios API-Client (authApi, setsApi, boxesApi, imagesApi, labelsApi)
│   │   ├── components/          # Wiederverwendbare Komponenten (Navbar, Modal, ImageEditor, ProtectedRoute)
│   │   ├── hooks/useAuth.jsx    # Auth-Context + Hook
│   │   └── pages/               # Seitenkomponenten (Sets, AddEditSet, Storage, Labels, BoxInventory, Users, ...)
│   ├── package.json
│   ├── vite.config.js           # Dev-Proxy (/api → localhost:8000)
│   └── tailwind.config.js
├── Dockerfile                   # Multi-Stage Build (Node + Python)
├── docker-compose.yml           # Produktions-Deployment (Port 8080)
├── Logo.png                     # BrickHub-Logo
├── start-dev.bat                # Windows-Startskript für Entwicklung
└── CLAUDE.md                    # Entwickler-Dokumentation
```

---

## Installation & Setup

### Voraussetzungen

- **Python** 3.12 oder höher
- **Node.js** 20 oder höher
- **Git**

### 1. Repository klonen

```bash
git clone https://github.com/Bl4ck969/BrickHub.git
cd BrickHub
```

### 2. Backend einrichten

```bash
cd backend

# Virtuelle Umgebung erstellen und aktivieren
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Abhängigkeiten installieren
pip install -r requirements.txt

# Umgebungsvariablen konfigurieren
cp .env.example .env
# .env bearbeiten und SECRET_KEY setzen (min. 32 Zeichen, zufällig)
```

### 3. Frontend einrichten

```bash
cd frontend

# Abhängigkeiten installieren
npm install
```

### 4. Umgebungsvariablen (.env)

Die Datei `backend/.env` enthält die Konfiguration:

| Variable | Beschreibung | Standard |
|---|---|---|
| `SECRET_KEY` | JWT-Signaturschlüssel (mind. 32 Zeichen) | **Muss gesetzt werden!** |
| `DATABASE_URL` | SQLite-Datenbankpfad | `sqlite:///./data/database.db` |
| `UPLOAD_DIR` | Verzeichnis für hochgeladene Bilder | `./data/uploads` |
| `EXPORT_DIR` | Verzeichnis für PDF-Exporte | `./export` |
| `OLLAMA_URL` | URL zum Ollama-Server (optional) | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama-Modell für Bilderkennung | `llava:7b` |
| `OLLAMA_ENABLED` | KI-Bilderkennung aktivieren | `false` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT-Token-Gültigkeit in Minuten | `480` |

---

## Entwicklung starten

### Windows (empfohlen)

Doppelklick auf `start-dev.bat` – startet Backend und Frontend gleichzeitig.

### Manuell

**Terminal 1 – Backend:**
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 – Frontend:**
```bash
cd frontend
npm run dev
```

### Zugriff

| Dienst | URL |
|---|---|
| **Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:8000 |
| **API-Dokumentation** (Swagger) | http://localhost:8000/docs |

### Erster Start

Beim ersten Aufruf wird automatisch die Setup-Seite angezeigt, auf der ein Admin-Account erstellt werden muss. Danach kann man sich einloggen und Sets anlegen.

---

## Docker Deployment (Produktion)

### Mit Docker Compose

```bash
# .env-Datei konfigurieren
cp backend/.env.example backend/.env
# SECRET_KEY in backend/.env setzen!

# Container bauen und starten
docker-compose up -d
```

Die Anwendung ist dann unter **http://localhost:8080** erreichbar.

### Docker-Details

- **Multi-Stage Build**: Node.js baut das Frontend, Python bedient alles
- **Persistente Daten**: `backend/data/` (DB + Uploads) und `backend/export/` (PDFs) werden als Volumes gemountet
- **Health Check**: `GET /api/health` alle 30 Sekunden
- **Memory Limit**: 4 GB (wegen rembg/onnxruntime)
- **Restart Policy**: `unless-stopped`

### Unraid

Für Unraid kann der Container über die Docker-Oberfläche oder ein Template eingerichtet werden:
- **Port**: 8080 → 8080
- **Pfad für Daten**: `/app/data` → gewünschter Speicherort auf dem Host
- **Pfad für Exporte**: `/app/export` → gewünschter Speicherort auf dem Host
- **Umgebungsvariable**: `SECRET_KEY` setzen

---

## API-Übersicht

Alle API-Endpoints liegen unter `/api/`. Vollständige interaktive Dokumentation unter `/docs` (Swagger UI).

| Bereich | Endpoints | Beschreibung |
|---|---|---|
| **Auth** | `POST /api/auth/login`, `/logout`, `/status`, `/setup` | Anmeldung, Abmeldung, Status, Ersteinrichtung |
| **Users** | `GET/POST/PATCH/DELETE /api/users/` | Benutzerverwaltung (nur Admin) |
| **Sets** | `GET/POST/PUT/DELETE /api/sets/`, `PATCH .../inline` | Set-CRUD + Inline-Bearbeitung |
| **Boxes** | `GET/POST/PUT/DELETE /api/boxes/` | Kistenverwaltung |
| **Images** | `POST /api/images/upload`, `/transform`, `/finalize`, `/redetect` | Bildverarbeitung-Pipeline |
| **Labels** | `POST /api/labels/set-list`, `/set-labels` | PDF-Generierung |

---

## Lint

```bash
cd frontend
npx eslint src/
```

---

## Lizenz

Privates Projekt – nicht zur Weiterverbreitung bestimmt.
