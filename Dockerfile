# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

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

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
