@echo off
echo Starting BrickHub Development Environment...
echo.

REM Start Backend
echo Starting Backend (FastAPI on port 8000)...
start "BrickHub Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

REM Wait a moment then start Frontend
timeout /t 2 /nobreak >nul
echo Starting Frontend (Vite on port 5173)...
start "BrickHub Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo BrickHub is starting...
echo Backend API:  http://localhost:8000
echo Frontend:     http://localhost:5173
echo API Docs:     http://localhost:8000/docs
echo.
pause
