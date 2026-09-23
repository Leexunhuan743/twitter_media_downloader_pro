@echo off
rem 注意：本脚本避免在括号块内使用 %VAR% / %errorlevel% —— cmd 在解析整块时
rem 就完成展开，块内赋值与随后的判断会拿到陈旧值（回退分支曾因此失效）。
rem 因此候选查找与 Go 回退都用顶层顺序语句 + goto。
setlocal

if "%TMD_DEV%"=="1" goto :dev

set "TMD_EXE=%~dp0tmdp-Windows-amd64.exe"
if not exist "%TMD_EXE%" set "TMD_EXE=%~dp0tmdp.exe"
if not exist "%TMD_EXE%" set "TMD_EXE=%~dp0tmdp"
if not exist "%TMD_EXE%" set "TMD_EXE=%~dp0tmd-Windows-amd64.exe"
if not exist "%TMD_EXE%" set "TMD_EXE=%~dp0tmd.exe"
if not exist "%TMD_EXE%" set "TMD_EXE=%~dp0tmd"

if exist "%TMD_EXE%" goto :run

where go >nul 2>nul
if errorlevel 1 goto :notfound
if not exist "%~dp0go.mod" goto :notfound

echo Building tmdp-test.exe from source with Go...
set "TMD_EXE=%~dp0tmdp-test.exe"
go build -ldflags "-X github.com/unkmonster/tmd/internal/api.Version=test" -o tmdp-test.exe .
if errorlevel 1 echo Build failed, falling back to existing tmdp-test.exe...
if not exist "%TMD_EXE%" goto :notfound
set "TMD_DEV=1"
goto :run

:dev
echo [DEV MODE] Running from source with live frontend reload...
echo [DEV MODE] Edit files in internal/api/web/web1/, web2/ or web3/ and refresh browser.
go run . -server %*
exit /b %errorlevel%

:notfound
echo tmdp executable not found.
echo Install Go from https://go.dev/dl/ or download a pre-built release.
echo.
pause
exit /b 1

:run
"%TMD_EXE%" -server %*
if errorlevel 1 (
    echo.
    echo Server exited with code %errorlevel%.
    pause
)
exit /b %errorlevel%
