@echo off
setlocal

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

:: Use the local node_tool
set "NODE_HOME=%PROJECT_DIR%\..\node_tool\node-v22.13.1-win-x64"
set "PATH=%NODE_HOME%;%PATH%"

echo Using Node:
node -v

echo Installing dependencies (if needed)...
if not exist "node_modules\vitest" (
    call npm install --legacy-peer-deps
)

echo Running Tests...
call npm test -- run --reporter=verbose

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Tests Passed!
) else (
    echo.
    echo Tests Failed.
    exit /b %ERRORLEVEL%
)

endlocal
