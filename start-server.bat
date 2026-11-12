@echo off
setlocal EnableExtensions

rem cmd.exe needs CRLF; keep this file ASCII-only so the console code page
rem cannot mangle it. Always run relative to the script directory: go build
rem and go run resolve go.mod from the current directory.
cd /d "%~dp0" 2>nul
if errorlevel 1 (
    echo Cannot switch to script directory "%~dp0".
    pause
    exit /b 1
)
if not exist "%~dp0go.mod" (
    echo go.mod not found in "%~dp0".
    echo Run this script from a full source checkout, or use a pre-built release.
    pause
    exit /b 1
)

if "%TMD_DEV%"=="1" (
    echo [DEV MODE] Running from source; edit internal/api/web/download/ and refresh.
    go run . -server %*
    exit /b %errorlevel%
)

rem Pre-built release binaries take priority on machines without Go.
set "TMD_EXE="
for %%f in (tmdp-Windows-amd64.exe tmdp.exe tmdp tmd-Windows-amd64.exe tmd.exe tmd) do (
    if not defined TMD_EXE if exist "%~dp0%%f" set "TMD_EXE=%~dp0%%f"
)

rem Without a release, rebuild on every start when Go is available: checking
rem only whether tmdp-test.exe exists would keep running stale code.
if not defined TMD_EXE (
    where go >nul 2>nul
    if errorlevel 1 (
        echo Go not found. Install Go from https://go.dev/dl/ or use a pre-built release.
        if exist "%~dp0tmdp-test.exe" (
            set "TMD_EXE=%~dp0tmdp-test.exe"
        ) else (
            echo tmdp executable not found.
            pause
            exit /b 1
        )
    ) else (
        echo Building tmdp-test.exe from source...
        go build -ldflags "-X github.com/unkmonster/tmd/internal/api.Version=test" -o tmdp-test.exe .
        if errorlevel 1 (
            echo Build failed.
            if exist "%~dp0tmdp-test.exe" (
                echo Falling back to the existing tmdp-test.exe, which may be stale.
                set "TMD_EXE=%~dp0tmdp-test.exe"
            ) else (
                pause
                exit /b 1
            )
        ) else (
            set "TMD_EXE=%~dp0tmdp-test.exe"
        )
    )
)

if not defined TMD_EXE (
    echo tmdp executable not found.
    pause
    exit /b 1
)

:run
"%TMD_EXE%" -server %*
set "TMD_RC=%errorlevel%"
if not "%TMD_RC%"=="0" (
    echo.
    echo Server exited with code %TMD_RC%.
    pause
)
exit /b %TMD_RC%
