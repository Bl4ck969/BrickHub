from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, SecurityQuestion
from app.schemas.user import (
    UserCreateByAdmin,
    UserResponse,
    RoleUpdateRequest,
    InitialPasswordRequest,
)
from app.utils.auth import require_admin, hash_password, get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).order_by(User.username).all()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreateByAdmin,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Benutzername bereits vergeben")

    user = User(
        username=data.username,
        password_hash=hash_password(data.initial_password),
        role=data.role,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Eigenes Konto kann nicht gelöscht werden")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Benutzer nicht gefunden")

    db.delete(user)
    db.commit()


@router.patch("/{user_id}/role", response_model=UserResponse)
def update_role(
    user_id: int,
    data: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Eigene Rolle kann nicht geändert werden")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Benutzer nicht gefunden")

    user.role = data.role
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/reset-password", response_model=UserResponse)
def reset_password(
    user_id: int,
    data: InitialPasswordRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Benutzer nicht gefunden")

    user.password_hash = hash_password(data.new_password)
    user.must_change_password = True
    # Clear security questions so user must set new ones on next login
    db.query(SecurityQuestion).filter(SecurityQuestion.user_id == user.id).delete()
    db.commit()
    db.refresh(user)
    return user
