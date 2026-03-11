from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pathlib import Path
from app.database import get_db
from app.models.user import User
from app.models.set_model import BrickSet
from app.services.image_service import (
    process_image, save_original, detect_corners,
    apply_perspective_transform, apply_rotation, finalize_image,
)
from app.services.ollama_service import check_ollama_connection
from app.utils.auth import require_admin, get_current_user
from app.config import settings

router = APIRouter(prefix="/api/images", tags=["images"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 30 * 1024 * 1024  # 30 MB
_CHUNK_SIZE = 1024 * 1024  # 1 MB Chunks


async def _read_file_with_limit(file: UploadFile) -> bytes:
    """Liest Datei chunk-weise und bricht bei Überschreitung frühzeitig ab."""
    chunks = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Datei zu groß (max. 30 MB)",
            )
        chunks.append(chunk)
    return b"".join(chunks)


class PreviewRequest(BaseModel):
    corners: list[list[float]] | None = None
    rotation: float | None = None


class FinalizeRequest(BaseModel):
    brightness: float = 1.05
    saturation: float = 1.05


@router.post("/upload/{set_id}/{side}")
async def upload_image(
    set_id: int,
    side: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Upload and process front or back cover image for a set."""
    if side not in ("frontcover", "backcover"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="side muss 'frontcover' oder 'backcover' sein")

    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nur JPG, PNG und WebP erlaubt")

    file_bytes = await _read_file_with_limit(file)

    side_label = "Frontcover" if side == "frontcover" else "Backcover"
    manufacturer = brick_set.manufacturer or "Unbekannt"

    paths = process_image(file_bytes, side_label, manufacturer, brick_set.name)

    if side == "frontcover":
        brick_set.frontcover_original = paths["original"]
        brick_set.frontcover_edited = paths["edited"]
        brick_set.frontcover_thumbnail = paths["thumbnail"]
    else:
        brick_set.backcover_original = paths["original"]
        brick_set.backcover_edited = paths["edited"]
        brick_set.backcover_thumbnail = paths["thumbnail"]

    db.commit()

    return {
        "message": "Bild erfolgreich verarbeitet",
        "original": paths["original"],
        "edited": paths["edited"],
        "thumbnail": paths["thumbnail"],
    }


@router.post("/upload-raw/{set_id}/{side}")
async def upload_raw_image(
    set_id: int,
    side: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Upload raw image, save original and attempt auto corner detection."""
    if side not in ("frontcover", "backcover"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="side muss 'frontcover' oder 'backcover' sein")

    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nur JPG, PNG und WebP erlaubt")

    file_bytes = await _read_file_with_limit(file)

    side_label = "Frontcover" if side == "frontcover" else "Backcover"
    manufacturer = brick_set.manufacturer or "Unbekannt"

    result = save_original(file_bytes, side_label, manufacturer, brick_set.name)

    # Update original path in DB
    if side == "frontcover":
        brick_set.frontcover_original = result["original_path"]
    else:
        brick_set.backcover_original = result["original_path"]
    db.commit()

    # Auto corner detection
    suggested_corners = detect_corners(result["original_path"])

    return {
        "original_path": result["original_path"],
        "width": result["width"],
        "height": result["height"],
        "suggested_corners": suggested_corners,
    }


@router.post("/preview/{set_id}/{side}")
async def preview_image(
    set_id: int,
    side: str,
    body: PreviewRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Apply perspective correction + rotation on original, return preview."""
    if side not in ("frontcover", "backcover"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="side muss 'frontcover' oder 'backcover' sein")

    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")

    original_path = brick_set.frontcover_original if side == "frontcover" else brick_set.backcover_original
    if not original_path or not Path(original_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Originalbild nicht gefunden")

    current_path = original_path

    # Perspektivkorrektur
    if body.corners and len(body.corners) == 4:
        current_path = apply_perspective_transform(current_path, body.corners)

    # Rotation
    if body.rotation and body.rotation != 0:
        current_path = apply_rotation(current_path, body.rotation)

    from PIL import Image as PILImage
    img = PILImage.open(current_path)
    w, h = img.size

    return {
        "preview_path": current_path,
        "width": w,
        "height": h,
    }


@router.post("/finalize/{set_id}/{side}")
async def finalize_set_image(
    set_id: int,
    side: str,
    body: FinalizeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Finalize image: rembg + color normalization + scaling. Updates DB."""
    if side not in ("frontcover", "backcover"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="side muss 'frontcover' oder 'backcover' sein")

    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")

    side_label = "Frontcover" if side == "frontcover" else "Backcover"
    manufacturer = brick_set.manufacturer or "Unbekannt"

    # Zuerst Preview suchen, dann Original
    original_path = brick_set.frontcover_original if side == "frontcover" else brick_set.backcover_original
    if not original_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Originalbild nicht gefunden")

    # Preview-Datei hat "Preview" statt "Original" im Namen
    preview_path = original_path.replace("Original", "Preview")
    source_path = preview_path if Path(preview_path).exists() else original_path

    if not Path(source_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quellbild nicht gefunden")

    paths = finalize_image(
        source_path, side_label, manufacturer, brick_set.name,
        brightness=body.brightness, saturation=body.saturation,
    )

    if side == "frontcover":
        brick_set.frontcover_edited = paths["edited"]
        brick_set.frontcover_thumbnail = paths["thumbnail"]
    else:
        brick_set.backcover_edited = paths["edited"]
        brick_set.backcover_thumbnail = paths["thumbnail"]

    db.commit()

    return {
        "message": "Bild erfolgreich finalisiert",
        "edited": paths["edited"],
        "thumbnail": paths["thumbnail"],
    }


@router.post("/redetect/{set_id}/{side}")
async def redetect_corners(
    set_id: int,
    side: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Re-detect corners on an existing original image (for re-editing)."""
    if side not in ("frontcover", "backcover"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="side muss 'frontcover' oder 'backcover' sein")

    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")

    original_path = brick_set.frontcover_original if side == "frontcover" else brick_set.backcover_original
    if not original_path or not Path(original_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Originalbild nicht gefunden")

    from PIL import Image as PILImage
    img = PILImage.open(original_path)
    w, h = img.size

    suggested_corners = detect_corners(original_path)

    return {
        "original_path": original_path,
        "width": w,
        "height": h,
        "suggested_corners": suggested_corners,
    }


@router.get("/file")
def serve_image(
    path: str,
    _: User = Depends(get_current_user),
):
    """Serve an image file by its stored path."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bild nicht gefunden")

    # Security: ensure path is within upload directory
    try:
        file_path.resolve().relative_to(Path(settings.upload_dir).resolve())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Zugriff verweigert")

    return FileResponse(str(file_path))


@router.get("/ollama/status")
async def ollama_status(_: User = Depends(get_current_user)):
    return await check_ollama_connection()
