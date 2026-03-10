from datetime import datetime
from sqlalchemy import Integer, String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Box(Base):
    __tablename__ = "boxes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=True)
    fill_level: Mapped[int] = mapped_column(Integer, default=0)  # 0-100 in steps of 10
    allowed_stone_types: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sets: Mapped[list["BrickSet"]] = relationship("BrickSet", back_populates="box")


# Import here to avoid circular imports
from app.models.set_model import BrickSet  # noqa: E402, F401
