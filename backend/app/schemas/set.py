from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SetBase(BaseModel):
    name: str
    manufacturer: Optional[str] = None
    manufacturer_number: Optional[str] = None
    parts_count: Optional[int] = None
    stone_size: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    status: str = "Neu"
    bag_count: Optional[int] = None
    plate_count: Optional[int] = None
    price: Optional[float] = None
    notes: Optional[str] = None
    onedrive_url: Optional[str] = None
    box_id: Optional[int] = None
    frontcover_original: Optional[str] = None
    frontcover_edited: Optional[str] = None
    frontcover_thumbnail: Optional[str] = None
    backcover_original: Optional[str] = None
    backcover_edited: Optional[str] = None
    backcover_thumbnail: Optional[str] = None


class SetCreate(SetBase):
    pass


class SetUpdate(BaseModel):
    name: Optional[str] = None
    manufacturer: Optional[str] = None
    manufacturer_number: Optional[str] = None
    parts_count: Optional[int] = None
    stone_size: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    status: Optional[str] = None
    bag_count: Optional[int] = None
    plate_count: Optional[int] = None
    price: Optional[float] = None
    notes: Optional[str] = None
    onedrive_url: Optional[str] = None
    box_id: Optional[int] = None
    frontcover_original: Optional[str] = None
    frontcover_edited: Optional[str] = None
    frontcover_thumbnail: Optional[str] = None
    backcover_original: Optional[str] = None
    backcover_edited: Optional[str] = None
    backcover_thumbnail: Optional[str] = None


class InlineUpdate(BaseModel):
    status: Optional[str] = None
    bag_count: Optional[int] = None
    plate_count: Optional[int] = None
    box_id: Optional[int] = None
    notes: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str


class BoxSummary(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class SetResponse(SetBase):
    id: int
    created_at: datetime
    updated_at: datetime
    box: Optional[BoxSummary] = None

    class Config:
        from_attributes = True


class SetListResponse(BaseModel):
    sets: list[SetResponse]
    total_count: int
    total_price: float
    total_parts: int
    parts_by_stone_size: dict[str, int]


class SetImportItem(BaseModel):
    """Ein einzelnes Set im Import-Payload (gleiche Felder wie SetBase)."""
    name: str
    manufacturer: Optional[str] = None
    manufacturer_number: Optional[str] = None
    parts_count: Optional[int] = None
    stone_size: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    status: str = "Neu"
    bag_count: Optional[int] = None
    plate_count: Optional[int] = None
    price: Optional[float] = None
    notes: Optional[str] = None
    onedrive_url: Optional[str] = None
    box_id: Optional[int] = None

    class Config:
        extra = "ignore"


class SetImportPayload(BaseModel):
    """Payload für den Import-Endpoint."""
    sets: list[SetImportItem]
