@echo off
chcp 65001 >nul
title Guardian Angel - Stop System

echo [INFO] Stopping Guardian Angel System
echo ==========================================
echo.

REM Terminate Python processes for the project
TASKKILL /IM python.exe /F >nul 2>&1
TASKKILL /IM uvicorn.exe /F >nul 2>&1

REM Terminate CMD windows opened by start_system.bat
TASKKILL /FI "WINDOWTITLE eq CTG Data Emulator" /T /F >nul 2>&1
TASKKILL /FI "WINDOWTITLE eq Guardian Angel API" /T /F >nul 2>&1
TASKKILL /FI "WINDOWTITLE eq Guardian Angel Analysis" /T /F >nul 2>&1
TASKKILL /FI "WINDOWTITLE eq Guardian Angel Frontend" /T /F >nul 2>&1
TASKKILL /FI "WINDOWTITLE eq Doctor Dashboard" /T /F >nul 2>&1

echo [INFO] All components stopped.
echo.
timeout /t 3 /nobreak >nul
pause

