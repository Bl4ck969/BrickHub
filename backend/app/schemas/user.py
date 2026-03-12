from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
import re


def _validate_password_strength(v: str) -> str:
    """Gemeinsame Passwort-Komplexitätsprüfung für alle Schemas.

    Anforderungen:
    - Mindestens 8 Zeichen
    - Mindestens ein Großbuchstabe (A–Z)
    - Mindestens ein Kleinbuchstabe (a–z)
    - Mindestens eine Ziffer (0–9)
    """
    if len(v) < 8:
        raise ValueError("Passwort muss mindestens 8 Zeichen haben")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Passwort muss mindestens einen Großbuchstaben enthalten")
    if not re.search(r"[a-z]", v):
        raise ValueError("Passwort muss mindestens einen Kleinbuchstaben enthalten")
    if not re.search(r"\d", v):
        raise ValueError("Passwort muss mindestens eine Ziffer enthalten")
    return v


class SecurityQuestionCreate(BaseModel):
    question: str
    answer: str


class SecurityQuestionResponse(BaseModel):
    id: int
    question: str

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    password: str
    password_confirm: str
    role: str = "user"
    security_questions: list[SecurityQuestionCreate]

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Benutzername muss mindestens 3 Zeichen haben")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in ("admin", "user"):
            raise ValueError("Rolle muss 'admin' oder 'user' sein")
        return v

    @field_validator("security_questions")
    @classmethod
    def questions_count(cls, v: list) -> list:
        if len(v) != 3:
            raise ValueError("Genau 3 Sicherheitsfragen erforderlich")
        return v


class UserCreateByAdmin(BaseModel):
    username: str
    initial_password: str
    role: str = "user"

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Benutzername muss mindestens 3 Zeichen haben")
        return v

    @field_validator("initial_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    must_change_password: bool
    created_at: datetime
    security_questions: list[SecurityQuestionResponse] = []

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class PasswordChangeRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str
    new_password_confirm: str
    security_questions: Optional[list[SecurityQuestionCreate]] = None

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class ForgotPasswordStep1(BaseModel):
    username: str


class SecurityQuestionAnswer(BaseModel):
    question_id: int
    answer: str


class ForgotPasswordStep2(BaseModel):
    username: str
    answers: list[SecurityQuestionAnswer]
    new_password: str
    new_password_confirm: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class RoleUpdateRequest(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in ("admin", "user"):
            raise ValueError("Rolle muss 'admin' oder 'user' sein")
        return v


class InitialPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)
