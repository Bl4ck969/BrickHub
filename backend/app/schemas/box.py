from datetime import datetime
from typing import Optional
from pydantic import BaseModel
import json


class BoxCreate(BaseModel):
    name: str
    location: Optional[str] = None
    fill_level: int = 0
    allowed_stone_types: list[str] = []


class BoxUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    fill_level: Optional[int] = None
    allowed_stone_types: Optional[list[str]] = None


class BoxResponse(BaseModel):
    id: int
    name: str
    location: Optional[str] = None
    fill_level: int
    allowed_stone_types: list[str]
    created_at: datetime
    set_count: int = 0

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_count(cls, box, count: int):
        stone_types = json.loads(box.allowed_stone_types) if box.allowed_stone_types else []
        return cls(
            id=box.id,
            name=box.name,
            location=box.location,
            fill_level=box.fill_level,
            allowed_stone_types=stone_types,
            created_at=box.created_at,
            set_count=count,
        )
