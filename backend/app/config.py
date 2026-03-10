from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-change-in-production"
    database_url: str = "sqlite:///./data/database.db"
    upload_dir: str = "./data/uploads"
    export_dir: str = "./export"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llava:7b"
    ollama_enabled: bool = False
    access_token_expire_minutes: int = 480

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.export_dir).mkdir(parents=True, exist_ok=True)
