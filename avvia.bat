@echo off
echo Avvio server locale VCP Trading System...
cd /d "%~dp0docs"
start "" "http://localhost:8080"
python -m http.server 8080
pause
