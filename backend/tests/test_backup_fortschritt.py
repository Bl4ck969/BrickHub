"""Tests für Riegel, Aufräumen und Stromende des Backup-Fortschritts (BH-3).
Lauf (aus backend/): python -m unittest discover -s tests

Testet die Hilfsfunktionen in app.routers.backup direkt. Das Modul zieht DB-Modelle nach sich,
braucht aber keine laufende Datenbank.
"""
import asyncio
import json
import os
import tempfile
import time
import unittest

from app.fehler import AppFehler
from app.routers import backup


def _lauf(task_id, tasks, art):
    """Liest den SSE-Strom komplett und liefert die Nachrichten als Liste."""
    async def lesen():
        antwort = backup._strom(tasks, task_id, art)
        teile = []
        async for chunk in antwort.body_iterator:
            teile.append(json.loads(chunk.removeprefix("data: ").strip()))
        return teile
    return asyncio.run(lesen())


class RiegelTests(unittest.TestCase):
    def test_zweiter_start_wird_abgelehnt_solange_einer_laeuft(self):
        tasks = {}
        backup._reservieren(tasks, "Import", {"status": "running"})
        with self.assertRaises(AppFehler) as ctx:
            backup._reservieren(tasks, "Import", {"status": "running"})
        self.assertEqual(ctx.exception.status, 409)
        self.assertIn("läuft bereits", ctx.exception.text)
        self.assertEqual(len(tasks), 1)

    def test_nach_abschluss_ist_neuer_start_erlaubt(self):
        tasks = {}
        tid = backup._reservieren(tasks, "Import", {"status": "running"})
        tasks[tid]["status"] = "done"
        backup._reservieren(tasks, "Import", {"status": "running"})
        self.assertEqual(len(tasks), 2)


class AufraeumenTests(unittest.TestCase):
    def test_abgelaufene_fertige_auftraege_und_zip_werden_entfernt(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        tmp.close()
        alt = time.monotonic() - backup._TTL_FERTIG - 1
        tasks = {
            "alt": {"status": "done", "file": tmp.name, "finished_at": alt},
            "frisch": {"status": "done", "finished_at": time.monotonic()},
            "laeuft": {"status": "running"},
            "alt-lauf": {"status": "running", "finished_at": alt},
        }
        with backup._tasks_lock:
            backup._aufraeumen(tasks)
        self.assertEqual(set(tasks), {"frisch", "laeuft", "alt-lauf"})
        self.assertFalse(os.path.exists(tmp.name))

    def test_start_raeumt_alte_auftraege_auf(self):
        alt = time.monotonic() - backup._TTL_FERTIG - 1
        tasks = {"alt": {"status": "error", "finished_at": alt}}
        backup._reservieren(tasks, "Import", {"status": "running"})
        self.assertNotIn("alt", tasks)


class StromTests(unittest.TestCase):
    def test_fertig_endet_mit_done_ohne_interna(self):
        tasks = {"a": {"status": "done", "file": "/x.zip", "finished_at": 1.0, "current": 1}}
        nachr = _lauf("a", tasks, "export")
        self.assertEqual(len(nachr), 1)
        self.assertEqual(nachr[0]["status"], "done")
        self.assertNotIn("file", nachr[0])
        self.assertNotIn("finished_at", nachr[0])

    def test_fehler_endet_mit_error(self):
        tasks = {"a": {"status": "error", "error": "kaputt"}}
        self.assertEqual(_lauf("a", tasks, "import")[-1]["error"], "kaputt")

    def test_unbekannter_auftrag_meldet_fehler(self):
        self.assertEqual(_lauf("nix", {}, "import")[-1]["status"], "error")

    def test_hoechstdauer_endet_mit_reconnect_statt_stillem_abbruch(self):
        alt = dict(backup._STREAM_MAX_S)
        backup._STREAM_MAX_S["import"] = 0.0
        try:
            tasks = {"a": {"status": "running", "current": 3}}
            nachr = _lauf("a", tasks, "import")
        finally:
            backup._STREAM_MAX_S.update(alt)
        self.assertTrue(nachr[-1]["reconnect"])
        self.assertEqual(nachr[-1]["status"], "running")


if __name__ == "__main__":
    unittest.main()
