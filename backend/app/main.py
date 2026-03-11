from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from pathlib import Path

from app.database import create_tables, run_migrations
from app.routers import auth, users, sets, boxes, images, labels, settings


class NoCacheMiddleware(BaseHTTPMiddleware):
    """Verhindert Browser-Caching für API-Responses und index.html."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.endswith(".html"):
            # HTML immer frisch laden (index.html zeigt auf gehashte JS/CSS-Bundles)
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        elif path.startswith("/api/images/file"):
            # Bilder: cachen erlaubt, aber immer beim Server nachfragen (304 wenn unverändert)
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
        elif path.startswith("/api"):
            # JSON-API-Responses: nie cachen
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        return response


app = FastAPI(
    title="BrickHub API",
    description="Klemmbausteinset-Inventarisierung",
    version="1.0.0",
)

# Kein Browser-Cache für API und HTML
app.add_middleware(NoCacheMiddleware)

# Allow React dev server in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(sets.router)
app.include_router(boxes.router)
app.include_router(images.router)
app.include_router(labels.router)
app.include_router(settings.router)

# Serve frontend build in production
# In Docker: /app/app/main.py → /app/ → /app/frontend/dist
# In dev: ../../frontend/dist (not present, skipped)
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


@app.on_event("startup")
def on_startup():
    create_tables()
    run_migrations()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "BrickHub"}
