@echo off
chcp 65001 >nul
echo.
echo  ============================================
echo   VCP Trading System -- Avvio
echo  ============================================
echo.
echo  [1/2] Aggiornamento dati in corso...
echo        (questa operazione richiede ~30-40 minuti)
echo.

cd /d "%~dp0"
python scripts/fetch_data.py

echo.
echo  [2/2] Avvio server locale...
echo.
cd /d "%~dp0docs"
start "" "http://localhost:8080"
python -m http.server 8080
pause
