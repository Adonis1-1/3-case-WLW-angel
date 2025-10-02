@echo off
chcp 65001 >nul
title Guardian Angel - Complete System

echo [INFO] Starting Guardian Angel System
echo ==========================================
echo [INFO] Working directory: %CD%
echo.

REM Define paths
set "EMULATOR_PATH=device_emulator"
set "BACKEND_PATH=guardian_angel"
set "FRONTEND_PATH=guardian_angel_front"
set "DOCTOR_DASHBOARD_PATH=doctor_dashboard"

REM Check if directories exist
echo [INFO] Checking paths...
if not exist "%EMULATOR_PATH%" (
    echo [ERROR] Emulator folder not found: %EMULATOR_PATH%
    pause
    exit /b 1
)

if not exist "%BACKEND_PATH%" (
    echo [ERROR] Guardian Angel folder not found: %BACKEND_PATH%
    pause
    exit /b 1
)

if not exist "%FRONTEND_PATH%" (
    echo [ERROR] Frontend folder not found: %FRONTEND_PATH%
    pause
    exit /b 1
)

if not exist "%DOCTOR_DASHBOARD_PATH%" (
    echo [ERROR] Doctor Dashboard folder not found: %DOCTOR_DASHBOARD_PATH%
    pause
    exit /b 1
)

echo [INFO] All paths found.
echo.

REM Check for Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    pause
    exit /b 1
)

echo [INFO] Launching components in sequence...
echo.

REM 1. START DATA EMULATOR (from device_emulator)
echo 1. [EMULATOR] Starting data emulator...
start "CTG Data Emulator" cmd /k "cd /d "%EMULATOR_PATH%" && python main.py && echo Emulator stopped && pause"

echo    [INFO] Waiting for emulator to start (3 sec)...
timeout /t 3 /nobreak >nul

REM 2. START API SERVER (from guardian_angel)
echo 2. [API] Starting API server...
start "Guardian Angel API" cmd /k "cd /d "%BACKEND_PATH%" && uvicorn api:app --reload --host 0.0.0.0 --port 8000 && echo API server stopped && pause"

echo    [INFO] Waiting for API to start (5 sec)...
timeout /t 5 /nobreak >nul

REM 3. START FRONTEND (from guardian_angel_front)
echo 3. [FRONTEND] Starting frontend...
start "Guardian Angel Frontend" cmd /k "cd /d "%FRONTEND_PATH%" && python -m http.server 8080 && echo Frontend stopped && pause"

echo    [INFO] Waiting for frontend to start (3 sec)...
timeout /t 3 /nobreak >nul

REM 4. START DOCTOR DASHBOARD (from doctor_dashboard)
echo 4. [DOCTOR DASHBOARD] Starting doctor dashboard...
start "Doctor Dashboard" cmd /k "cd /d "%DOCTOR_DASHBOARD_PATH%" && python -m http.server 8081 && echo Doctor Dashboard stopped && pause"

echo    [INFO] Waiting for doctor dashboard to start (3 sec)...
timeout /t 3 /nobreak >nul

echo.
echo [SUCCESS] ALL COMPONENTS LAUNCHED!
echo ==========================================
echo [INFO] Launch sequence:
echo    1. [EMULATOR] Data Emulator (generates CTG data)
echo    2. [API] API Server (handles requests and ML analysis)
echo    3. [FRONTEND] Web Interface (user interface)
echo    4. [DOCTOR DASHBOARD] Doctor Dashboard (separate dashboard)
echo.
echo [INFO] Available addresses:
echo    * Frontend: http://localhost:8080
echo    * Doctor Dashboard: http://localhost:8081
echo    * API: http://localhost:8000
echo    * API Docs: http://localhost:8000/docs
echo    * WebSocket: ws://localhost:8000/ws
echo.
echo [INFO] Opening frontend in browser...
start http://localhost:8080
start http://localhost:8081
echo.
echo [INFO] To check system operation:
echo    1. Browser should open automatically at http://localhost:8080 and http://localhost:8081
echo    2. Ensure data is displayed on charts
echo    3. Check API status at http://localhost:8000/status
echo.
echo [INFO] To stop all services, close all CMD windows or press Ctrl+C in each window.
echo.
pause

