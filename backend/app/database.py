from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from app.models import user, set_model, box, setting  # noqa: F401
    Base.metadata.create_all(bind=engine)


def run_migrations():
    """Prüft ob neue Spalten existieren und fügt sie per ALTER TABLE hinzu."""
    _migrate_add_column("sets", "onedrive_url", "VARCHAR(1000)")


def _migrate_add_column(table: str, column: str, col_type: str):
    """Fügt eine Spalte hinzu, falls sie noch nicht existiert.

    SICHERHEITSHINWEIS: table/column/col_type werden per Whitelist validiert.
    SQLite unterstützt kein Parameter-Binding für DDL-Befehle, daher ist
    String-Formatierung hier nötig, aber nur mit validierten Bezeichnern.
    """
    import re
    import sqlite3
    from app.config import settings as app_settings

    _IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    _COL_TYPE_RE = re.compile(r"^[a-zA-Z0-9_() ]+$")

    if not _IDENTIFIER_RE.match(table):
        raise ValueError(f"Ungültiger Tabellenname: {table!r}")
    if not _IDENTIFIER_RE.match(column):
        raise ValueError(f"Ungültiger Spaltenname: {column!r}")
    if not _COL_TYPE_RE.match(col_type):
        raise ValueError(f"Ungültiger Spaltentyp: {col_type!r}")

    db_path = app_settings.database_url.replace("sqlite:///", "")
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({table})")
        existing = [row[1] for row in cursor.fetchall()]
        if column not in existing:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
            conn.commit()
    finally:
        conn.close()
