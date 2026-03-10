from datetime import datetime
from sqlalchemy import Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class BrickSet(Base):
    __tablename__ = "sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    manufacturer: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    manufacturer_number: Mapped[str] = mapped_column(String(100), nullable=True)
    parts_count: Mapped[int] = mapped_column(Integer, nullable=True)
    stone_size: Mapped[str] = mapped_column(String(50), nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    subcategory: Mapped[str] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Neu", index=True)
    bag_count: Mapped[int] = mapped_column(Integer, nullable=True)
    plate_count: Mapped[int] = mapped_column(Integer, nullable=True)
    price: Mapped[float] = mapped_column(Float, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    box_id: Mapped[int] = mapped_column(Integer, ForeignKey("boxes.id"), nullable=True)
    box: Mapped["Box"] = relationship("Box", back_populates="sets")

    frontcover_original: Mapped[str] = mapped_column(String(500), nullable=True)
    frontcover_edited: Mapped[str] = mapped_column(String(500), nullable=True)
    frontcover_thumbnail: Mapped[str] = mapped_column(String(500), nullable=True)
    backcover_original: Mapped[str] = mapped_column(String(500), nullable=True)
    backcover_edited: Mapped[str] = mapped_column(String(500), nullable=True)
    backcover_thumbnail: Mapped[str] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Import here to avoid circular imports
from app.models.box import Box  # noqa: E402, F401
