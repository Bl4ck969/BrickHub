from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.setting import AppSetting
from app.utils.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])

_ALLOWED_KEYS = {"onedrive_base_url"}


class SettingValue(BaseModel):
    value: Optional[str] = None


@router.get("/")
def get_all_settings(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """Alle Settings als Dict zurückgeben (für eingeloggte User)."""
    settings = db.query(AppSetting).all()
    return {s.key: s.value for s in settings}


@router.put("/{key}")
def set_setting(key: str, body: SettingValue, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Einzelnen Setting-Wert setzen (nur Admin, nur erlaubte Keys)."""
    if key not in _ALLOWED_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unbekannter Setting-Key: {key}")
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if setting:
        setting.value = body.value
    else:
        setting = AppSetting(key=key, value=body.value)
        db.add(setting)
    db.commit()
    return {"key": key, "value": body.value}
