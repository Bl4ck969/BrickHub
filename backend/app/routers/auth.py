import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, SecurityQuestion
from app.schemas.user import (
    LoginRequest,
    PasswordChangeRequest,
    ForgotPasswordStep1,
    ForgotPasswordStep2,
    UserCreate,
    UserResponse,
    SecurityQuestionResponse,
)
from app.utils.auth import (
    verify_password,
    hash_password,
    hash_answer,
    verify_answer,
    get_current_user,
)
from app.utils.sitzungen import (
    abgelaufene_entfernen,
    abmelden,
    alle_widerrufen,
    erneuern,
    origin_pruefen,
    sitzung_beginnen,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Dummy-Hash für konstante Antwortzeit bei nicht-existenten Usern
_DUMMY_HASH = hash_password("dummy-timing-constant")

# In-Memory Rate-Limiting (max Versuche pro Minute pro IP)
_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW = 60  # Sekunden
_login_attempts: dict[str, list[float]] = defaultdict(list)
# Erneuern laeuft bei jedem Neuladen und alle paar Minuten je offenem Tab -
# eigener, lockerer Zaehler, damit er den Login-Zaehler nicht aufbraucht.
_REFRESH_LIMIT_MAX = 30
_refresh_attempts: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(request: Request, zaehler: dict[str, list[float]] = _login_attempts, maximum: int = _RATE_LIMIT_MAX):
    """Prüft ob die IP zu viele Versuche in der letzten Minute hatte."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    # Alte Einträge bereinigen
    zaehler[client_ip] = [
        t for t in zaehler[client_ip] if now - t < _RATE_LIMIT_WINDOW
    ]
    if not zaehler[client_ip]:
        del zaehler[client_ip]
    if len(zaehler.get(client_ip, [])) >= maximum:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Zu viele Versuche. Bitte eine Minute warten.",
        )
    zaehler[client_ip].append(now)


@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    """Check if any users exist (for first-run wizard)."""
    user_count = db.query(User).count()
    return {"has_users": user_count > 0}


@router.post("/login")
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    _check_rate_limit(request)
    user = db.query(User).filter(User.username == data.username).first()
    # Immer verify_password aufrufen (konstante Antwortzeit, verhindert Timing-Attacks)
    password_valid = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not password_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ungültiger Benutzername oder Passwort")

    abgelaufene_entfernen(db)
    sitzung_beginnen(db, request, response, user)
    db.commit()
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "must_change_password": user.must_change_password,
    }


@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    """Tauscht das Erneuerungs-Token gegen ein neues und setzt ein frisches Zugangs-Token."""
    # Erst die Herkunft: Sonst koennte eine Seite auf einem anderen Port den Zaehler
    # leerlaufen lassen und so echte Erneuerungen mit 429 aussperren.
    origin_pruefen(request)
    _check_rate_limit(request, _refresh_attempts, _REFRESH_LIMIT_MAX)
    user = erneuern(db, request, response)
    return {"id": user.id, "username": user.username, "role": user.role}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    origin_pruefen(request)  # keine erzwungene Abmeldung von fremden Ports
    abmelden(db, request, response)
    return {"message": "Erfolgreich abgemeldet"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/register-first-admin", response_model=UserResponse)
def register_first_admin(data: UserCreate, db: Session = Depends(get_db)):
    """Only allowed when no users exist (first-run setup)."""
    if db.query(User).count() > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Erstanmeldung bereits abgeschlossen. Bitte als Administrator einloggen.",
        )
    if data.role != "admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erster Benutzer muss Administrator sein")

    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Benutzername bereits vergeben")

    if data.password != data.password_confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwörter stimmen nicht überein")

    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        role="admin",
        must_change_password=False,
    )
    db.add(user)
    db.flush()

    for sq in data.security_questions:
        q = SecurityQuestion(
            user_id=user.id,
            question=sq.question,
            answer_hash=hash_answer(sq.answer),
        )
        db.add(q)

    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password")
def change_password(
    data: PasswordChangeRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.new_password != data.new_password_confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Neue Passwörter stimmen nicht überein")

    # If not forced change, verify current password
    if not current_user.must_change_password:
        if not data.current_password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aktuelles Passwort erforderlich")
        if not verify_password(data.current_password, current_user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aktuelles Passwort falsch")

    current_user.password_hash = hash_password(data.new_password)
    current_user.must_change_password = False
    # Alle anderen Geraete abmelden, dieses bleibt mit einer neuen Sitzung angemeldet
    alle_widerrufen(db, current_user)
    sitzung_beginnen(db, request, response, current_user)

    # Update security questions if provided
    if data.security_questions and len(data.security_questions) == 3:
        db.query(SecurityQuestion).filter(SecurityQuestion.user_id == current_user.id).delete()
        for sq in data.security_questions:
            q = SecurityQuestion(
                user_id=current_user.id,
                question=sq.question,
                answer_hash=hash_answer(sq.answer),
            )
            db.add(q)

    db.commit()
    return {"message": "Passwort erfolgreich geändert"}


@router.post("/forgot-password/get-questions")
def forgot_password_get_questions(data: ForgotPasswordStep1, request: Request, db: Session = Depends(get_db)):
    _check_rate_limit(request)
    user = db.query(User).filter(User.username == data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Benutzername oder Sicherheitsfragen nicht verfügbar",
        )

    questions = db.query(SecurityQuestion).filter(SecurityQuestion.user_id == user.id).all()
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Benutzername oder Sicherheitsfragen nicht verfügbar",
        )

    return {
        "username": user.username,
        "questions": [{"id": q.id, "question": q.question} for q in questions],
    }


@router.post("/forgot-password/reset")
def forgot_password_reset(data: ForgotPasswordStep2, request: Request, db: Session = Depends(get_db)):
    _check_rate_limit(request)
    user = db.query(User).filter(User.username == data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Benutzername oder Sicherheitsfragen nicht verfügbar",
        )

    if data.new_password != data.new_password_confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwörter stimmen nicht überein")

    questions = db.query(SecurityQuestion).filter(SecurityQuestion.user_id == user.id).all()
    questions_by_id = {q.id: q for q in questions}

    for answer_data in data.answers:
        q = questions_by_id.get(answer_data.question_id)
        if not q or not verify_answer(answer_data.answer, q.answer_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Eine oder mehrere Antworten sind falsch",
            )

    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    alle_widerrufen(db, user)
    db.commit()
    return {"message": "Passwort erfolgreich zurückgesetzt"}
