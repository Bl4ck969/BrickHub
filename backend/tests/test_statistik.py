"""Tests fuer app/services/statistik.py - reine Rechnung, keine Datenbank.
Lauf (aus backend/): python -m pytest -q tests/test_statistik.py
"""
from types import SimpleNamespace

from app.services.statistik import statistik_berechnen


def _set(i, name, hersteller="A", teile=100, preis=10.0, art="Standard", status="Neu"):
    return SimpleNamespace(id=i, name=name, manufacturer=hersteller, parts_count=teile, price=preis,
                           stone_size=art, status=status, frontcover_thumbnail=None)


def test_leere_sammlung():
    r = statistik_berechnen([])
    assert r["anzahl_sets"] == 0 and r["steine_gesamt"] == 0 and r["wert_gesamt"] == 0
    assert r["durchschnitt_preis"] is None and r["groesstes"] is None and r["hersteller_top"] == []


def test_kennzahlen_und_extreme():
    sets = [
        _set(1, "Burg", "B", 8000, 300.0, "Standard", "Eingelagert"),
        _set(2, "Katze", "C", 20, 5.0, "Mini", "Neu"),
        _set(3, "Ohne Preis", "B", 500, None, "Diamond", "Neu"),
        _set(4, "Ohne Teile", "A", None, 50.0, "Standard", "Aufgebaut"),
    ]
    r = statistik_berechnen(sets)
    assert r["anzahl_sets"] == 4
    assert r["steine_gesamt"] == 8520
    assert r["wert_gesamt"] == 355.0
    # Durchschnitt nur ueber Sets mit Angabe
    assert r["durchschnitt_preis"] == round(355.0 / 3, 2)
    assert r["durchschnitt_steine"] == round(8520 / 3)
    assert r["groesstes"]["name"] == "Burg" and r["kleinstes"]["name"] == "Katze"
    assert r["teuerstes"]["name"] == "Burg" and r["guenstigstes"]["name"] == "Katze"
    # Preis pro Stein: Burg 0,0375 €, Katze 0,25 €
    assert r["bester_preis_pro_stein"]["name"] == "Burg"
    assert r["teuerster_preis_pro_stein"]["name"] == "Katze"
    assert r["preis_pro_stein"] == round(305.0 / 8020, 4)
    assert r["steinarten"][0] == {"name": "Standard", "steine": 8000, "sets": 2}
    assert r["hersteller_top"][0] == {"name": "B", "steine": 8500, "sets": 2}
    assert {x["name"]: x["sets"] for x in r["status"]} == {"Neu": 2, "Eingelagert": 1, "Aufgebaut": 1}


def test_top10_schneidet_ab_und_ist_stabil():
    sets = [_set(i, f"S{i}", f"H{i:02d}") for i in range(15)]
    top = statistik_berechnen(sets)["hersteller_top"]
    assert len(top) == 10
    assert [h["name"] for h in top] == [f"H{i:02d}" for i in range(10)]  # Gleichstand -> alphabetisch
