from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.set_model import BrickSet
from app.schemas.set import (
    SetCreate,
    SetUpdate,
    SetResponse,
    SetListResponse,
    StatusUpdate,
    InlineUpdate,
    SetImportPayload,
)
from app.utils.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/sets", tags=["sets"])

VALID_STATUSES = ["Neu", "Aufgebaut", "Im Bau", "Eingelagert"]
VALID_STONE_SIZES = ["Standard", "Standard, beleuchtet", "Standard, Technik", "Mini", "Diamond", "Sonder-Steine"]


@router.get("/", response_model=SetListResponse)
def list_sets(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    stone_size: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    manufacturer: Optional[str] = Query(None),
    sort_by: str = Query("name"),
    sort_dir: str = Query("asc"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(BrickSet)

    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                BrickSet.name.ilike(term),
                BrickSet.manufacturer.ilike(term),
                BrickSet.category.ilike(term),
                BrickSet.subcategory.ilike(term),
                BrickSet.manufacturer_number.ilike(term),
                BrickSet.notes.ilike(term),
            )
        )
    if status:
        query = query.filter(BrickSet.status == status)
    if stone_size:
        query = query.filter(BrickSet.stone_size == stone_size)
    if category:
        query = query.filter(BrickSet.category == category)
    if subcategory:
        query = query.filter(BrickSet.subcategory == subcategory)
    if manufacturer:
        query = query.filter(BrickSet.manufacturer == manufacturer)

    valid_sort_cols = {
        "name": BrickSet.name,
        "manufacturer": BrickSet.manufacturer,
        "parts_count": BrickSet.parts_count,
        "price": BrickSet.price,
        "status": BrickSet.status,
        "stone_size": BrickSet.stone_size,
        "category": BrickSet.category,
        "created_at": BrickSet.created_at,
    }
    sort_col = valid_sort_cols.get(sort_by, BrickSet.name)
    if sort_dir == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    sets = query.all()

    # Summaries
    total_price = sum(s.price or 0 for s in sets)
    total_parts = sum(s.parts_count or 0 for s in sets)
    parts_by_stone = {}
    for s in sets:
        if s.stone_size:
            parts_by_stone[s.stone_size] = parts_by_stone.get(s.stone_size, 0) + (s.parts_count or 0)

    return {
        "sets": sets,
        "total_count": len(sets),
        "total_price": total_price,
        "total_parts": total_parts,
        "parts_by_stone_size": parts_by_stone,
    }


@router.get("/distinct-values")
def get_distinct_values(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns distinct values for dropdown suggestions."""
    manufacturers = [r[0] for r in db.query(BrickSet.manufacturer).distinct().filter(BrickSet.manufacturer.isnot(None)).order_by(BrickSet.manufacturer).all()]
    categories = [r[0] for r in db.query(BrickSet.category).distinct().filter(BrickSet.category.isnot(None)).order_by(BrickSet.category).all()]
    subcategories = [r[0] for r in db.query(BrickSet.subcategory).distinct().filter(BrickSet.subcategory.isnot(None)).order_by(BrickSet.subcategory).all()]
    return {
        "manufacturers": manufacturers,
        "categories": categories,
        "subcategories": subcategories,
        "stone_sizes": VALID_STONE_SIZES,
        "statuses": VALID_STATUSES,
    }


@router.get("/{set_id}", response_model=SetResponse)
def get_set(
    set_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")
    return brick_set


@router.post("/", response_model=SetResponse, status_code=status.HTTP_201_CREATED)
def create_set(
    data: SetCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    brick_set = BrickSet(**data.model_dump())
    db.add(brick_set)
    db.commit()
    db.refresh(brick_set)
    return brick_set


@router.put("/{set_id}", response_model=SetResponse)
def update_set(
    set_id: int,
    data: SetUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(brick_set, field, value)

    db.commit()
    db.refresh(brick_set)
    return brick_set


@router.patch("/{set_id}/status", response_model=SetResponse)
def update_status(
    set_id: int,
    data: StatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ungültiger Status")
    brick_set.status = data.status
    db.commit()
    db.refresh(brick_set)
    return brick_set


@router.patch("/{set_id}/inline", response_model=SetResponse)
def inline_update(
    set_id: int,
    data: InlineUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(brick_set, field, value)

    db.commit()
    db.refresh(brick_set)
    return brick_set


@router.delete("/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(
    set_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    brick_set = db.query(BrickSet).filter(BrickSet.id == set_id).first()
    if not brick_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set nicht gefunden")
    db.delete(brick_set)
    db.commit()


@router.get("/export/json")
def export_sets_json(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Export all sets as JSON."""
    from fastapi.responses import JSONResponse
    import json
    from datetime import datetime

    sets = db.query(BrickSet).all()
    data = []
    for s in sets:
        d = {c.name: getattr(s, c.name) for c in s.__table__.columns}
        # Convert datetime to string
        for k, v in d.items():
            if isinstance(v, datetime):
                d[k] = v.isoformat()
        data.append(d)

    return JSONResponse(content={"exported_at": datetime.utcnow().isoformat(), "sets": data})


_MAX_IMPORT_SETS = 1000


@router.post("/import/json")
def import_sets_json(
    payload: SetImportPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Import sets from JSON export (max 1000 Sets pro Import)."""
    if len(payload.sets) > _MAX_IMPORT_SETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximal {_MAX_IMPORT_SETS} Sets pro Import erlaubt",
        )

    imported = 0
    for item in payload.sets:
        brick_set = BrickSet(**item.model_dump())
        db.add(brick_set)
        imported += 1
    db.commit()
    return {"message": f"{imported} Sets importiert"}
