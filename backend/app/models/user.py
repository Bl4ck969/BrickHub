import secrets
from datetime import datetime
from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")  # "admin" or "user"
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Steigt bei Passwortwechsel und Reset - alte Zugangs- und Erneuerungs-Token
    # tragen dann die alte Nummer und gelten nicht mehr.
    # Zufaelliger Start statt 0: Ein geloeschter und gleichnamig neu angelegter (oder per
    # Backup eingespielter) Benutzer erbt sonst die noch laufenden Zugangs-Token des alten.
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=lambda: secrets.randbelow(2**31)
    )

    security_questions: Mapped[list["SecurityQuestion"]] = relationship(
        "SecurityQuestion", back_populates="user", cascade="all, delete-orphan"
    )


class SecurityQuestion(Base):
    __tablename__ = "security_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="security_questions")


class RefreshToken(Base):
    """Ein Erneuerungs-Token („angemeldet bleiben“). Gespeichert wird nur der Hash.

    Jede Nutzung ersetzt das Token durch ein neues derselben Kette (`family_id`).
    Taucht ein schon ersetztes Token nach der Gnadenfrist wieder auf, wurde es
    kopiert - dann wird die ganze Kette widerrufen.
    """
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    family_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    replaced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    replaced_by_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
