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

## Screenshots

### Login
![Login](docs/screenshots/login.png)

### Set-Übersicht mit Summary-Dashboard
![Sets](docs/screenshots/sets-overview.png)

### Vollständiges Backup exportieren / importieren
![Backup](docs/screenshots/backup.png)

### Set bearbeiten mit Bildverarbeitung
![Set bearbeiten](docs/screenshots/set-edit.png)

### Lagerverwaltung – Kisten
![Lagerung](docs/screenshots/storage.png)

### Kisteninventur – Welches Set liegt wo?
![Kisteninventur](docs/screenshots/box-inventory.png)

### Einlagerungsschilder generieren
![Schilder](docs/screenshots/labels.png)

### Benutzerverwaltung
![Benutzer](docs/screenshots/users.png)

---

## Funktionsumfang

### Set-Verwaltung

Die Hauptansicht zeigt alle Klemmbausteinsets in einer sortierbaren Tabelle mit Front- und Backcover-Thumbnails. Über der Tabelle bieten fünf Summary-Karten einen schnellen Überblick: Anzahl Sets, Gesamtteile, Gesamtwert sowie zwei Steinart-Statistiken mit farbigem gestapeltem Balken und 2-spaltiger Legende (Sets nach Steinart / Teile nach Steinart).

- **CRUD-Operationen**: Sets anlegen, bearbeiten, löschen mit allen relevanten Daten (Name, Hersteller, Artikelnummer, Teilezahl, Steingröße, Kategorie, Unterkategorie, Preis, Status, Anmerkungen)
- **Inline-Bearbeitung**: Status, Tütenanzahl, Plattenanzahl, Kistenzuordnung und Anmerkungen lassen sich direkt in der Tabellenansicht ändern – ohne die Bearbeitungsseite öffnen zu müssen
- **Sortierung & Filterung**: Alle Spalten sind sortierbar (TanStack Table). Filterbar nach Status, Steinart, Hersteller, Kategorie und Unterkategorie. Volltextsuche über Name, Hersteller und Kategorie
- **Import/Export**: Sets als JSON exportieren und importieren (max. 1.000 Sets pro Import), PDF-Setliste generieren

### Tüten- und Platten-System

Wenn ein Klemmbausteinset eingelagert wird, werden die Einzelteile typischerweise **nicht lose**, sondern in **nummerierte Tüten** und **Grundplatten** verpackt. BrickHub trackt diese Verpackungseinheiten pro Set:

- **Tüten (bag_count)**: Anzahl der Tüten, in die die Teile eines Sets aufgeteilt sind. Bei großen Sets (z.B. LEGO Eiffelturm mit 10.001 Teilen) können das 8 oder mehr Tüten sein. Jede Tüte enthält eine Teilmenge der Steine und wird separat in einer Kiste eingelagert.
- **Platten (plate_count)**: Anzahl der Grundplatten/Bodenplatten eines Sets. Platten sind zu groß für normale Tüten und werden separat gelagert.

Die Tüten- und Plattenanzahl ist direkt in der Set-Tabelle inline editierbar. Sie spielt eine zentrale Rolle bei der **Schildergenerierung**: Pro Tüte und pro Platte wird automatisch ein eigenes Einlagerungsschild erstellt, das zeigt, zu welchem Set die Tüte/Platte gehört.

**Beispiel**: Ein Set mit 8 Tüten und 3 Platten erzeugt 11 Schilder – eines für jede Verpackungseinheit.

### Kistenverwaltung (Lager)

Kisten repräsentieren die physischen Lagerbehälter (z.B. Umzugskartons, Plastikboxen), in denen die eingelagerten Sets aufbewahrt werden. Jede Kiste hat:

- **Name** (z.B. K1, K2, K3): Kurzbezeichnung, die auch auf den Schildern erscheint
- **Standort** (z.B. Keller, Dachboden): Wo die Kiste physisch steht
- **Füllheitsgrad** (0–100% in 10er-Schritten): Visuell dargestellt als Fortschrittsbalken. Grün (< 70%), Orange (70–99%), Rot (100% = voll). Volle Kisten können in der Set-Tabelle nicht mehr ausgewählt werden.
- **Erlaubte Steinarten**: Welche Steingröße in diese Kiste darf. Z.B. nur „Standard" und „Standard, Technik" – oder leer für alle Steinarten. Beim Zuweisen eines Sets zu einer Kiste werden nur kompatible Kisten angeboten.

#### Steinarten-Kompatibilität

Klemmbausteine gibt es in verschiedenen Größen, die nicht zusammen in einer Kiste gelagert werden sollten:

| Steinart | Beschreibung |
|---|---|
| **Standard** | Normaler Klemmbaustein (z.B. LEGO, Blue Brixx, Mould King) |
| **Standard, beleuchtet** | Standard-Steine mit LED-Beleuchtung |
| **Standard, Technik** | Technik-Steine mit Zahnrädern, Achsen, Motoren |
| **Mini** | Minibausteine (ca. halbe Größe, z.B. LOZ, Wisehawk) |
| **Diamond** | Diamond-Blocks / Nanobausteine (sehr klein, z.B. MOYU, Qman) |
| **Sonder-Steine** | Alles was in keine andere Kategorie passt |

Eine Kiste mit `allowed_stone_types = ["Standard", "Standard, Technik"]` akzeptiert nur Sets dieser Steinarten. Eine Kiste ohne Einschränkung (`[]`) ist mit allen Steinarten kompatibel.

### Kisteninventur

Die Kisteninventur-Seite zeigt alle **eingelagerten Sets** in einer Tabelle, wobei jede Kiste eine eigene Spalte hat. Ein grüner Haken zeigt an, in welcher Kiste ein Set liegt. So sieht man auf einen Blick:
- Welches Set in welcher Kiste liegt
- Wie viele Tüten und Platten jedes Set hat
- Ob die Zuordnung stimmt

Die Kisten-Spalten sind sortierbar – ein Klick auf den Kisten-Header sortiert nach Zugehörigkeit (alle Sets einer Kiste gruppiert).

### Einlagerungsschilder (PDF)

Die Schilder-Seite ermöglicht das Generieren von PDF-Einlagerungsschildern. Pro DIN A4-Seite werden 6 Schilder gedruckt. Jedes Schild enthält:
- Front- und Backcover des Sets
- Hersteller, Name, Artikelnummer
- Tüten-/Plattennummer (z.B. „Tüte 3 von 8")
- Das BrickHub-Logo

Die Schilder werden ausgedruckt und in die Tüten/an die Platten geheftet, damit man beim Heraussuchen sofort weiß, zu welchem Set eine Tüte gehört.

### Bildverarbeitung

Jedes Set kann ein Front- und Backcover-Bild haben. Der Upload-Prozess beinhaltet:

1. **Bild hochladen**: Foto der Verpackung (Vorder- oder Rückseite)
2. **Automatische Eckenerkennung**: OpenCV erkennt die Kanten der Verpackung (6 verschiedene Canny-Edge-Strategien)
3. **Manuelles Feintuning**: Im interaktiven ImageEditor können die 4 Eckpunkte per Drag & Drop korrigiert werden. Unterstützt Mausrad-Zoom und Pan.
4. **Perspektivkorrektur**: Das Bild wird entzerrt (Perspektivtransformation)
5. **Helligkeit/Farbe anpassen**: Optional über Slider
6. **Hintergrundentfernung**: rembg entfernt automatisch den Hintergrund (u2net-Modell)
7. **Skalierung + Thumbnail**: Finales Bild wird skaliert, Thumbnail generiert

Bereits verarbeitete Bilder können jederzeit erneut bearbeitet werden, ohne das Original neu hochladen zu müssen.

### Benutzerverwaltung & Authentifizierung

- **Rollenbasiert**: Admin- und Leser-Rollen. Leser können Sets ansehen und durchsuchen. Admins können Sets anlegen/bearbeiten/löschen, Kisten verwalten und Benutzer administrieren.
- **Sichere Authentifizierung**: bcrypt (12 Runden) Passwort-Hashing + JWT (HS256) in HTTP-only Cookies
- **Erster Start**: Setup-Seite zur Erstellung des ersten Admin-Accounts
- **Passwort ändern/zurücksetzen**: Eigenes Passwort ändern, Admins können Passwörter anderer User zurücksetzen

### OneDrive-Verknüpfung

Sets können mit OneDrive-Ordnern verknüpft werden, um z.B. Bauanleitungen, Fotos oder weitere Dokumente abzulegen.

- **Globaler Basis-Link**: Admin konfiguriert einmalig den Link zum Klemmbausteine-Oberordner in OneDrive (über die Settings-Tabelle)
- **Automatischer Ordnername**: Beim Bearbeiten eines Sets wird der Ordnername `Hersteller - Herstellernummer - Name` automatisch generiert und kann per Klick kopiert werden
- **Unterordner-Link**: Pro Set wird ein individueller OneDrive-Link hinterlegt, der direkt zum Set-Ordner führt
- **Set-Tabelle**: Ein OneDrive-Icon in der Aktionsspalte öffnet den verknüpften Ordner mit einem Klick
- **PDF-Export**: Sets mit OneDrive-Verknüpfung werden mit einem klickbaren Cloud-Icon in der Setliste markiert

### Backup & Restore

Vollständiges Daten-Backup als ZIP-Archiv – schützt vor Datenverlust bei Festplattenausfall oder Container-Neuinstallation.

- **Backup exportieren** (Admin): Ein Klick erstellt ein ZIP-Archiv mit der SQLite-Datenbank (`database.db`) und allen hochgeladenen Bildern (`uploads/`). Download direkt im Browser.
- **Backup importieren** (Admin): ZIP-Datei hochladen → Datenbank und Bilder werden vollständig wiederhergestellt. Bestehende Daten werden überschrieben.
- **Endpoint**: `GET /api/backup/export` / `POST /api/backup/import`

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
│   │   ├── models/              # SQLAlchemy-Modelle (User, BrickSet, Box, AppSetting)
│   │   ├── schemas/             # Pydantic-Schemas (Request/Response)
│   │   ├── routers/             # API-Endpoints (auth, users, sets, boxes, images, labels, settings, backup)
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
│   │   ├── api/client.js        # Axios API-Client (authApi, setsApi, boxesApi, imagesApi, labelsApi, settingsApi)
│   │   ├── components/          # Wiederverwendbare Komponenten (Navbar, Modal, ImageEditor, OneDriveIcon, ProtectedRoute)
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

Beim ersten Aufruf wird automatisch die **Setup-Seite** angezeigt, auf der ein Admin-Account erstellt werden muss. Danach kann man sich einloggen und sofort mit dem Anlegen von Sets und Kisten beginnen.

**Empfohlene Reihenfolge:**
1. Admin-Account erstellen (Setup)
2. Kisten anlegen (Lagerung) mit Standort und erlaubten Steinarten
3. Sets anlegen mit Bildern, Tüten- und Plattenanzahl
4. Sets den Kisten zuweisen
5. Einlagerungsschilder drucken

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
| **Settings** | `GET /api/settings/`, `PUT /api/settings/{key}` | App-Einstellungen (OneDrive-Basis-URL etc.) |
| **Backup** | `GET /api/backup/export`, `POST /api/backup/import` | ZIP-Backup exportieren / importieren (nur Admin) |

---

## Lint

```bash
cd frontend
npx eslint src/
```

---

## Lizenz

Privates Projekt – nicht zur Weiterverbreitung bestimmt.
