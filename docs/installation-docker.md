# BrickHub – Docker-Installation (Heimserver / Unraid)

Diese Anleitung richtet sich an alle, die BrickHub als Docker-Container auf einem Heimserver betreiben möchten – z.B. auf Unraid, einem NAS oder einem normalen PC/Server mit Docker. Für die lokale Entwicklungsumgebung unter Windows siehe [installation-dev.md](./installation-dev.md).

---

## Was ist Docker und warum?

Docker "verpackt" die Anwendung mit allem, was sie braucht (Python, Pakete, Node.js-Build), in einen einzigen Container. Du musst nichts installieren außer Docker selbst – kein Python, kein Node.js, keine Pakete. Der Container läuft isoliert und hat keinen Einfluss auf den Rest des Systems.

---

## Variante A: Unraid (empfohlen für Unraid-Nutzer)

### Voraussetzungen
- Unraid mit aktiviertem Docker-Plugin
- Internetzugang (zum Laden des Images)

### Container einrichten

Im Unraid-Terminal (oder per SSH) den Container mit folgendem Befehl starten. Den `SECRET_KEY` durch einen eigenen langen zufälligen Text ersetzen (mind. 32 Zeichen, z.B. aus [random.org](https://www.random.org/strings/)):

```bash
docker run -d \
  --name Brickhub \
  --restart unless-stopped \
  -p 8049:8080 \
  -v /mnt/user/appdata/brickhub/data:/app/data \
  -v /mnt/user/appdata/brickhub/export:/app/export \
  -e SECRET_KEY="dein-geheimer-schluessel-mindestens-32-zeichen" \
  -e DATABASE_URL="sqlite:///./data/database.db" \
  -e UPLOAD_DIR="./data/uploads" \
  -e EXPORT_DIR="./export" \
  ghcr.io/bl4ck969/brickhub:latest
```

Nach dem Start ist BrickHub erreichbar unter:
**http://[DEINE-SERVER-IP]:8049**

Beim ersten Aufruf erscheint die **Setup-Seite** – dort den ersten Admin-Account anlegen.

### Berechtigungen setzen (nur beim ersten Mal)

Da der Container nicht als root läuft (Sicherheitsmerkmal), muss das Datenverzeichnis dem Container-User gehören:

```bash
chown -R 1000:1000 /mnt/user/appdata/brickhub/
docker restart Brickhub
```

> Wenn du diesen Schritt vergisst, zeigt der Container beim Start den Fehler `attempt to write a readonly database` und startet nicht richtig.

### Mit HTTPS / Reverse-Proxy

Wenn BrickHub hinter einem Reverse-Proxy (z.B. nginx, Traefik, Swag) mit HTTPS betrieben wird, zusätzlich setzen:

```bash
-e SECURE_COOKIES=true
```

---

## Variante B: Docker Compose (für alle Plattformen)

Ideal wenn Docker und Docker Compose bereits installiert sind (Linux, Windows mit Docker Desktop, Mac).

### Voraussetzungen
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) oder Docker + Docker Compose (Linux)
- Git

### Einrichten

```bash
# 1. Repository klonen
git clone https://github.com/Bl4ck969/BrickHub.git
cd BrickHub

# 2. Konfiguration erstellen
cp backend/.env.example backend/.env
```

Datei `backend/.env` öffnen und `SECRET_KEY` setzen:
```
SECRET_KEY=dein-geheimer-schluessel-mindestens-32-zeichen
```

```bash
# 3. Container starten
docker-compose up -d
```

Erreichbar unter: **http://localhost:8080**

### Was docker-compose.yml konfiguriert

- Port `8080` (Container) auf `8080` (Host)
- Volumes: `./backend/data` und `./backend/export` werden als persistente Ordner gemountet
- Automatischer Neustart bei Serverabsturz
- Speicherlimit: 4 GB (wegen KI-Bildverarbeitung mit rembg)

---

## BrickHub aktualisieren

Bei einem Update wurde das bestehende Image durch eine neue Version ersetzt. **Deine Daten bleiben dabei erhalten**, da sie im gemounteten Volume liegen, nicht im Container selbst.

### Unraid (docker run)

```bash
# 1. Laufenden Container stoppen und entfernen
docker stop Brickhub && docker rm Brickhub

# 2. Neues Image laden
docker pull ghcr.io/bl4ck969/brickhub:latest

# 3. Container neu starten (gleicher Befehl wie bei der Erstinstallation)
docker run -d \
  --name Brickhub \
  --restart unless-stopped \
  -p 8049:8080 \
  -v /mnt/user/appdata/brickhub/data:/app/data \
  -v /mnt/user/appdata/brickhub/export:/app/export \
  -e SECRET_KEY="dein-geheimer-schluessel-mindestens-32-zeichen" \
  -e DATABASE_URL="sqlite:///./data/database.db" \
  -e UPLOAD_DIR="./data/uploads" \
  -e EXPORT_DIR="./export" \
  ghcr.io/bl4ck969/brickhub:latest
```

### Docker Compose

```bash
cd BrickHub

# 1. Neues Image laden
docker-compose pull

# 2. Container neu starten
docker-compose up -d
```

> `docker-compose up -d` erkennt automatisch, dass ein neues Image vorhanden ist, und startet den Container neu. Daten bleiben erhalten.

---

## Abhängigkeiten

Bei Docker musst du dich um **keine Abhängigkeiten kümmern**. Alle Python-Pakete (FastAPI, rembg, OpenCV usw.) und das fertig gebaute Frontend sind im Image enthalten.

Wenn eine neue Version des Images verfügbar ist (z.B. weil neue Pakete hinzugekommen sind), reicht ein `docker pull` + Neustart wie oben beschrieben.

---

## Umgebungsvariablen (Übersicht)

| Variable | Beschreibung | Standard |
|---|---|---|
| `SECRET_KEY` | JWT-Signaturschlüssel – **muss gesetzt werden!** | – |
| `DATABASE_URL` | Pfad zur SQLite-Datenbank | `sqlite:///./data/database.db` |
| `UPLOAD_DIR` | Ordner für hochgeladene Bilder | `./data/uploads` |
| `EXPORT_DIR` | Ordner für generierte PDFs | `./export` |
| `SECURE_COOKIES` | `true` bei HTTPS/Reverse-Proxy | `false` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Wie lange bleibt man eingeloggt (Minuten) | `480` (8 Stunden) |
| `OLLAMA_ENABLED` | KI-Bilderkennung (Ollama) aktivieren | `false` |
| `OLLAMA_URL` | URL des Ollama-Servers | `http://localhost:11434` |

---

## Häufige Probleme

**"No such container: Brickhub"**
→ Container ist nicht mehr vorhanden (z.B. nach Crash oder manuellem Löschen). Direkt mit `docker run ...` neu erstellen – Daten im Volume sind noch da.

**"attempt to write a readonly database"**
→ Berechtigungen stimmen nicht. Auf Unraid: `chown -R 1000:1000 /mnt/user/appdata/brickhub/` ausführen, dann `docker restart Brickhub`.

**Container startet, aber Seite nicht erreichbar**
→ Prüfen ob der Port korrekt freigegeben ist: `docker ps` zeigt unter "PORTS" welcher Host-Port verwendet wird.

**"permission denied" auf dem Datenordner**
→ Gleiches Problem wie "readonly database" – `chown` Befehl ausführen.

**Container läuft, aber keine Bilder sichtbar**
→ Volume-Pfad prüfen: Der Pfad zu `/app/data` muss auf denselben Ordner zeigen wie bei der Erstinstallation.
