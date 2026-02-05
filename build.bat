@echo off
setlocal
chcp 65001 > nul

set "PROJECT_DIR=%~dp0"
:: Remove trailing backslash if present
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

set "NODE_HOME=%PROJECT_DIR%\..\node_tool\node-v22.13.1-win-x64"
set "BUILD_DIR=%PROJECT_DIR%\..\yayoi_build_temp"

echo WORK_DIR: %PROJECT_DIR%
echo NODE_HOME: %NODE_HOME%
echo BUILD_DIR: %BUILD_DIR%

set "PATH=%NODE_HOME%;%PATH%"

echo Node version:
node -v

echo Cleaning temp directory...
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
mkdir "%BUILD_DIR%"

echo Copying to temp directory to avoid Mojibake issues...
robocopy "%PROJECT_DIR%" "%BUILD_DIR%" /E /XD node_modules dist .git .antigravity /NFL /NDL /NJH /NJS
:: Check for robustness (robocopy exit code < 8 is success)
if %ERRORLEVEL% GEQ 8 (
    echo Robocopy failed with error %ERRORLEVEL%
    exit /b 1
)

pushd "%BUILD_DIR%"

echo Installing dependencies...
call npm install --legacy-peer-deps

echo Building project...
call npm run build

if %ERRORLEVEL% EQU 0 (
    echo Build successful.
    popd
    echo Copying artifacts back...
    xcopy "%BUILD_DIR%\dist" "%PROJECT_DIR%\dist" /E /I /Y /Q
    echo Success!
) else (
    echo Build failed.
    popd
    exit /b 1
)

endlocal
