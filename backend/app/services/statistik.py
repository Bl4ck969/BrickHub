"""Kennzahlen fuer das Dashboard. Reine Rechnung ueber die Sets, ohne Datenbank -
damit testbar. Sets ohne Teile- oder Preisangabe zaehlen bei den Summen mit 0,
bei Durchschnitt, Groesstem/Kleinstem und Preis pro Stein gar nicht."""
from collections import defaultdict
from typing import Iterable


def _kurz(s, **extra) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "manufacturer": s.manufacturer,
        "parts_count": s.parts_count,
        "price": s.price,
        "frontcover_thumbnail": s.frontcover_thumbnail,
        **extra,
    }


def statistik_berechnen(sets: Iterable) -> dict:
    sets = list(sets)
    mit_teilen = [s for s in sets if (s.parts_count or 0) > 0]
    mit_preis = [s for s in sets if (s.price or 0) > 0]
    mit_beidem = [s for s in mit_teilen if (s.price or 0) > 0]

    steine = sum(s.parts_count or 0 for s in sets)
    wert = round(sum(s.price or 0 for s in sets), 2)

    steinarten: dict[str, dict] = defaultdict(lambda: {"steine": 0, "sets": 0})
    hersteller: dict[str, dict] = defaultdict(lambda: {"steine": 0, "sets": 0})
    status: dict[str, int] = defaultdict(int)
    for s in sets:
        art = steinarten[s.stone_size or "Unbekannt"]
        art["steine"] += s.parts_count or 0
        art["sets"] += 1
        h = hersteller[s.manufacturer or "Unbekannt"]  # roh: der Link filtert exakt
        h["steine"] += s.parts_count or 0
        h["sets"] += 1
        status[s.status or "Unbekannt"] += 1

    # Gleichstand: der Name entscheidet - sonst springt der Platz bei jedem Laden
    nach_teilen = sorted(mit_teilen, key=lambda s: (-s.parts_count, s.name or ""))
    nach_preis = sorted(mit_preis, key=lambda s: (-s.price, s.name or ""))
    pro_stein = sorted(mit_beidem, key=lambda s: (s.price / s.parts_count, s.name or ""))

    return {
        "anzahl_sets": len(sets),
        "steine_gesamt": steine,
        "wert_gesamt": wert,
        "durchschnitt_preis": round(sum(s.price for s in mit_preis) / len(mit_preis), 2) if mit_preis else None,
        "durchschnitt_steine": round(sum(s.parts_count for s in mit_teilen) / len(mit_teilen)) if mit_teilen else None,
        "preis_pro_stein": round(
            sum(s.price for s in mit_beidem) / sum(s.parts_count for s in mit_beidem), 4
        ) if mit_beidem else None,
        "steinarten": sorted(
            ({"name": k, **v} for k, v in steinarten.items()),
            key=lambda r: (-r["steine"], r["name"]),
        ),
        "hersteller_top": sorted(
            ({"name": k, **v} for k, v in hersteller.items()),
            key=lambda r: (-r["sets"], -r["steine"], r["name"]),
        )[:10],
        "status": sorted(
            ({"name": k, "sets": v} for k, v in status.items()),
            key=lambda r: (-r["sets"], r["name"]),
        ),
        "groesstes": _kurz(nach_teilen[0]) if nach_teilen else None,
        "kleinstes": _kurz(nach_teilen[-1]) if nach_teilen else None,
        "teuerstes": _kurz(nach_preis[0]) if nach_preis else None,
        "guenstigstes": _kurz(nach_preis[-1]) if nach_preis else None,
        "bester_preis_pro_stein": _kurz(pro_stein[0], preis_pro_stein=round(pro_stein[0].price / pro_stein[0].parts_count, 4)) if pro_stein else None,
        "teuerster_preis_pro_stein": _kurz(pro_stein[-1], preis_pro_stein=round(pro_stein[-1].price / pro_stein[-1].parts_count, 4)) if pro_stein else None,
    }
