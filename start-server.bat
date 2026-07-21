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
    if %errorlevel% equ 0 (
        if exist "%~dp0go.mod" (
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
            echo TMD source code not found in current directory.
            set "TMD_EXE=%~dp0tmd-test.exe"
        )
    ) else (
        set "TMD_EXE=%~dp0tmd-test.exe"
        if not exist "%TMD_EXE%" (
            echo tmd executable not found and Go is not installed.
            echo Install Go from https://go.dev/dl/ or download a pre-built release.
            echo.
            pause
            exit /b 1
        )
    )
)

"%TMD_EXE%" -server %*
exit /b %errorlevel%
