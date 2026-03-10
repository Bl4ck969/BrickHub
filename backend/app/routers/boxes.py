import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.box import Box
from app.models.set_model import BrickSet
from app.schemas.box import BoxCreate, BoxUpdate, BoxResponse
from app.utils.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/boxes", tags=["boxes"])


def _box_to_response(box: Box, db: Session) -> BoxResponse:
    count = db.query(BrickSet).filter(BrickSet.box_id == box.id).count()
    return BoxResponse.from_orm_with_count(box, count)


@router.get("/", response_model=list[BoxResponse])
def list_boxes(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    boxes = db.query(Box).order_by(Box.name).all()
    return [_box_to_response(b, db) for b in boxes]


@router.get("/{box_id}", response_model=BoxResponse)
def get_box(
    box_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiste nicht gefunden")
    return _box_to_response(box, db)


@router.post("/", response_model=BoxResponse, status_code=status.HTTP_201_CREATED)
def create_box(
    data: BoxCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    box = Box(
        name=data.name,
        location=data.location,
        fill_level=data.fill_level,
        allowed_stone_types=json.dumps(data.allowed_stone_types),
    )
    db.add(box)
    db.commit()
    db.refresh(box)
    return _box_to_response(box, db)


@router.put("/{box_id}", response_model=BoxResponse)
def update_box(
    box_id: int,
    data: BoxUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiste nicht gefunden")

    if data.name is not None:
        box.name = data.name
    if data.location is not None:
        box.location = data.location
    if data.fill_level is not None:
        if data.fill_level % 10 != 0 or not (0 <= data.fill_level <= 100):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Füllheitsgrad muss 0-100 in 10%-Schritten sein")
        box.fill_level = data.fill_level
    if data.allowed_stone_types is not None:
        box.allowed_stone_types = json.dumps(data.allowed_stone_types)

    db.commit()
    db.refresh(box)
    return _box_to_response(box, db)


@router.delete("/{box_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_box(
    box_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiste nicht gefunden")

    # Unlink sets from this box
    db.query(BrickSet).filter(BrickSet.box_id == box_id).update({"box_id": None})
    db.delete(box)
    db.commit()


@router.get("/{box_id}/sets")
def get_box_sets(
    box_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiste nicht gefunden")
    sets = db.query(BrickSet).filter(BrickSet.box_id == box_id).all()
    return [{"id": s.id, "name": s.name, "manufacturer": s.manufacturer, "stone_size": s.stone_size} for s in sets]


@router.get("/available-for-stone-type/{stone_type}")
def available_boxes_for_stone_type(
    stone_type: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns boxes that can accept a set of the given stone type."""
    boxes = db.query(Box).filter(Box.fill_level < 100).all()
    available = []
    for box in boxes:
        allowed = json.loads(box.allowed_stone_types) if box.allowed_stone_types else []
        if stone_type in allowed:
            available.append(_box_to_response(box, db))
    return available
