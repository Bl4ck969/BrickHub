import asyncio
import io
import json
import os
import shutil
import tempfile
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.config import settings
from app.database import SessionLocal, get_db
from app.models.box import Box
from app.models.set_model import BrickSet
from app.models.setting import AppSetting
from app.models.user import User, SecurityQuestion
from app.services.backup_scheduler import (
    SCHEDULE_KEYS, _get_schedule_settings, _set_setting,
    list_auto_backups, _apply_retention, _create_backup,
)
from app.utils.auth import require_admin

router = APIRouter(prefix="/api/backup", tags=["backup"])

_BACKUP_VERSION = 1
_CHUNK_SIZE = 1024 * 1024  # 1 MB
_UPLOAD_BASE = Path(settings.upload_dir)
_ALLOWED_SETTING_KEYS = {"onedrive_base_url"}

# In-Memory Task-Stores
_export_tasks: dict[str, dict] = {}
_import_tasks: dict[str, dict] = {}


def _get_set_folder(s: BrickSet) -> str | None:
    """Extrahiert den Ordnernamen aus DB-Bildpfaden. z.B. 'data/uploads/LEGO - X/...' → 'LEGO - X'"""
    for path in (s.frontcover_original, s.backcover_original, s.frontcover_thumbnail):
        if path:
            parts = path.replace("\\", "/").split("/")
            if len(parts) >= 3:
                return parts[2]
    return None


# ─── EXPORT ───────────────────────────────────────────────────────────────────

def _run_export(task_id: str, data: dict, folders: list[tuple[str, list[Path]]]) -> None:
    """Baut die ZIP-Datei in einem Hintergrundthread."""
    task = _export_tasks[task_id]
    tmp_path = None
    try:
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        tmp_path = tmp.name
        tmp.close()

        task["total"] = len(folders)

        with zipfile.ZipFile(tmp_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            task["current_name"] = "Metadaten werden geschrieben…"
            zf.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2))

            for i, (folder_name, files) in enumerate(folders):
                task["current"] = i + 1
                task["current_name"] = folder_name
                for file_path in files:
                    zf.write(file_path, arcname=f"uploads/{folder_name}/{file_path.name}")

        task["status"] = "done"
        task["file"] = tmp_path
    except Exception as e:
        task["status"] = "error"
        task["error"] = str(e)
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@router.post("/export/start", dependencies=[Depends(require_admin)])
def start_export(db: Session = Depends(get_db)):
    """Startet den ZIP-Export als Hintergrundaufgabe und gibt eine task_id zurück."""
    boxes = db.query(Box).all()
    sets = db.query(BrickSet).all()
    users = db.query(User).all()
    app_settings = db.query(AppSetting).all()

    data = {
        "version": _BACKUP_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "boxes": [
            {
                "id": b.id,
                "name": b.name,
                "location": b.location,
                "fill_level": b.fill_level,
                "allowed_stone_types": b.allowed_stone_types,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in boxes
        ],
        "sets": [
            {
                "id": s.id,
                "name": s.name,
                "manufacturer": s.manufacturer,
                "manufacturer_number": s.manufacturer_number,
                "parts_count": s.parts_count,
                "stone_size": s.stone_size,
                "category": s.category,
                "subcategory": s.subcategory,
                "status": s.status,
                "bag_count": s.bag_count,
                "plate_count": s.plate_count,
                "price": s.price,
                "notes": s.notes,
                "onedrive_url": s.onedrive_url,
                "box_id": s.box_id,
                "frontcover_original": s.frontcover_original,
                "frontcover_edited": s.frontcover_edited,
                "frontcover_thumbnail": s.frontcover_thumbnail,
                "frontcover_corners": s.frontcover_corners,
                "backcover_original": s.backcover_original,
                "backcover_edited": s.backcover_edited,
                "backcover_thumbnail": s.backcover_thumbnail,
                "backcover_corners": s.backcover_corners,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in sets
        ],
        "users": [
            {
                "username": u.username,
                "password_hash": u.password_hash,
                "role": u.role,
                "must_change_password": u.must_change_password,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "security_questions": [
                    {"question": q.question, "answer_hash": q.answer_hash}
                    for q in u.security_questions
                ],
            }
            for u in users
        ],
        "settings": {s.key: s.value for s in app_settings},
    }

    # Ordner + Dateien noch im Request-Thread einsammeln (DB-Session aktiv)
    added_folders: set[str] = set()
    folders: list[tuple[str, list[Path]]] = []
    for s in sets:
        folder = _get_set_folder(s)
        if not folder or folder in added_folders:
            continue
        added_folders.add(folder)
        folder_path = _UPLOAD_BASE / folder
        if folder_path.is_dir():
            files = [f for f in folder_path.iterdir() if f.is_file()]
            if files:
                folders.append((folder, files))

    task_id = str(uuid.uuid4())
    _export_tasks[task_id] = {
        "status": "running",
        "current": 0,
        "total": len(folders),
        "current_name": "Wird vorbereitet…",
    }

    t = threading.Thread(target=_run_export, args=(task_id, data, folders), daemon=True)
    t.start()

    return {"task_id": task_id}


@router.get("/export/progress/{task_id}", dependencies=[Depends(require_admin)])
async def export_progress(task_id: str):
    """SSE-Stream mit Fortschrittsinfo für den laufenden Export."""
    async def generate():
        for _ in range(1200):  # max 10 Minuten (0,5 s Intervall)
            task = _export_tasks.get(task_id)
            if not task:
                yield f"data: {json.dumps({'status': 'error', 'error': 'Task nicht gefunden'})}\n\n"
                return
            payload = {k: v for k, v in task.items() if k != "file"}
            yield f"data: {json.dumps(payload)}\n\n"
            if task["status"] in ("done", "error"):
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/export/download/{task_id}", dependencies=[Depends(require_admin)])
def export_download(task_id: str):
    """Liefert die fertige ZIP-Datei und löscht den Task danach."""
    task = _export_tasks.pop(task_id, None)
    if not task or task.get("status") != "done" or not task.get("file"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Export nicht bereit oder bereits abgelaufen")

    file_path = task["file"]
    date_str = datetime.now().strftime("%Y-%m-%d")

    def _cleanup():
        try:
            os.unlink(file_path)
        except OSError:
            pass

    return FileResponse(
        file_path,
        media_type="application/zip",
        filename=f"brickhub-backup-{date_str}.zip",
        background=BackgroundTask(_cleanup),
    )


# ─── IMPORT ───────────────────────────────────────────────────────────────────

def _run_import(task_id: str, zip_path: str, mode: str) -> None:
    """Verarbeitet das Backup-ZIP in einem Hintergrundthread."""
    task = _import_tasks[task_id]
    db = SessionLocal()
    try:
        # Validierung
        task["phase"] = "validating"
        task["current_name"] = "Backup wird geprüft…"
        task["current"] = 0
        task["total"] = 0

        try:
            zf = zipfile.ZipFile(zip_path)
        except zipfile.BadZipFile:
            raise ValueError("Ungültige ZIP-Datei")

        if "data.json" not in zf.namelist():
            raise ValueError("data.json fehlt im ZIP")

        try:
            data = json.loads(zf.read("data.json"))
        except Exception:
            raise ValueError("data.json ist kein gültiges JSON")

        if data.get("version") != _BACKUP_VERSION:
            raise ValueError(f"Inkompatible Backup-Version: {data.get('version')}")

        # Zip-Slip-Schutz
        extract_base = _UPLOAD_BASE.resolve().parent
        for member in zf.namelist():
            if member == "data.json" or not member.startswith("uploads/"):
                continue
            dest = (extract_base / member).resolve()
            if not str(dest).startswith(str(extract_base)):
                raise ValueError(f"Ungültiger Pfad im ZIP: {member}")

        # Modus "replace": erst alles löschen
        if mode == "replace":
            task["current_name"] = "Bestehende Daten werden gelöscht…"
            db.query(BrickSet).delete()
            db.query(Box).delete()
            db.query(SecurityQuestion).delete()
            db.query(User).delete()
            db.flush()
            if _UPLOAD_BASE.is_dir():
                shutil.rmtree(str(_UPLOAD_BASE))
            _UPLOAD_BASE.mkdir(parents=True, exist_ok=True)

        # Phase 1: Bilder extrahieren
        task["phase"] = "extracting"
        image_members = [m for m in zf.namelist() if m.startswith("uploads/") and not m.endswith("/")]
        task["total"] = len(image_members)
        images_extracted = 0
        for i, member in enumerate(image_members):
            task["current"] = i + 1
            task["current_name"] = member.split("/")[-1]
            dest = (extract_base / member).resolve()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(zf.read(member))
            images_extracted += 1

        # Phase 2: Kisten anlegen
        task["phase"] = "importing"
        task["current_name"] = "Kisten werden angelegt…"
        task["current"] = 0
        task["total"] = 0
        box_id_map: dict[int, int] = {}
        boxes_imported = 0
        for b in data.get("boxes", []):
            new_box = Box(
                name=b["name"],
                location=b.get("location"),
                fill_level=b.get("fill_level", 0),
                allowed_stone_types=b.get("allowed_stone_types", "[]"),
            )
            db.add(new_box)
            db.flush()
            box_id_map[b["id"]] = new_box.id
            boxes_imported += 1

        # Phase 3: Sets anlegen
        sets_data = data.get("sets", [])
        task["current_name"] = "Sets werden angelegt…"
        task["total"] = len(sets_data)
        sets_imported = 0
        for i, s in enumerate(sets_data):
            task["current"] = i + 1
            old_box_id = s.get("box_id")
            new_box_id = box_id_map.get(old_box_id) if old_box_id is not None else None
            db.add(BrickSet(
                name=s["name"],
                manufacturer=s.get("manufacturer"),
                manufacturer_number=s.get("manufacturer_number"),
                parts_count=s.get("parts_count"),
                stone_size=s.get("stone_size"),
                category=s.get("category"),
                subcategory=s.get("subcategory"),
                status=s.get("status", "Neu"),
                bag_count=s.get("bag_count"),
                plate_count=s.get("plate_count"),
                price=s.get("price"),
                notes=s.get("notes"),
                onedrive_url=s.get("onedrive_url"),
                box_id=new_box_id,
                frontcover_original=s.get("frontcover_original"),
                frontcover_edited=s.get("frontcover_edited"),
                frontcover_thumbnail=s.get("frontcover_thumbnail"),
                frontcover_corners=s.get("frontcover_corners"),
                backcover_original=s.get("backcover_original"),
                backcover_edited=s.get("backcover_edited"),
                backcover_thumbnail=s.get("backcover_thumbnail"),
                backcover_corners=s.get("backcover_corners"),
            ))
            sets_imported += 1

        # Phase 4: Benutzer anlegen
        task["current_name"] = "Benutzer werden angelegt…"
        task["current"] = 0
        task["total"] = 0
        users_imported = users_skipped = 0
        for u in data.get("users", []):
            if db.query(User).filter(User.username == u["username"]).first():
                users_skipped += 1
                continue
            new_user = User(
                username=u["username"],
                password_hash=u["password_hash"],
                role=u.get("role", "user"),
                must_change_password=u.get("must_change_password", False),
            )
            db.add(new_user)
            db.flush()
            for q in u.get("security_questions", []):
                db.add(SecurityQuestion(
                    user_id=new_user.id,
                    question=q["question"],
                    answer_hash=q["answer_hash"],
                ))
            users_imported += 1

        # Phase 5: Settings
        for key, value in data.get("settings", {}).items():
            if key not in _ALLOWED_SETTING_KEYS:
                continue
            existing = db.query(AppSetting).filter(AppSetting.key == key).first()
            if existing:
                existing.value = value
            else:
                db.add(AppSetting(key=key, value=value))

        db.commit()

        task["status"] = "done"
        task["result"] = {
            "sets": sets_imported,
            "boxes": boxes_imported,
            "users_imported": users_imported,
            "users_skipped": users_skipped,
            "images": images_extracted,
        }
    except Exception as e:
        db.rollback()
        task["status"] = "error"
        task["error"] = str(e)
    finally:
        db.close()
        try:
            os.unlink(zip_path)
        except OSError:
            pass


@router.post("/import/start", dependencies=[Depends(require_admin)])
async def start_import(
    file: UploadFile = File(...),
    mode: str = Query("append", pattern="^(append|replace)$"),
):
    """Nimmt die ZIP-Datei entgegen, speichert sie temporär und startet die Verarbeitung im Hintergrund."""
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp_path = tmp.name
    try:
        while True:
            chunk = await file.read(_CHUNK_SIZE)
            if not chunk:
                break
            tmp.write(chunk)
    finally:
        tmp.close()

    task_id = str(uuid.uuid4())
    _import_tasks[task_id] = {
        "status": "running",
        "phase": "validating",
        "current": 0,
        "total": 0,
        "current_name": "Wird vorbereitet…",
    }

    t = threading.Thread(target=_run_import, args=(task_id, tmp_path, mode), daemon=True)
    t.start()

    return {"task_id": task_id}


@router.get("/import/progress/{task_id}", dependencies=[Depends(require_admin)])
async def import_progress(task_id: str):
    """SSE-Stream mit Fortschrittsinfo für den laufenden Import."""
    async def generate():
        for _ in range(2400):  # max 20 Minuten (0,5 s Intervall)
            task = _import_tasks.get(task_id)
            if not task:
                yield f"data: {json.dumps({'status': 'error', 'error': 'Task nicht gefunden'})}\n\n"
                return
            yield f"data: {json.dumps(task)}\n\n"
            if task["status"] in ("done", "error"):
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── AUTOMATISCHE BACKUPS ────────────────────────────────────────────────────


@router.get("/schedule", dependencies=[Depends(require_admin)])
def get_schedule(db: Session = Depends(get_db)):
    """Gibt die aktuellen Backup-Schedule-Einstellungen zurück."""
    return _get_schedule_settings(db)


@router.put("/schedule", dependencies=[Depends(require_admin)])
def update_schedule(body: dict, db: Session = Depends(get_db)):
    """Aktualisiert die Backup-Schedule-Einstellungen."""
    allowed = set(SCHEDULE_KEYS.keys()) - {"backup_last_run"}
    for key, value in body.items():
        if key in allowed:
            _set_setting(db, key, str(value))
    db.commit()
    return _get_schedule_settings(db)


@router.get("/auto-backups", dependencies=[Depends(require_admin)])
def get_auto_backups():
    """Listet alle automatisch erstellten Backups."""
    return list_auto_backups()


@router.post("/auto-backups/run-now", dependencies=[Depends(require_admin)])
def run_backup_now():
    """Erstellt sofort ein automatisches Backup."""
    filename = _create_backup()
    if not filename:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Backup fehlgeschlagen")
    return {"filename": filename}


@router.get("/auto-backups/download/{filename}", dependencies=[Depends(require_admin)])
def download_auto_backup(filename: str):
    """Lädt ein automatisches Backup herunter."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger Dateiname")
    filepath = Path(settings.backup_dir) / filename
    if not filepath.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup nicht gefunden")
    return FileResponse(str(filepath), media_type="application/zip", filename=filename)


@router.delete("/auto-backups/{filename}", dependencies=[Depends(require_admin)])
def delete_auto_backup(filename: str):
    """Löscht ein einzelnes automatisches Backup."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger Dateiname")
    filepath = Path(settings.backup_dir) / filename
    if not filepath.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup nicht gefunden")
    filepath.unlink()
    return {"deleted": filename}
