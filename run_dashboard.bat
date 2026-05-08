@echo off
cd /d "%~dp0"
echo Starting Flow Kit Ecosystem...

:: Start Backend Server
echo [1/3] Starting Backend Server...
start "FlowKit Backend" cmd /c "start_server.bat"

:: Start Frontend Dashboard
echo [2/3] Starting Dashboard (Vite)...
cd dashboard
start "FlowKit Dashboard" cmd /c "npm run dev"

:: Wait for Vite to be ready
echo [3/3] Waiting for services to initialize...
timeout /t 5 /nobreak > nul

:: Open Dashboard in Chrome specifically
echo Opening Dashboard in Google Chrome...
start chrome "http://localhost:5173"

:: Fallback if chrome command is not in PATH
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
        start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:5173"
    ) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
        start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" "http://localhost:5173"
    ) else (
        echo Chrome not found in standard locations, opening default browser instead...
        start http://localhost:5173
    )
)

echo Done! Keep the two command windows open while working.
pause
