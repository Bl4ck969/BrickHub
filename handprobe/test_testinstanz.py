"""Tests für handprobe/testinstanz.py (Karte BH-1). Nur Standardbibliothek, ohne Docker:

    python -I -m unittest discover -s handprobe -p "test_*.py"

Docker und HTTP sind ersetzt; geprüft werden die Prüfungen, die Reihenfolge und die Fehlerfälle.
Der echte Lauf gegen Docker steht in docs/release-ablauf.md („Testinstanz“).
"""

from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import testinstanz as ti  # noqa: E402

NAME = "brickhub-auto-2026-11-23_02-00"


def lege_sicherung(wurzel: Path, name: str = NAME, daten: dict | None = None, zip_name: str | None = None) -> Path:
    ordner = wurzel / name
    ordner.mkdir()
    if daten is None:
        daten = {"version": 1, "sets": [{"name": "A"}, {"name": "B"}], "boxes": [{"id": 1}],
                 "users": [{"username": "andreas", "role": "admin"}]}
    with zipfile.ZipFile(ordner / (zip_name or f"{name}.zip"), "w") as zf:
        zf.writestr("data.json", json.dumps(daten))
        zf.writestr("uploads/LEGO - X/Front.jpg", b"bild")
    return ordner


class Fertig:
    def __init__(self, code=0, stdout="", stderr=""):
        self.returncode, self.stdout, self.stderr = code, stdout, stderr


class PruefungenTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.wurzel = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_gueltige_sicherung_liefert_mengen(self):
        ordner = lege_sicherung(self.wurzel)
        self.assertEqual(ti.pruefe_sicherung(ordner), {"sets": 2, "users": 1, "boxes": 1})

    def test_sicherung_bleibt_unveraendert(self):
        ordner = lege_sicherung(self.wurzel)
        vorher = sorted(p.name for p in ordner.iterdir())
        abdruck = ti.fingerabdruck(ti.zip_der_sicherung(ordner))
        ti.pruefe_sicherung(ordner)
        self.assertEqual(sorted(p.name for p in ordner.iterdir()), vorher)
        self.assertEqual(ti.fingerabdruck(ti.zip_der_sicherung(ordner)), abdruck)

    def test_falscher_ordnername(self):
        ordner = lege_sicherung(self.wurzel, name="20261120_010000-allmybooks")
        with self.assertRaises(ti.Abbruch) as fall:
            ti.pruefe_sicherung(ordner)
        self.assertEqual(fall.exception.code, 2)

    def test_zip_mit_anderem_namen_fehlt(self):
        ordner = lege_sicherung(self.wurzel, zip_name="brickhub-auto-2026-11-16_02-00.zip")
        with self.assertRaises(ti.Abbruch) as fall:
            ti.pruefe_sicherung(ordner)
        self.assertEqual(fall.exception.code, 2)
        self.assertIn("fehlt", str(fall.exception))

    def test_kaputte_zip(self):
        ordner = self.wurzel / NAME
        ordner.mkdir()
        (ordner / f"{NAME}.zip").write_bytes(b"kein zip")
        with self.assertRaises(ti.Abbruch) as fall:
            ti.pruefe_sicherung(ordner)
        self.assertEqual(fall.exception.code, 2)

    def test_falsche_version(self):
        ordner = lege_sicherung(self.wurzel, daten={"version": 2, "users": [{"username": "a"}]})
        with self.assertRaises(ti.Abbruch) as fall:
            ti.pruefe_sicherung(ordner)
        self.assertIn("Version 2", str(fall.exception))

    def test_sicherung_ohne_benutzer_wird_abgelehnt(self):
        # Ohne Konto könnte nach dem Einspielen jeder erster Admin werden.
        ordner = lege_sicherung(self.wurzel, daten={"version": 1, "sets": [{"name": "A"}], "users": []})
        with self.assertRaises(ti.Abbruch) as fall:
            ti.pruefe_sicherung(ordner)
        self.assertEqual(fall.exception.code, 2)

    def test_gesperrte_und_ungueltige_namen(self):
        for name in ("brickhub", "Brickhub", "bad name", ""):
            with self.subTest(name=name), self.assertRaises(ti.Abbruch) as fall:
                ti.pruefe_name(name)
            self.assertEqual(fall.exception.code, 2)
        ti.pruefe_name("handprobe-bh-1")

    def test_ablageort_gespiegelt_oder_repo(self):
        for pfad in ("E:/Setups/x/" + NAME, "C:/Users/a/OneDrive/x/" + NAME, str(ti.HIER.parent / NAME)):
            with self.subTest(pfad=pfad), self.assertRaises(ti.Abbruch):
                ti.pruefe_ablageort(Path(pfad))
        ti.pruefe_ablageort(self.wurzel / NAME)

    def test_marke(self):
        self.assertTrue(ti.traegt_marke({"Labels": f"a=b,{ti.MARKE}=1"}))
        self.assertFalse(ti.traegt_marke({"Labels": "com.docker.compose.project=brickhub"}))
        self.assertFalse(ti.traegt_marke({}))


class HttpHilfenTest(unittest.TestCase):
    def test_cookie_aus_set_cookie(self):
        koepfe = mock.Mock()
        koepfe.get_all.return_value = ["access_token=abc.def; HttpOnly; Max-Age=28800; Path=/; SameSite=lax"]
        self.assertEqual(ti.cookie_aus(koepfe), "abc.def")
        koepfe.get_all.return_value = None
        self.assertIsNone(ti.cookie_aus(koepfe))

    def test_sse_ereignisse(self):
        zeilen = [b'data: {"status": "running"}', b"", b"data: kaputt", b'data: {"status": "done"}']
        self.assertEqual([e["status"] for e in ti.sse_ereignisse(zeilen)], ["running", "done"])

    def test_multipart_laenge_stimmt(self):
        with tempfile.TemporaryDirectory() as tmp:
            datei = Path(tmp) / "x.zip"
            datei.write_bytes(os.urandom(3 * 1024 + 7))
            (kopf, fuss), laenge = ti.multipart(datei, "grenze")
            strom = b"".join(ti.upload_strom(datei, kopf, fuss, stueck=1000))
            self.assertEqual(len(strom), laenge)
            self.assertTrue(strom.startswith(b"--grenze"))
            self.assertTrue(strom.endswith(b"--grenze--" + ti.CRLF))
            self.assertIn(b'name="file"', kopf)


class BewertungTest(unittest.TestCase):
    ERWARTET = {"sets": 2, "users": 1, "boxes": 1}
    GUT = {"sets": 2, "users": 1, "boxes": 1, "admins": 1, "wegwerf": 0,
           "backup_enabled": "false", "ollama_enabled": False}

    def test_alles_angekommen(self):
        ti.bewerte_stand(dict(self.GUT), self.ERWARTET)

    def test_fehlerfaelle(self):
        faelle = {
            "sets fehlen": {"sets": 0},
            "Wegwerf-Admin noch da": {"wegwerf": 1},
            "kein Admin": {"admins": 0},
            "Sicherung an": {"backup_enabled": "true"},
            "Sicherung nie gesetzt": {"backup_enabled": None},
            "Ollama an": {"ollama_enabled": True},
        }
        for titel, aenderung in faelle.items():
            with self.subTest(titel), self.assertRaises(ti.Abbruch):
                ti.bewerte_stand({**self.GUT, **aenderung}, self.ERWARTET)


class BauenAblaufTest(unittest.TestCase):
    """bauen() mit ersetztem Docker und HTTP: Reihenfolge und Notbremse."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ordner = lege_sicherung(Path(self.tmp.name))
        self.schritte: list[str] = []
        self.stand = dict(BewertungTest.GUT)
        flicken = {
            "pruefe_docker_desktop": lambda: None,
            "container_des_projekts": lambda name: [],
            "volumes_des_projekts": lambda name: [],
            "port_belegt": lambda port: False,
            "docker": lambda args, *a, **k: Fertig(0, "sha256:abc"),
            "compose": self._compose,
            "warte_auf_app": lambda *a: self.schritte.append("gesund"),
            "wegwerf_admin": lambda basis: (self.schritte.append("admin"), ("handprobe-x", "pw", "keks"))[1],
            "sicherungsplan_aus": lambda basis, keks: self.schritte.append("plan aus"),
            "starte_einspielen": lambda basis, keks, datei: (self.schritte.append("upload"), "t1")[1],
            "warte_auf_einspielen": lambda *a: {"sets": 2, "users_imported": 1, "users_skipped": 0},
            "stand_in_der_datenbank": lambda *a: self.stand,
        }
        self.patches = [mock.patch.object(ti, k, v) for k, v in flicken.items()]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def _compose(self, name, args, umgebung, zeitlimit=900):
        self.schritte.append("compose " + " ".join(args[:2]))
        return Fertig(0)

    def _bauen(self):
        with mock.patch("sys.stdout", new=io.StringIO()):
            ti.bauen("handprobe-bh-1", 3830, "agent:test", self.ordner)

    def test_reihenfolge(self):
        self._bauen()
        self.assertEqual(self.schritte, ["compose up -d", "gesund", "admin", "plan aus", "upload"])

    def test_admin_vor_upload_und_plan_vor_upload(self):
        # Ohne Admin vor den echten Daten könnte jeder erster Admin werden; ohne Plan-Aus
        # vor dem Einspielen gäbe es danach kein gültiges Cookie mehr zum Abschalten.
        self._bauen()
        self.assertLess(self.schritte.index("admin"), self.schritte.index("upload"))
        self.assertLess(self.schritte.index("plan aus"), self.schritte.index("upload"))

    def test_fehler_nach_upload_haelt_app_an(self):
        self.stand["sets"] = 0
        with self.assertRaises(ti.Abbruch):
            self._bauen()
        self.assertEqual(self.schritte[-1], "compose stop app")

    def test_einspielen_meldet_fehler(self):
        def scheitert(*a):
            raise ti.Abbruch("Einspielen gescheitert: Ungültige ZIP-Datei")
        with mock.patch.object(ti, "warte_auf_einspielen", scheitert), self.assertRaises(ti.Abbruch):
            self._bauen()
        self.assertEqual(self.schritte[-1], "compose stop app")

    def test_uebersprungene_benutzer(self):
        with mock.patch.object(ti, "warte_auf_einspielen", lambda *a: {"users_skipped": 1}), \
                self.assertRaises(ti.Abbruch):
            self._bauen()

    def test_vorhandenes_projekt_wird_nicht_angefasst(self):
        with mock.patch.object(ti, "volumes_des_projekts", lambda name: [{"Name": "alt"}]), \
                self.assertRaises(ti.Abbruch) as fall:
            self._bauen()
        self.assertEqual(fall.exception.code, 2)
        self.assertEqual(self.schritte, [])

    def test_veraenderte_kopie_wird_gemeldet(self):
        abdrucke = iter([(1, 1), (2, 2)])
        with mock.patch.object(ti, "fingerabdruck", lambda datei: next(abdrucke)), \
                self.assertRaises(ti.Abbruch) as fall:
            self._bauen()
        self.assertIn("verändert", str(fall.exception))


class WegwerfAdminTest(unittest.TestCase):
    def test_schon_vergeben(self):
        with mock.patch.object(ti, "http", lambda *a, **k: (403, {"detail": "x"}, None)), \
                mock.patch("sys.stdout", new=io.StringIO()), self.assertRaises(ti.Abbruch) as fall:
            ti.wegwerf_admin("http://127.0.0.1:1")
        self.assertIn("übernommen", str(fall.exception))

    def test_passwort_erfuellt_regeln(self):
        pw = ti.wegwerf_passwort()
        self.assertTrue(len(pw) >= 8 and any(c.isupper() for c in pw)
                        and any(c.islower() for c in pw) and any(c.isdigit() for c in pw))


class AbraeumenTest(unittest.TestCase):
    def test_fremdes_projekt_wird_abgelehnt(self):
        aufrufe = []
        with mock.patch.object(ti, "pruefe_docker_desktop", lambda: None), \
                mock.patch.object(ti, "container_des_projekts",
                                  lambda n: [{"Names": "brickhub", "Labels": "com.docker.compose.project=x"}]), \
                mock.patch.object(ti, "volumes_des_projekts", lambda n: []), \
                mock.patch.object(ti, "compose", lambda *a, **k: aufrufe.append(a)), \
                self.assertRaises(ti.Abbruch) as fall:
            ti.abraeumen("handprobe-bh-1")
        self.assertEqual(fall.exception.code, 2)
        self.assertEqual(aufrufe, [])

    def test_main_exitcodes(self):
        with mock.patch("sys.stdout", new=io.StringIO()), mock.patch("sys.stderr", new=io.StringIO()):
            self.assertEqual(ti.main(["bauen", "--name", "brickhub", "--port", "1", "--image", "x",
                                      "--sicherung", "."]), 2)
            self.assertEqual(ti.main(["unbekannt"]), 2)


if __name__ == "__main__":
    unittest.main()
