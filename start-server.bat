@echo off
setlocal

if "%TMD_DEV%"=="1" (
    echo [DEV MODE] Running from source with live frontend reload...
    echo [DEV MODE] Edit files in internal/api/web/web1/ or web2/ and refresh browser.
    echo [DEV MODE] Starting TMD server...
    echo [DEV MODE] Open http://localhost:25556/ in your browser.
    echo.
    go run . -server %*
    exit /b %errorlevel%
)

rem Scan for existing executables (including tmd-test.exe from previous builds)
set "TMD_EXE="
for %%e in (tmd-test.exe tmd tmd.exe tmd-Windows-amd64.exe) do (
    if exist "%~dp0%%e" set "TMD_EXE=%~dp0%%e"
)

if not defined TMD_EXE (
    where go >nul 2>nul
    if %errorlevel% equ 0 (
        if not exist "%~dp0go.mod" (
            echo TMD source code not found in current directory.
            echo.
            pause
            exit /b 1
        )
        echo Go found, building tmd-test.exe from source...
        set "TMD_EXE=%~dp0tmd-test.exe"
        go build -ldflags "-X github.com/unkmonster/tmd/internal/api.Version=test" -o tmd-test.exe .
        if %errorlevel% neq 0 (
            echo Build failed.
            pause
            exit /b %errorlevel%
        )
        set "TMD_DEV=1"
    ) else (
        echo tmd executable not found and Go is not installed.
        echo Install Go from https://go.dev/dl/ or download a pre-built release.
        echo.
        pause
        exit /b 1
    )
)

echo Starting TMD: %TMD_EXE% -server %*
:: Extract port from arguments (default 25556)
set "PORT=25556"
for %%a in (%*) do (
    if "%%a"=="-port" set "PORT="
    if defined PORT if not "%%a"=="-port" if not "%%a"=="-server" set "PORT=%%a"
)
set "PORT=%PORT: =%"
if "%PORT%"=="" set "PORT=25556"
echo Open http://localhost:%PORT%/ in your browser.
echo.
"%TMD_EXE%" -server %*
exit /b %errorlevel%
