@echo off
setlocal enabledelayedexpansion
title BrickHub Server Manager
color 0F

:MENU
cls
echo ============================================
echo          BrickHub Server Manager
echo ============================================
echo.
echo   [1]  Server starten
echo   [2]  Server stoppen
echo   [3]  Server neustarten
echo   [4]  Status anzeigen
echo   [5]  Beenden
echo.
echo ============================================
echo.
set /p CHOICE="Auswahl: "

if "%CHOICE%"=="1" goto START
if "%CHOICE%"=="2" goto STOP
if "%CHOICE%"=="3" goto RESTART
if "%CHOICE%"=="4" goto STATUS
if "%CHOICE%"=="5" goto EXIT
echo Ungueltige Auswahl!
timeout /t 2 /nobreak >nul
goto MENU

:START
echo.
echo === Server starten ===

REM Pruefen ob Backend schon laeuft (sprachunabhaengig: LISTENING/ABHOEREN)
set "BACKEND_RUNNING=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000" ^| findstr "0.0.0.0:0"') do set "BACKEND_RUNNING=1"

if "!BACKEND_RUNNING!"=="1" (
    echo [!] Backend laeuft bereits auf Port 8000
) else (
    echo [*] Backend starten (FastAPI auf Port 8000^)...
    start "BrickHub Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
    echo [OK] Backend gestartet
)

timeout /t 3 /nobreak >nul

REM Pruefen ob Frontend schon laeuft
set "FRONTEND_RUNNING=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173" ^| findstr "0.0.0.0:0"') do set "FRONTEND_RUNNING=1"

if "!FRONTEND_RUNNING!"=="1" (
    echo [!] Frontend laeuft bereits auf Port 5173
) else (
    echo [*] Frontend starten (Vite auf Port 5173^)...
    start "BrickHub Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
    echo [OK] Frontend gestartet
)

echo.
echo ========================================
echo   Backend API:  http://localhost:8000
echo   Frontend:     http://localhost:5173
echo   API Docs:     http://localhost:8000/docs
echo ========================================
echo.
pause
goto MENU

:STOP
echo.
echo === Server stoppen ===

REM Backend stoppen (uvicorn/python auf Port 8000)
set "BACKEND_KILLED=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000" ^| findstr "0.0.0.0:0"') do (
    taskkill /PID %%a /T /F >nul 2>&1
    set "BACKEND_KILLED=1"
)
REM Backend-Fenster schliessen
taskkill /FI "WINDOWTITLE eq BrickHub Backend*" /F >nul 2>&1

if "!BACKEND_KILLED!"=="1" (
    echo [OK] Backend gestoppt
) else (
    echo [--] Backend war nicht aktiv
)

REM Frontend stoppen (node/vite auf Port 5173)
set "FRONTEND_KILLED=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173" ^| findstr "0.0.0.0:0"') do (
    taskkill /PID %%a /T /F >nul 2>&1
    set "FRONTEND_KILLED=1"
)
REM Frontend-Fenster schliessen
taskkill /FI "WINDOWTITLE eq BrickHub Frontend*" /F >nul 2>&1

if "!FRONTEND_KILLED!"=="1" (
    echo [OK] Frontend gestoppt
) else (
    echo [--] Frontend war nicht aktiv
)

echo.
echo Server gestoppt.
echo.
pause
goto MENU

:RESTART
echo.
echo === Server neustarten ===
echo [*] Server stoppen...

REM Backend stoppen
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000" ^| findstr "0.0.0.0:0"') do (
    taskkill /PID %%a /T /F >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq BrickHub Backend*" /F >nul 2>&1

REM Frontend stoppen
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173" ^| findstr "0.0.0.0:0"') do (
    taskkill /PID %%a /T /F >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq BrickHub Frontend*" /F >nul 2>&1

echo [OK] Server gestoppt
echo [*] Warte auf Port-Freigabe...
timeout /t 3 /nobreak >nul

echo [*] Backend starten...
start "BrickHub Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul

echo [*] Frontend starten...
start "BrickHub Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo [OK] Server neu gestartet
echo.
echo ========================================
echo   Backend API:  http://localhost:8000
echo   Frontend:     http://localhost:5173
echo   API Docs:     http://localhost:8000/docs
echo ========================================
echo.
pause
goto MENU

:STATUS
echo.
echo === Server Status ===
echo.

set "BACKEND_ACTIVE=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000" ^| findstr "0.0.0.0:0"') do set "BACKEND_ACTIVE=1"

if "!BACKEND_ACTIVE!"=="1" (
    echo   Backend  (Port 8000^):  AKTIV
) else (
    echo   Backend  (Port 8000^):  INAKTIV
)

set "FRONTEND_ACTIVE=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173" ^| findstr "0.0.0.0:0"') do set "FRONTEND_ACTIVE=1"

if "!FRONTEND_ACTIVE!"=="1" (
    echo   Frontend (Port 5173^):  AKTIV
) else (
    echo   Frontend (Port 5173^):  INAKTIV
)

echo.
pause
goto MENU

:EXIT
echo.
echo Auf Wiedersehen!
timeout /t 1 /nobreak >nul
exit /b 0
