import logging
import os

from pydantic_settings import BaseSettings
from pathlib import Path

logger = logging.getLogger(__name__)

_KNOWN_DEV_KEYS = {
    "dev-secret-key-change-in-production",
    "brickhub-dev-secret-change-in-production-32chars-minimum",
    "change_me_to_a_very_long_random_string_at_least_32_chars",
}


class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-change-in-production"
    database_url: str = "sqlite:///./data/database.db"
    upload_dir: str = "./data/uploads"
    export_dir: str = "./export"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llava:7b"
    ollama_enabled: bool = False
    access_token_expire_minutes: int = 120  # 2 Stunden; in .env mit ACCESS_TOKEN_EXPIRE_MINUTES überschreibbar

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Secret-Key-Validierung beim Start
_is_production = bool(os.getenv("DOCKER_CONTAINER") or os.getenv("PRODUCTION"))

if settings.secret_key in _KNOWN_DEV_KEYS:
    if _is_production:
        raise RuntimeError(
            "SICHERHEITSFEHLER: SECRET_KEY ist ein bekannter Dev-Wert! "
            "Bitte einen sicheren Key in .env setzen: "
            "python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    logger.warning(
        "WARNUNG: SECRET_KEY ist ein bekannter Dev-Wert. "
        "Für Produktion unbedingt ändern! "
        "Generieren mit: python -c \"import secrets; print(secrets.token_hex(32))\""
    )
elif len(settings.secret_key) < 32:
    if _is_production:
        raise RuntimeError(
            "SICHERHEITSFEHLER: SECRET_KEY ist zu kurz (min. 32 Zeichen)! "
            "Generieren mit: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    logger.warning("WARNUNG: SECRET_KEY ist zu kurz (min. 32 Zeichen empfohlen).")

# Ensure directories exist
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.export_dir).mkdir(parents=True, exist_ok=True)
