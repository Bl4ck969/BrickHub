"""Tests für app/fehler.py. Lauf (aus backend/): python -m unittest discover -s tests

Braucht nur fastapi + httpx, importiert bewusst nicht app.main (zieht rembg/opencv/DB nach sich).
"""
import unittest

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.fehler import AppFehler, register_handlers


class Eingabe(BaseModel):
    username: str = Field(min_length=3)
    anzahl: int


def _app() -> FastAPI:
    app = FastAPI()
    register_handlers(app)

    @app.post("/eingabe")
    def eingabe(e: Eingabe):
        return {"ok": True}

    @app.get("/fach")
    def fach():
        raise AppFehler("KONFLIKT")

    @app.get("/fach-text")
    def fach_text():
        raise AppFehler("NICHT_GEFUNDEN", "Set nicht gefunden")

    @app.get("/http")
    def http():
        raise HTTPException(status_code=400, detail="Eigener Text")

    @app.get("/http-401")
    def http401():
        raise HTTPException(status_code=401, detail="Nein", headers={"WWW-Authenticate": "Bearer"})

    @app.get("/kaputt")
    def kaputt():
        raise RuntimeError("geheimes Detail /pfad/zur/db")

    return app


class FehlerTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(_app(), raise_server_exceptions=False)

    def test_422_detail_ist_deutscher_text_nie_liste(self):
        r = self.client.post("/eingabe", json={"username": "ab"})
        self.assertEqual(r.status_code, 422)
        body = r.json()
        self.assertIsInstance(body["detail"], str)
        self.assertEqual(body["code"], "VALIDIERUNG")
        self.assertIn("Benutzername ist zu kurz", body["detail"])
        self.assertIn("anzahl fehlt", body["detail"])

    def test_422_ohne_json_body(self):
        r = self.client.post("/eingabe", content="kein json", headers={"Content-Type": "application/json"})
        self.assertEqual(r.status_code, 422)
        self.assertIsInstance(r.json()["detail"], str)
        self.assertTrue(r.json()["detail"])

    def test_app_fehler_mit_katalogtext_und_code(self):
        r = self.client.get("/fach")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["code"], "KONFLIKT")
        self.assertTrue(r.json()["detail"])

    def test_app_fehler_mit_eigenem_text(self):
        r = self.client.get("/fach-text")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json(), {"detail": "Set nicht gefunden", "code": "NICHT_GEFUNDEN"})

    def test_unbekannter_code_wird_abgelehnt(self):
        with self.assertRaises(ValueError):
            AppFehler("GIBT_ES_NICHT")

    def test_http_exception_text_bleibt_und_header_bleiben(self):
        r = self.client.get("/http")
        self.assertEqual((r.status_code, r.json()["detail"]), (400, "Eigener Text"))
        r = self.client.get("/http-401")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.headers.get("www-authenticate"), "Bearer")

    def test_unerwarteter_fehler_ohne_interna_und_mit_log(self):
        with self.assertLogs("app.fehler", level="ERROR") as log:
            r = self.client.get("/kaputt")
        self.assertEqual(r.status_code, 500)
        self.assertEqual(r.json()["code"], "INTERN")
        self.assertNotIn("geheimes", r.text)
        self.assertIn("/kaputt", log.output[0])
        self.assertIn("geheimes Detail", "\n".join(log.output))  # Ursache steht im Log


if __name__ == "__main__":
    unittest.main()
