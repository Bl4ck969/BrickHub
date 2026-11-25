# Release-Ablauf BrickHub (Kanban-Leitstand)

Danach arbeitet der Agent auf der Release-Karte „Release BrickHub“ im Kanban-Leitstand. Angelegt am 25.11.2026 bei der
Anbindung an den Leitstand. Aufbau nach `docs/release-ablauf.md` aus AllMyMovies, Inhalt für dieses Repo.

**In einem Satz:** Der Agent setzt die Version und schreibt den Release-Text, Andreas prüft auf der Testinstanz, der
Leitstand mergt nach `main` und setzt den Tag – **der Merge baut das Image**, der Tag selbst baut nichts.

## Was der Agent macht

1. **Version** nach SemVer ab dem letzten Tag `v*` (nur Fehlerbehebungen: letzte Stelle +1, neue Funktion: mittlere
   Stelle +1). Vor der Anbindung gab es keine Tags; das erste Release per Knopf ist **`v2.0.0`** (Design 2.0 läuft seit
   12.09.2026). Hat Andreas eine Version gesetzt, gilt seine.
2. **Versionsdatei:** `version=` in `backend/app/main.py` (FastAPI-Objekt). `frontend/package.json` bleibt auf `0.0.0`,
   die Version dort liest niemand. Die Weboberfläche zeigt die Version nicht an.
3. **Release-Text:** `docs/release-notes/<version>.md` (Dateiname ohne `v`, z. B. `2.0.0.md`). Der Agent schickt ihn mit
   der Abgabe an den Leitstand (höchstens 20 000 Zeichen). Quelle: `git log origin/main..origin/runde/bh` und die Karten
   der Runde. Aufbau siehe unten.
4. **Release-Testinstanz:** `testinstanz bauen` (Rezept `handprobe/testinstanz.py`). Solange es das Rezept nicht gibt
   oder der Bau scheitert, gibt es keine Instanz: Dann keine `--handprobe`-Schritte mitgeben, die eine Instanz brauchen,
   sondern in `gliederung.offen` schreiben, **was** zu prüfen ist (die sichtbaren Neuerungen der Runde).
   - Bringt die Runde **nur Interna** (Abhängigkeit ohne Bruch, Server-Logik, Doku), ist keine Handprobe nötig; der
     Grund steht in `gliederung.geprueft`.
5. **Tests:** Der Workflow `pr-pruefung.yml` baut auf jedem PR das Docker-Image (ohne Push) – derselbe Bau wie beim
   Release. Lint (`npx eslint src/`) hat Altlasten und bricht nichts (siehe `CLAUDE.md`). Der Rauchtest (`tests/`)
   braucht beide Server und ein Konto; er gehört zur Handprobe, nicht zum Agenten.

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
