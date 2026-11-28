from datetime import datetime, timedelta
from typing import Optional
import bcrypt
import jwt
from fastapi import Depends, HTTPException, status, Cookie
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models.user import User

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def hash_answer(answer: str) -> str:
    normalized = answer.strip().lower()
    return bcrypt.hashpw(normalized.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")


def verify_answer(plain_answer: str, hashed_answer: str) -> bool:
    normalized = plain_answer.strip().lower()
    return bcrypt.checkpw(normalized.encode("utf-8"), hashed_answer.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


# Cookie-Namen mit App-Praefix: Alle Apps unter 192.168.178.95 teilen sich Cookies
# ueber die Ports hinweg - ein schlichtes "access_token" wuerde von einer anderen
# App ueberschrieben. Bis Ende November 2026 hiess es "access_token".
ACCESS_COOKIE = "brickhub_access"


def get_current_user(
    access_token: Optional[str] = Cookie(default=None, alias=ACCESS_COOKIE),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nicht angemeldet",
    )
    if not access_token:
        raise credentials_exception
    try:
        payload = jwt.decode(access_token, settings.secret_key, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    # Passwortwechsel/Reset erhoeht token_version - aeltere Token gelten dann nicht mehr
    if payload.get("tv") != user.token_version:
        raise credentials_exception
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nur Administratoren haben Zugriff",
        )
    return current_user
