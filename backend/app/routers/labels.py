from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.set_model import BrickSet
from app.services.pdf_service import generate_label_pdf, generate_sets_list_pdf
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/labels", tags=["labels"])


class LabelSetSelection(BaseModel):
    set_ids: list[int]


@router.post("/generate")
def generate_labels(
    data: LabelSetSelection,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Generate label PDF for selected sets."""
    if not data.set_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mindestens ein Set auswählen")
    if len(data.set_ids) > 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximal 6 Sets pro Auswahl")

    labels_data = []
    for set_id in data.set_ids:
        brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
        if not brick_set:
            continue

        bag_count = brick_set.bag_count or 0
        plate_count = brick_set.plate_count or 0
        total = bag_count + plate_count

        for i in range(1, bag_count + 1):
            plate_suffix = f" + {plate_count}x Platten" if plate_count > 0 else ""
            labels_data.append({
                "name": brick_set.name,
                "manufacturer": brick_set.manufacturer or "",
                "stone_size": brick_set.stone_size or "",
                "thumbnail": brick_set.frontcover_thumbnail,
                "bag_label": f"Tüte {i}/{bag_count}{plate_suffix}",
            })

        for i in range(1, plate_count + 1):
            labels_data.append({
                "name": brick_set.name,
                "manufacturer": brick_set.manufacturer or "",
                "stone_size": brick_set.stone_size or "",
                "thumbnail": brick_set.frontcover_thumbnail,
                "bag_label": f"Platte {i}/{plate_count}",
            })

    if not labels_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Keine Tüten- oder Platteninformationen vorhanden")

    pdf_bytes = generate_label_pdf(labels_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=BrickHub-Schilder.pdf"},
    )


@router.get("/sets-list")
def export_sets_pdf(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Export sets list as PDF."""
    sets = db.query(BrickSet).order_by(BrickSet.name).all()
    pdf_bytes = generate_sets_list_pdf(sets)
    from datetime import datetime
    filename = f"BrickHub-Setliste-{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
