@echo off
setlocal

if "%TMD_DEV%"=="1" (
    echo [DEV MODE] Running from source with live frontend reload...
    echo [DEV MODE] Edit files in internal/api/web/web1/ or web2/ and refresh browser.
    go run . -server %*
    exit /b %errorlevel%
)

set "TMD_EXE=%~dp0tmd-Windows-amd64.exe"
if not exist "%TMD_EXE%" (
    set "TMD_EXE=%~dp0tmd.exe"
)
if not exist "%TMD_EXE%" (
    set "TMD_EXE=%~dp0tmd"
)

if not exist "%TMD_EXE%" (
    where go >nul 2>nul
    if %errorlevel% equ 0 if exist "%~dp0go.mod" (
        echo Building tmd-test.exe from source with Go...
        set "TMD_EXE=%~dp0tmd-test.exe"
        go build -ldflags "-X github.com/unkmonster/tmd/internal/api.Version=test" -o tmd-test.exe .
        if %errorlevel% equ 0 (
            set "TMD_DEV=1"
            goto :run
        )
        echo Build failed, falling back to existing tmd-test.exe...
    )
    set "TMD_EXE=%~dp0tmd-test.exe"
    if not exist "%TMD_EXE%" (
        echo tmd executable not found.
        echo Install Go from https://go.dev/dl/ or download a pre-built release.
        echo.
        pause
        exit /b 1
    )
)

:run
"%TMD_EXE%" -server %*
if %errorlevel% neq 0 (
    echo.
    echo Server exited with code %errorlevel%.
    pause
)
exit /b %errorlevel%
