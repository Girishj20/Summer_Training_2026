@echo off
title MedPredict AI - Launch Panel
echo ===================================================
echo             LAUNCHING MEDPREDICT AI UI
echo ===================================================
echo.
echo [1/2] Starting Flask Prediction Server...
echo (This will open a separate command console for server logs)
start "MedPredict Server" "D:\GIRISH\python.exe" "%~dp0app.py"
echo.
echo [2/2] Waiting for database and models to initialize...
timeout /t 3 /nobreak > nul
echo.
echo Opening default web browser to http://127.0.0.1:5000...
start "" "http://127.0.0.1:5000"
echo.
echo MedPredict AI launched successfully!
echo (You can close this launcher panel now; keep the server console open)
timeout /t 2 > nul
exit
