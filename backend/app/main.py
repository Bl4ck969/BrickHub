from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from pathlib import Path

from app.config import _is_production, settings
from app.database import create_tables, run_migrations
from app.routers import auth, users, sets, boxes, images, labels, settings as settings_router, backup
from app.services.backup_scheduler import start_scheduler


class NoCacheMiddleware(BaseHTTPMiddleware):
    """Verhindert Browser-Caching für API-Responses und index.html."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        elif path.startswith("/api/images/file"):
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
        elif path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Setzt Standard-Security-Headers auf alle Responses."""

    # CSP für Produktion: alle Ressourcen von 'self', Inline-Styles für Tailwind erlaubt,
    # Google Fonts als einzige externe Quelle (index.css @import).
    _CSP = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'"
    )

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["server"] = "BrickHub"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = self._CSP
        if settings.secure_cookies:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app = FastAPI(
    title="BrickHub API",
    description="Klemmbausteinset-Inventarisierung",
    version="1.0.0",
    # API-Dokumentation in Produktion deaktivieren (kein Angriffsflächen-Exposé)
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)

# Security Headers
app.add_middleware(SecurityHeadersMiddleware)

# Kein Browser-Cache für API und HTML
app.add_middleware(NoCacheMiddleware)

# CORS: Nur bekannte Dev-Origins erlauben
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Register routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(sets.router)
app.include_router(boxes.router)
app.include_router(images.router)
app.include_router(labels.router)
app.include_router(settings_router.router)
app.include_router(backup.router)

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "BrickHub"}


# Serve frontend build in production
# In Docker: /app/app/main.py → /app/ → /app/frontend/dist
# In dev: ../../frontend/dist (not present, skipped)
# ACHTUNG: Alle echten Routen müssen VOR diesem Block stehen. Die Catch-All
# unten greift jeden Pfad ab – eine danach definierte Route wird nie erreicht.
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    # Statische Assets (JS, CSS, Bilder)
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    # Catch-All: alle anderen Routen → index.html (React Router SPA)
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        static_file = frontend_dist / full_path
        if static_file.exists() and static_file.is_file():
            return FileResponse(str(static_file))
        return FileResponse(str(frontend_dist / "index.html"))


@app.on_event("startup")
def on_startup():
    create_tables()
    run_migrations()
    start_scheduler()
