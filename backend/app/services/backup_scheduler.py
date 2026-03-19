"""Automatischer Backup-Scheduler.

Läuft als Hintergrund-Thread und erstellt Backups nach konfigurierbarem Zeitplan.
Einstellungen werden aus der AppSetting-Tabelle gelesen.
"""

import json
import logging
import os
import threading
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.database import SessionLocal
from app.models.box import Box
from app.models.set_model import BrickSet
from app.models.setting import AppSetting
from app.models.user import User

logger = logging.getLogger(__name__)

_BACKUP_VERSION = 1
_UPLOAD_BASE = Path(settings.upload_dir)
_BACKUP_DIR = Path(settings.backup_dir)
_CHECK_INTERVAL = 60  # Sekunden zwischen Prüfungen

_scheduler_thread: threading.Thread | None = None
_stop_event = threading.Event()

# ── Settings-Keys ────────────────────────────────────────────────────────────

SCHEDULE_KEYS = {
    "backup_enabled": "false",
    "backup_frequency": "weekly",   # daily, weekly, monthly
    "backup_day": "0",              # 0-6 (Mo-So) bei weekly, 1-28 bei monthly
    "backup_time": "02:00",         # HH:MM
    "backup_retention_count": "5",  # Max. Anzahl Backups (0 = unbegrenzt)
    "backup_retention_days": "0",   # Max. Alter in Tagen (0 = unbegrenzt)
    "backup_last_run": "",          # ISO-Zeitstempel des letzten Laufs
}


def _get_schedule_settings(db) -> dict:
    """Liest alle Backup-Schedule-Settings aus der DB."""
    result = dict(SCHEDULE_KEYS)
    rows = db.query(AppSetting).filter(AppSetting.key.in_(SCHEDULE_KEYS.keys())).all()
    for row in rows:
        result[row.key] = row.value or SCHEDULE_KEYS[row.key]
    return result


def _is_backup_due(cfg: dict) -> bool:
    """Prüft ob jetzt ein Backup fällig ist."""
    if cfg["backup_enabled"] != "true":
        return False

    now = datetime.now()
    target_time = cfg["backup_time"]
    try:
        target_h, target_m = int(target_time.split(":")[0]), int(target_time.split(":")[1])
    except (ValueError, IndexError):
        target_h, target_m = 2, 0

    # Nur innerhalb des Prüf-Fensters (±1 Minute)
    if abs(now.hour * 60 + now.minute - (target_h * 60 + target_m)) > 1:
        return False

    # Schon heute gelaufen?
    last_run = cfg["backup_last_run"]
    if last_run:
        try:
            last_dt = datetime.fromisoformat(last_run)
            if last_dt.date() == now.date():
                return False
        except ValueError:
            pass

    freq = cfg["backup_frequency"]
    if freq == "daily":
        return True
    elif freq == "weekly":
        try:
            target_days = [int(d) for d in cfg["backup_day"].split(",") if d.strip()]
        except ValueError:
            target_days = [0]
        return now.weekday() in target_days
    elif freq == "monthly":
        try:
            target_day = int(cfg["backup_day"])
        except ValueError:
            target_day = 1
        return now.day == target_day

    return False


def _create_backup() -> str | None:
    """Erstellt ein Backup-ZIP im backup_dir. Gibt den Dateinamen zurück."""
    db = SessionLocal()
    try:
        boxes = db.query(Box).all()
        sets = db.query(BrickSet).all()
        users = db.query(User).all()
        app_settings = db.query(AppSetting).all()

        data = {
            "version": _BACKUP_VERSION,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "type": "auto",
            "boxes": [
                {
                    "id": b.id, "name": b.name, "location": b.location,
                    "fill_level": b.fill_level, "allowed_stone_types": b.allowed_stone_types,
                    "created_at": b.created_at.isoformat() if b.created_at else None,
                }
                for b in boxes
            ],
            "sets": [
                {
                    "id": s.id, "name": s.name, "manufacturer": s.manufacturer,
                    "manufacturer_number": s.manufacturer_number, "parts_count": s.parts_count,
                    "stone_size": s.stone_size, "category": s.category, "subcategory": s.subcategory,
                    "status": s.status, "bag_count": s.bag_count, "plate_count": s.plate_count,
                    "price": s.price, "notes": s.notes, "onedrive_url": s.onedrive_url,
                    "box_id": s.box_id,
                    "frontcover_original": s.frontcover_original, "frontcover_edited": s.frontcover_edited,
                    "frontcover_thumbnail": s.frontcover_thumbnail, "frontcover_corners": s.frontcover_corners,
                    "backcover_original": s.backcover_original, "backcover_edited": s.backcover_edited,
                    "backcover_thumbnail": s.backcover_thumbnail, "backcover_corners": s.backcover_corners,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                }
                for s in sets
            ],
            "users": [
                {
                    "username": u.username, "password_hash": u.password_hash,
                    "role": u.role, "must_change_password": u.must_change_password,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                    "security_questions": [
                        {"question": q.question, "answer_hash": q.answer_hash}
                        for q in u.security_questions
                    ],
                }
                for u in users
            ],
            "settings": {s.key: s.value for s in app_settings if not s.key.startswith("backup_")},
        }

        # Bilder-Ordner sammeln
        added_folders: set[str] = set()
        folders: list[tuple[str, list[Path]]] = []
        for s in sets:
            for path in (s.frontcover_original, s.backcover_original, s.frontcover_thumbnail):
                if path:
                    parts = path.replace("\\", "/").split("/")
                    if len(parts) >= 3:
                        folder = parts[2]
                        if folder not in added_folders:
                            added_folders.add(folder)
                            folder_path = _UPLOAD_BASE / folder
                            if folder_path.is_dir():
                                files = [f for f in folder_path.iterdir() if f.is_file()]
                                if files:
                                    folders.append((folder, files))
                        break

        # ZIP erstellen
        date_str = datetime.now().strftime("%Y-%m-%d_%H-%M")
        filename = f"brickhub-auto-{date_str}.zip"
        filepath = _BACKUP_DIR / filename

        with zipfile.ZipFile(str(filepath), mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2))
            for folder_name, files in folders:
                for file_path in files:
                    zf.write(str(file_path), arcname=f"uploads/{folder_name}/{file_path.name}")

        # Letzten Lauf speichern
        _set_setting(db, "backup_last_run", datetime.now(timezone.utc).isoformat())
        db.commit()

        logger.info(f"Automatisches Backup erstellt: {filename}")
        return filename

    except Exception as e:
        logger.error(f"Automatisches Backup fehlgeschlagen: {e}")
        db.rollback()
        return None
    finally:
        db.close()


def _apply_retention(cfg: dict) -> None:
    """Löscht alte Backups basierend auf Retention-Einstellungen."""
    try:
        max_count = int(cfg["backup_retention_count"])
    except ValueError:
        max_count = 0
    try:
        max_days = int(cfg["backup_retention_days"])
    except ValueError:
        max_days = 0

    if max_count <= 0 and max_days <= 0:
        return

    backups = sorted(_BACKUP_DIR.glob("brickhub-auto-*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)

    now = time.time()
    for i, backup in enumerate(backups):
        should_delete = False

        if max_count > 0 and i >= max_count:
            should_delete = True

        if max_days > 0:
            age_days = (now - backup.stat().st_mtime) / 86400
            if age_days > max_days:
                should_delete = True

        if should_delete:
            try:
                backup.unlink()
                logger.info(f"Altes Backup gelöscht: {backup.name}")
            except OSError as e:
                logger.error(f"Fehler beim Löschen von {backup.name}: {e}")


def _set_setting(db, key: str, value: str) -> None:
    """Setzt einen AppSetting-Wert."""
    existing = db.query(AppSetting).filter(AppSetting.key == key).first()
    if existing:
        existing.value = value
    else:
        db.add(AppSetting(key=key, value=value))


def _scheduler_loop() -> None:
    """Hauptschleife des Schedulers."""
    logger.info("Backup-Scheduler gestartet")
    while not _stop_event.is_set():
        try:
            db = SessionLocal()
            try:
                cfg = _get_schedule_settings(db)
                if _is_backup_due(cfg):
                    logger.info("Automatisches Backup wird gestartet...")
                    _create_backup()
                    # Retention nach Backup anwenden
                    cfg["backup_last_run"] = datetime.now(timezone.utc).isoformat()
                    _apply_retention(cfg)
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Scheduler-Fehler: {e}")

        _stop_event.wait(_CHECK_INTERVAL)

    logger.info("Backup-Scheduler gestoppt")


def start_scheduler() -> None:
    """Startet den Scheduler-Thread."""
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        return
    _stop_event.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True, name="backup-scheduler")
    _scheduler_thread.start()


def stop_scheduler() -> None:
    """Stoppt den Scheduler-Thread."""
    _stop_event.set()


def list_auto_backups() -> list[dict]:
    """Listet alle automatischen Backups mit Metadaten."""
    backups = []
    for f in sorted(_BACKUP_DIR.glob("brickhub-auto-*.zip"), key=lambda p: p.stat().st_mtime, reverse=True):
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "size_mb": round(stat.st_size / 1024 / 1024, 1),
            "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        })
    return backups
