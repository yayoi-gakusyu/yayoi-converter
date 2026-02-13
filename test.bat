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




:: Create ASCII workspace (Incremental)
echo Setting up ASCII workspace...
set "WORKSPACE_DIR=%PROJECT_DIR%\..\node_tool\temp_test_workspace"
if not exist "%WORKSPACE_DIR%" mkdir "%WORKSPACE_DIR%"

:: Sync files (MIRrors directory, only copying changes)
echo Syncing source...
robocopy "%PROJECT_DIR%\src" "%WORKSPACE_DIR%\src" /MIR /NFL /NDL /NJH /NJS >nul
copy "%PROJECT_DIR%\vitest.config.ts" "%WORKSPACE_DIR%" >nul
copy "%PROJECT_DIR%\tsconfig.json" "%WORKSPACE_DIR%" >nul
copy "%PROJECT_DIR%\package.json" "%WORKSPACE_DIR%" >nul

:: Sync node_modules (Fast after first run)
echo Syncing node_modules...
robocopy "%PROJECT_DIR%\node_modules" "%WORKSPACE_DIR%\node_modules" /MIR /MT:8 /NFL /NDL /NJH /NJS >nul

:: Run tests
pushd "%WORKSPACE_DIR%"
echo Running Vitest in ASCII environment...
call "%NODE_HOME%\node.exe" "node_modules\vitest\vitest.mjs" run --reporter=verbose
popd




endlocal
