# Stage 1: Build React frontend
# node:22 ist Pflicht, nicht Geschmack: react-router 8 verlangt >=22.22.0,
# Vite 8 mindestens ^20.19 || >=22.12. Node 20 ist seit April 2026 ausserdem EOL.
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + serve frontend
FROM python:3.12-slim

LABEL maintainer="Bl4ck969"
LABEL org.opencontainers.image.title="BrickHub"
LABEL org.opencontainers.image.description="Klemmbausteinset-Inventar-Webapp"
LABEL org.opencontainers.image.source="https://github.com/Bl4ck969/BrickHub"
LABEL org.opencontainers.image.url="https://github.com/Bl4ck969/BrickHub"
LABEL net.unraid.docker.webui="http://[IP]:[PORT:8080]/"
LABEL net.unraid.docker.icon="https://raw.githubusercontent.com/Bl4ck969/BrickHub/main/frontend/public/logo.png"

WORKDIR /app

# Install system dependencies for OpenCV, rembg and timezone support
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY backend/ ./

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create necessary directories
RUN mkdir -p data/uploads export backup

# Non-root user für Security
RUN useradd -m -u 1000 brickhub && chown -R brickhub:brickhub /app
USER brickhub

# Environment defaults (override via docker-compose or .env)
ENV DOCKER_CONTAINER=1
ENV DATABASE_URL=sqlite:///./data/database.db
ENV UPLOAD_DIR=./data/uploads
ENV EXPORT_DIR=./export
ENV BACKUP_DIR=./backup
ENV ACCESS_TOKEN_EXPIRE_MINUTES=480

# glibc-Malloc-Tuning: gibt freigegebenen Speicher aggressiver ans OS zurück,
# damit Docker/Unraid einen realistischen RAM-Verbrauch anzeigt.
ENV MALLOC_MMAP_THRESHOLD_=67108864
ENV MALLOC_TRIM_THRESHOLD_=67108864
ENV MALLOC_TOP_PAD_=0

EXPOSE 8080

# Healthcheck im Image, nicht im Unraid-Template: Ein Template-Healthcheck
# (--health-cmd in ExtraParams) geht bei jedem GUI-Update verloren, das ihn
# nicht mitträgt. Im Image ist er Teil des Containers und bleibt erhalten.
# Kein curl — das ist in python:3.12-slim nicht enthalten. Exec-Form vermeidet
# Shell-Quoting. Geprüft wird der JSON-Inhalt, nicht nur HTTP 200: Die SPA-
# Catch-All in main.py liefert für jeden unbekannten Pfad index.html mit
# Status 200 — ein reiner Statuscode-Check wäre dadurch immer "gesund".
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["python", "-c", "import urllib.request,json,sys; sys.exit(0 if json.load(urllib.request.urlopen('http://localhost:8080/api/health', timeout=5)).get('status') == 'ok' else 1)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
