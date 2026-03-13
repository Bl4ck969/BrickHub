import io
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.box import Box
from app.models.set_model import BrickSet
from app.models.setting import AppSetting
from app.models.user import User, SecurityQuestion
from app.utils.auth import require_admin

router = APIRouter(prefix="/api/backup", tags=["backup"])

_BACKUP_VERSION = 1
_MAX_IMPORT_SIZE = 500 * 1024 * 1024  # 500 MB
_CHUNK_SIZE = 1024 * 1024              # 1 MB
_UPLOAD_BASE = Path(settings.upload_dir)
_ALLOWED_SETTING_KEYS = {"onedrive_base_url"}


def _get_set_folder(s: BrickSet) -> str | None:
    """Extrahiert den Ordnernamen aus DB-Bildpfaden. z.B. 'data/uploads/LEGO - X/...' → 'LEGO - X'"""
    for path in (s.frontcover_original, s.backcover_original, s.frontcover_thumbnail):
        if path:
            parts = path.replace("\\", "/").split("/")
            if len(parts) >= 3:
                return parts[2]
    return None


# ─── EXPORT ───────────────────────────────────────────────────────────────────

@router.get("/export", dependencies=[Depends(require_admin)])
def export_backup(db: Session = Depends(get_db)):
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

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2))

        # Alle Dateien im Set-Ordner einpacken (inkl. Preview-Dateien für re-finalize)
        added_folders: set[str] = set()
        for s in sets:
            folder = _get_set_folder(s)
            if not folder or folder in added_folders:
                continue
            added_folders.add(folder)
            folder_path = _UPLOAD_BASE / folder
            if folder_path.is_dir():
                for file_path in folder_path.iterdir():
                    if file_path.is_file():
                        zf.write(file_path, arcname=f"uploads/{folder}/{file_path.name}")

    buf.seek(0)
    date_str = datetime.now().strftime("%Y-%m-%d")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="brickhub-backup-{date_str}.zip"'},
    )


# ─── IMPORT ───────────────────────────────────────────────────────────────────

@router.post("/import", dependencies=[Depends(require_admin)])
async def import_backup(
    file: UploadFile = File(...),
    mode: str = Query("append", pattern="^(append|replace)$"),
    db: Session = Depends(get_db),
):
    # Chunk-weise lesen mit Größenlimit
    chunks, total = [], 0
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > _MAX_IMPORT_SIZE:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "ZIP zu groß (max. 500 MB)")
        chunks.append(chunk)

    try:
        zf = zipfile.ZipFile(io.BytesIO(b"".join(chunks)))
    except zipfile.BadZipFile:
        raise HTTPException(400, "Ungültige ZIP-Datei")

    if "data.json" not in zf.namelist():
        raise HTTPException(400, "data.json fehlt im ZIP")

    try:
        data = json.loads(zf.read("data.json"))
    except Exception:
        raise HTTPException(400, "data.json ist kein gültiges JSON")

    if data.get("version") != _BACKUP_VERSION:
        raise HTTPException(400, f"Inkompatible Backup-Version: {data.get('version')}")

    # Zip-Slip-Schutz: alle Pfade müssen innerhalb upload_dir landen
    extract_base = _UPLOAD_BASE.resolve().parent  # .../data/
    for member in zf.namelist():
        if member == "data.json":
            continue
        if not member.startswith("uploads/"):
            continue
        dest = (extract_base / member).resolve()
        if not str(dest).startswith(str(extract_base)):
            raise HTTPException(400, f"Ungültiger Pfad im ZIP: {member}")

    # Modus "replace": erst alles löschen
    if mode == "replace":
        db.query(BrickSet).delete()
        db.query(Box).delete()
        db.query(SecurityQuestion).delete()
        db.query(User).delete()
        db.flush()
        if _UPLOAD_BASE.is_dir():
            shutil.rmtree(str(_UPLOAD_BASE))
        _UPLOAD_BASE.mkdir(parents=True, exist_ok=True)

    # Phase 1: Bilder extrahieren
    images_extracted = 0
    for member in zf.namelist():
        if not member.startswith("uploads/") or member.endswith("/"):
            continue
        dest = (extract_base / member).resolve()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(zf.read(member))
        images_extracted += 1

    # Phase 2: Kisten anlegen mit old_id → new_id Mapping
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

    # Phase 3: Sets anlegen (box_id remappen)
    sets_imported = 0
    for s in data.get("sets", []):
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

    # Phase 4: Benutzer anlegen (bestehende per Username überspringen)
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

    # Phase 5: Settings (nur Whitelist-Keys)
    for key, value in data.get("settings", {}).items():
        if key not in _ALLOWED_SETTING_KEYS:
            continue
        existing = db.query(AppSetting).filter(AppSetting.key == key).first()
        if existing:
            existing.value = value
        else:
            db.add(AppSetting(key=key, value=value))

    db.commit()
    return {
        "message": "Backup erfolgreich importiert",
        "sets": sets_imported,
        "boxes": boxes_imported,
        "users_imported": users_imported,
        "users_skipped": users_skipped,
        "images": images_extracted,
    }
