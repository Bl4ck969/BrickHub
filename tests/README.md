# Rauchtest

Prüft mit **echten Klicks und echten Eingaben** gegen die laufende
Entwicklungsumgebung, ob die Bedienung trägt — nicht nur, ob es baut.

Der Test liegt bewusst **außerhalb von `frontend/`**: Das Dockerfile kopiert
`frontend/` komplett und führt dort `npm ci` aus. Läge Playwright in
`frontend/package.json`, würde es bei jedem Image-Bau mitinstalliert.

## Einmalig einrichten

```bash
cd tests
npm install
```

Playwright benutzt den auf dem Rechner installierten **Microsoft Edge**
(`channel: 'msedge'`) — es wird kein zusätzlicher Browser heruntergeladen.

## Ausführen

Beide Server müssen laufen (Backend :8000, Frontend :5173 — `brickhub.bat`).

```bash
cd tests
BH_USER=<benutzer> BH_PASS=<passwort> npm test
```

Unter PowerShell:

```powershell
$env:BH_USER='<benutzer>'; $env:BH_PASS='<passwort>'; npm test
```

Optional: `BH_URL` (Standard `http://localhost:5173`), `BH_SHOTS=<ordner>`
für einen Screenshot der schmalen Ansicht.

## Was geprüft wird

| | |
|---|---|
| Anmeldung | über das echte Formular, nicht per API |
| Tabelle | gefüllt, Sortierung ändert die Reihenfolge nachweislich |
| **Schreibvorgang** | Tüten ändern → `PATCH /api/sets/…/inline` im Netzwerkmitschnitt → **Wert wird zurückgesetzt** |
| Status-Auswahl | 4 Werte, bedienbar |
| Kisten-Auswahl | volle Kisten sind gesperrt (`disabled`) |
| Bild-Vergrößerung | Modal öffnet |
| Galerie | Karten werden gerendert |
| Theme, Seitenleiste | Umschalten wirkt und wird gemerkt |
| Alle 6 Navigationsziele | laden mit Überschrift |
| Set-Formular, Ersteinrichtung | rendern |
| Schmale Ansicht (390 px) | kein seitliches Scrollen |
| Konsole | keine Fehler außer den erwarteten 401 vor der Anmeldung |

## ⚠ Der Test schreibt in die Datenbank

Er ändert **einen** Wert (Anzahl Tüten beim ersten Set der sortierten Liste)
und setzt ihn danach zurück. Schlägt das Zurücksetzen fehl, meldet er
`Testwert zurückgesetzt — BITTE PRÜFEN`. Dann von Hand nachsehen.

Für ein Konto gilt die Projektregel aus `CLAUDE.md`: temporären Benutzer
anlegen, danach löschen — die lokale `backend/data/database.db` enthält
Echtdaten, keine Testaccounts.

## Was er **nicht** prüft

- Den Docker-Image-Bau (dafür `docker build .`)
- Das Absenden von Formularen, die Daten anlegen (Set anlegen, Kiste anlegen,
  Benutzer anlegen, Backup einspielen) — die würden Echtdaten verändern
- Den Bildeditor über Schritt 1 hinaus (Zuschneiden, Freistellen)
