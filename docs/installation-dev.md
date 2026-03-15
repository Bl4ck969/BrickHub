# BrickHub – Entwicklungsumgebung einrichten (Windows)

Diese Anleitung richtet sich an alle, die BrickHub lokal auf einem Windows-PC ausführen oder am Code weiterentwickeln möchten. Für den reinen Heimserver-Betrieb via Docker siehe [installation-docker.md](./installation-docker.md).

---

## Was wird installiert?

BrickHub besteht aus zwei Teilen, die beide laufen müssen:

| Teil | Technologie | Warum |
|---|---|---|
| **Backend** | Python / FastAPI | Datenbank, API, Bildverarbeitung |
| **Frontend** | Node.js / React | Die Weboberfläche im Browser |

---

## Voraussetzungen installieren

### 1. Python installieren

Mindestversion: **Python 3.12**

1. [python.org/downloads](https://www.python.org/downloads/) aufrufen
2. Aktuelle Version herunterladen und installieren
3. **Wichtig**: Beim Installer-Start den Haken bei **"Add Python to PATH"** setzen!
4. Prüfen ob es funktioniert hat – Eingabeaufforderung öffnen (`Win + R` → `cmd`) und eingeben:
   ```
   python --version
   ```
   Es sollte `Python 3.12.x` o.ä. erscheinen.

### 2. Node.js installieren

Mindestversion: **Node.js 20**

1. [nodejs.org](https://nodejs.org/) aufrufen → LTS-Version herunterladen
2. Installer ausführen (einfach alles auf Standard lassen)
3. Prüfen:
   ```
   node --version
   npm --version
   ```

### 3. Git installieren

1. [git-scm.com/downloads](https://git-scm.com/downloads) → Windows-Installer
2. Alles auf Standardeinstellungen lassen
3. Prüfen:
   ```
   git --version
   ```

---

## BrickHub herunterladen

Eingabeaufforderung öffnen und ins gewünschte Verzeichnis wechseln (z.B. `cd C:\Projekte`), dann:

```bash
git clone https://github.com/Bl4ck969/BrickHub.git
cd BrickHub
```

---

## Backend einrichten

> Nur einmal nötig – danach reicht `brickhub.bat` zum Starten.

```bash
cd backend

# 1. Virtuelle Python-Umgebung erstellen (isoliert Pakete vom Rest des Systems)
python -m venv venv

# 2. Virtuelle Umgebung aktivieren
venv\Scripts\activate
# Der Prompt ändert sich zu: (venv) C:\...>

# 3. Alle Python-Pakete installieren
pip install -r requirements.txt
# Das dauert beim ersten Mal einige Minuten (rembg lädt ein ~176 MB Modell)

# 4. Konfigurationsdatei erstellen
copy .env.example .env
```

Jetzt die Datei `backend\.env` mit einem Texteditor öffnen und den `SECRET_KEY` setzen:

```
SECRET_KEY=hier-einen-langen-zufaelligen-text-eingeben-mindestens-32-zeichen
```

**Tipp für einen sicheren Schlüssel** – in der Eingabeaufforderung (mit aktiviertem venv):
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```
Den ausgegebenen Text als `SECRET_KEY` eintragen.

---

## Frontend einrichten

> Nur einmal nötig.

```bash
cd ..\frontend

# Alle JavaScript-Pakete installieren
npm install
```

---

## Server starten mit brickhub.bat

Im BrickHub-Hauptordner die Datei **`brickhub.bat`** doppelklicken. Es öffnet sich ein Menü:

```
============================================
         BrickHub Server Manager
============================================

  [1]  Server starten
  [2]  Server stoppen
  [3]  Server neustarten
  [4]  Status anzeigen
  [5]  Beenden

============================================
```

**`1` eingeben und Enter** → Backend und Frontend starten automatisch in je einem eigenen Fenster.

Dann im Browser aufrufen:
- **Oberfläche**: http://localhost:5173
- **API-Dokumentation** (Entwickler): http://localhost:8000/docs

Beim allerersten Start erscheint die **Setup-Seite** zum Anlegen des ersten Admin-Accounts.

---

## Abhängigkeiten aktualisieren

Nach einem `git pull` können sich Pakete geändert haben. So aktuell bleiben:

### Python-Pakete aktualisieren

```bash
cd backend
venv\Scripts\activate
pip install -r requirements.txt
```

> Bereits installierte Pakete, die up-to-date sind, werden übersprungen. Neue oder geänderte werden nachgezogen.

### Node.js-Pakete aktualisieren

```bash
cd frontend
npm install
```

> Auch hier gilt: nur Änderungen werden nachgezogen.

**Empfehlung**: Beide Befehle nach jedem `git pull` ausführen, um sicherzugehen.

---

## Häufige Probleme

**"python wird nicht erkannt"**
→ Python wurde ohne "Add to PATH" installiert. Python deinstallieren, neu installieren mit dem Haken.

**"pip install schlägt fehl bei rembg/onnxruntime"**
→ C++ Build Tools fehlen. [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) installieren.

**Backend startet nicht: "Could not find .env file"**
→ Schritt "Konfigurationsdatei erstellen" nicht gemacht. `backend\.env` aus `.env.example` erstellen.

**Port 8000 oder 5173 schon belegt**
→ In `brickhub.bat` Option `[4] Status anzeigen` nutzen. Wenn beide inaktiv gezeigt werden aber Ports belegt sind, anderen Prozess beenden (`taskkill /PID <id> /F`).

**Frontend lädt, aber API-Fehler**
→ Backend nicht gestartet. Prüfen ob das "BrickHub Backend"-Fenster offen ist und keine Fehlermeldung zeigt.
