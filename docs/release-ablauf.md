# Release-Ablauf BrickHub (Kanban-Leitstand)

Danach arbeitet der Agent auf der Release-Karte „Release BrickHub“ im Kanban-Leitstand. Angelegt am 25.11.2026 bei der
Anbindung an den Leitstand. Aufbau nach `docs/release-ablauf.md` aus AllMyMovies, Inhalt für dieses Repo.

**In einem Satz:** Der Agent setzt die Version und schreibt den Release-Text, Andreas prüft auf der Testinstanz, der
Leitstand mergt nach `main` und setzt den Tag – **der Merge baut das Image**, der Tag selbst baut nichts.

## Was der Agent macht

1. **Version** nach SemVer ab dem letzten Tag `v*` (nur Fehlerbehebungen: letzte Stelle +1, neue Funktion: mittlere
   Stelle +1). Vor der Anbindung gab es keine Tags; das erste Release per Knopf ist **`v1.0.0`** (von Andreas im Leitstand
   gesetzt, 25.11.2026). Hat Andreas eine Version gesetzt, gilt seine.
2. **Versionsdatei:** `version=` in `backend/app/main.py` (FastAPI-Objekt). `frontend/package.json` bleibt auf `0.0.0`,
   die Version dort liest niemand. Die Weboberfläche zeigt die Version nicht an.
3. **Release-Text:** `docs/release-notes/<version>.md` (Dateiname ohne `v`, z. B. `2.0.0.md`). Der Agent schickt ihn mit
   der Abgabe an den Leitstand (höchstens 20 000 Zeichen). Quelle: `git log origin/main..origin/runde/bh` und die Karten
   der Runde. Aufbau siehe unten.
4. **Release-Testinstanz:** `testinstanz bauen` (Rezept `handprobe/testinstanz.py`, siehe Abschnitt „Testinstanz“
   unten). Scheitert der Bau, gibt es keine Instanz: Dann keine `--handprobe`-Schritte mitgeben, die eine Instanz
   brauchen, sondern in `gliederung.offen` schreiben, **was** zu prüfen ist (die sichtbaren Neuerungen der Runde).
   - Bringt die Runde **nur Interna** (Abhängigkeit ohne Bruch, Server-Logik, Doku), ist keine Handprobe nötig; der
     Grund steht in `gliederung.geprueft`.
5. **Tests:** Der Workflow `pr-pruefung.yml` baut auf jedem PR das Docker-Image (ohne Push) – derselbe Bau wie beim
   Release. Lint (`npx eslint src/`) hat Altlasten und bricht nichts (siehe `CLAUDE.md`). Der Rauchtest (`tests/`)
   braucht beide Server und ein Konto; er gehört zur Handprobe, nicht zum Agenten.

## Testinstanz (`handprobe/testinstanz.py`, seit BH-1)

Baut eine BrickHub-Instanz auf dem PC mit den Daten der neuesten automatischen Sicherung, nie am Unraid. Ablauf,
Gründe und Exitcodes (0 fertig, 1 Schritt gescheitert – Instanz bleibt zur Diagnose stehen, 2 Vorbedingung) stehen im
Kopf des Skripts. Nur Python-Standardbibliothek:

```bash
python -I handprobe/testinstanz.py bauen     --name <projekt> --port <p> --image <lokaler-tag> --sicherung <ordner>
python -I handprobe/testinstanz.py abraeumen --name <projekt>
python -I -m unittest discover -s handprobe -p "test_*.py"     # Tests, ohne Docker
```

- `<ordner>` heißt wie die ZIP ohne `.zip` (`brickhub-auto-JJJJ-MM-TT_HH-MM`) und enthält genau diese ZIP. Das Rezept
  liest sie nur und prüft am Ende, dass Größe und Zeitstempel gleich geblieben sind.
- Eingespielt wird über den Weg der App: Upload an `POST /api/backup/import/start?mode=replace`, Fortschritt über
  `/api/backup/import/progress/<id>`. Danach prüft es in der SQLite-Datenbank des Containers, dass Sets, Kisten und
  Benutzer wie in `data.json` der Sicherung angekommen sind.
- ⚠ **Reihenfolge ist Sicherheit:** Wegwerf-Admin (`register-first-admin`) sofort nach dem Start, bevor echte Daten in
  der Instanz sind – solange es keinen Benutzer gibt, kann jedes Gerät im Netz erster Admin werden. Eine Sicherung ohne
  Benutzer lehnt das Rezept deshalb ab.
- ⚠ **Sicherungsplan VOR dem Einspielen abschalten:** `replace` löscht alle Benutzer, auch den Wegwerf-Admin – danach
  gilt sein Cookie nicht mehr. Die Tabelle `settings` überlebt das Einspielen (übernommen wird nur `onedrive_base_url`),
  die Abschaltung also auch.
- Nach außen spricht BrickHub nur über Ollama, und das kommt allein aus Umgebungsvariablen; die Compose-Datei
  `handprobe/docker-compose.testinstanz.yml` setzt `OLLAMA_ENABLED=false` und einen eigenen `SECRET_KEY`.
- Der Port ist **bewusst im ganzen Heimnetz** erreichbar (Prüfung auch vom Handy); die Instanz trägt die echten
  Passwort-Hashes. Nach der Handprobe abräumen – eine nach Exit 1 stehen gelassene Instanz belegt ihre Volumes, bis
  jemand `abraeumen` ruft.
- `abraeumen` entfernt nur Projekte, deren Container und Volumes die Marke `de.brickhub.testinstanz` tragen. Der Name
  `brickhub` (lokale Entwicklung) ist gesperrt.
- Probelauf 25.11.2026 mit einer künstlichen Sicherung (2 Sets, 1 Kiste, 2 Benutzer, 1 Bild): Bau, Nachprüfung und
  Abräumen liefen durch; der zweite `bauen` auf denselben Namen wurde mit Exit 2 abgelehnt. Mit der echten Sicherung
  (~600 MB) dauert der Upload länger.

## Was beim Veröffentlichen gebaut wird

Der Leitstand mergt den Release-PR nach `main` und setzt den Tag `vX.Y.Z` auf den Merge-Commit. **Auf den Tag hört kein
Workflow**; gebaut wird durch den Push auf `main`:

| Workflow | Wann | Ergebnis |
|---|---|---|
| `docker-publish.yml` | Push auf `main` (ohne Pfadfilter) | Image `ghcr.io/bl4ck969/brickhub` mit `:latest` und `:sha-<kurz>`, Label `org.opencontainers.image.revision` = Merge-Commit |
| `pr-pruefung.yml` | jeder PR nach `runde/bh` oder `main` | nur Bau, kein Push |

## Aufbau des Release-Texts

Für Andreas geschrieben, in einfachen Worten, Stichpunkte, echte Umlaute. Was sich für ihn ändert, nicht was im Code
passiert ist.

```markdown
<Ein Satz: was diese Fassung bringt.>

## Neu
- **Kurzer Titel.** Ein bis zwei Sätze.

## Behoben
- **Kurzer Titel.** Ein bis zwei Sätze.

## Bekannte Einschränkungen      ← nur wenn es welche gibt

## Für den Betrieb
- Neue Umgebungsvariable, Mount, Port – oder „Nichts zu tun, nur das Update am Unraid.“
```

Abschnitte ohne Inhalt fallen weg; „Für den Betrieb“ steht immer da.

## So aktualisieren

BrickHub wird am Unraid über den Knopf „Am Unraid aktualisieren“ im Kanban-Leitstand aktualisiert (Container
`Brickhub`, Image `ghcr.io/bl4ck969/brickhub:latest`). Von Hand: Unraid → Docker → Brickhub → „Update“. Die Daten liegen
in `/mnt/user/appdata/brickhub/data` und bleiben dabei erhalten.

## Was das Release braucht

- **Unraid:** Container `Brickhub`. Maßgeblich ist das Server-Template (Vorlage im Repo: `BrickHub-unraid-template.xml`).
  Neue Umgebungsvariablen oder Mounts gehören **vorher** ins Template (Skill `unraid-container-deployment`) und in
  „Für den Betrieb“.
- **Keine Release-Dateien** (`release.dateien` im Leitstand nicht setzen).

## Was der Agent nie macht

Mergen, taggen, ein GitHub-Release anlegen, den Sammelzweig `runde/bh` nachziehen, Workflows auslösen. Das macht der
Leitstand bzw. Andreas.
