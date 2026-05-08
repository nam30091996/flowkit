@echo off
cd /d "%~dp0"
echo Starting Flow Kit Server...

if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo Virtual environment "venv" not found.
    pause
    exit /b 1
)

python -m agent.main

pause
