@echo off
setlocal EnableExtensions

rem 从任意目录调用都要在脚本所在目录执行：go build/go run 依赖这里的 go.mod。
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
    echo [DEV MODE] Running from source with live frontend reload...
    echo [DEV MODE] Edit files in internal/api/web/download/ and refresh browser.
    go run . -server %*
    exit /b %errorlevel%
)

rem 预编译发布版优先（无需 Go 的机器）。
set "TMD_EXE="
for %%f in (tmdp-Windows-amd64.exe tmdp.exe tmdp tmd-Windows-amd64.exe tmd.exe tmd) do (
    if not defined TMD_EXE if exist "%~dp0%%f" set "TMD_EXE=%~dp0%%f"
)

rem 没有发布版但有 Go：每次都重建 tmdp-test.exe。只判断"文件是否存在"会让
rem 源码更新后仍运行旧二进制（前端、后端都可能是旧的）。
if not defined TMD_EXE (
    where go >nul 2>nul
    if errorlevel 1 (
        echo Go not found. Download a pre-built release or install Go from https://go.dev/dl/.
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
            set "TMD_DEV=1"
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
if %errorlevel% neq 0 (
    echo.
    echo Server exited with code %errorlevel%.
    pause
)
exit /b %errorlevel%
