@echo off
chcp 65001 >nul
setlocal
title NeoForge Server

REM ===================================================================
REM  NeoForge / Minecraft 1.21.1  server launcher
REM  Starts the server with Java 21 explicitly.
REM  (java on PATH is 23, but NeoForge 21.1 officially supports Java 21)
REM
REM  Auto-restart:
REM    A run is treated as a crash if the exit code is non-zero, OR if a
REM    new file appeared in crash-reports\ (some crashes exit with 0).
REM    /stop (exit 0) and Ctrl+C (exit 130) do NOT restart.
REM    If the server ran for STABLE_SECONDS or longer before crashing,
REM    the crash counter is reset, so only crashes "in a row" count.
REM
REM  Backups:
REM    backup.ps1 (same folder) is started in a minimized window and
REM    takes periodic world backups via RCON. Settings are in backup.ps1.
REM    It stops by itself when this launcher window is closed.
REM
REM  Mod sync:
REM    sync-mods.ps1 (same folder) reports the mods list to the
REM    mods-sync Worker before every launch, so players' Prism Launcher
REM    can follow mod changes. Failures never block the server start.
REM
REM  NOTE: Keep this file ASCII only, with CRLF line endings.
REM        cmd.exe reads .bat files with the system codepage (932),
REM        so UTF-8 Japanese text becomes mojibake.
REM ===================================================================

set "JAVA_EXE=C:\Program Files\Java\jdk-21.0.11\bin\java.exe"
set "NEOFORGE_VERSION=21.1.241"

REM  How many crashes in a row before giving up.
set "MAX_RESTARTS=3"

REM  Seconds to wait before each restart.
set "RESTART_DELAY=5"

REM  A run at least this long (seconds) resets the crash counter.
set "STABLE_SECONDS=600"

if not exist "%JAVA_EXE%" (
  echo [ERROR] Java 21 not found: "%JAVA_EXE%"
  echo         Edit the JAVA_EXE line in this file to point to your Java 21.
  pause
  exit /b 1
)

cd /d "%~dp0"

set "ARGS_FILE=libraries\net\neoforged\neoforge\%NEOFORGE_VERSION%\win_args.txt"
if not exist "%ARGS_FILE%" (
  echo [ERROR] NeoForge args file not found: "%ARGS_FILE%"
  echo         Check the NEOFORGE_VERSION line in this file.
  pause
  exit /b 1
)

REM  If eula.txt does not exist yet, the server creates it on first run.
if exist "eula.txt" (
  findstr /i /r /c:"^eula=true" eula.txt >nul
  if errorlevel 1 (
    echo [STOP] eula.txt still says eula=false.
    echo        Open eula.txt with Notepad, change eula=false to eula=true,
    echo        then run this file again.
    pause
    exit /b 1
  )
)

REM  Start the backup scheduler once. It survives auto-restarts and
REM  simply waits while the server is down.
if exist "backup.ps1" (
  echo [INFO] Starting backup scheduler in a minimized window...
  start "MC Backup" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1"
) else (
  echo [WARN] backup.ps1 not found. Automatic backups are disabled.
)

set /a RESTART_COUNT=0

:launch
call :now START_TS
call :newest_crash CRASH_BEFORE

echo.
REM  Report the mod list to the mods-sync Worker (never blocks startup).
if exist "sync-mods.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-mods.ps1"
)

echo [INFO] Starting NeoForge server...
"%JAVA_EXE%" @user_jvm_args.txt @%ARGS_FILE% nogui %*
set "EXITCODE=%ERRORLEVEL%"

call :now END_TS
call :newest_crash CRASH_AFTER
set /a UPTIME=END_TS-START_TS

if "%EXITCODE%"=="130" goto :cleanstop

set "CRASHED=0"
if not "%EXITCODE%"=="0" set "CRASHED=1"
if not "%CRASH_AFTER%"=="%CRASH_BEFORE%" set "CRASHED=1"
if "%CRASHED%"=="0" goto :cleanstop

echo.
echo [WARN] Server crashed. Exit code: %EXITCODE%, uptime: %UPTIME% s
if not "%CRASH_AFTER%"=="%CRASH_BEFORE%" echo        Crash report: crash-reports\%CRASH_AFTER%

if %UPTIME% GEQ %STABLE_SECONDS% set /a RESTART_COUNT=0
set /a RESTART_COUNT+=1
if %RESTART_COUNT% GTR %MAX_RESTARTS% goto :toomany

echo [INFO] Auto-restart %RESTART_COUNT% of %MAX_RESTARTS% in %RESTART_DELAY% seconds...
echo        Press Ctrl+C now to cancel.
timeout /t %RESTART_DELAY% /nobreak >nul 2>nul
goto :launch

:toomany
echo.
echo [STOP] The server crashed %MAX_RESTARTS% times in a row. Auto-restart disabled.
echo        Check logs\latest.log and crash-reports\ for the cause.
pause
exit /b 1

:cleanstop
echo.
echo Server stopped normally. Exit code: %EXITCODE%
echo Closing this window also stops the backup scheduler.
pause
exit /b 0

REM ------------------------------------------------------------------
REM  Subroutines
REM ------------------------------------------------------------------

REM  call :now VAR  -> VAR = current Unix time in seconds
:now
set "%~1=0"
for /f %%T in ('powershell.exe -NoProfile -Command "[DateTimeOffset]::Now.ToUnixTimeSeconds()"') do set "%~1=%%T"
exit /b 0

REM  call :newest_crash VAR  -> VAR = newest crash report file name (or empty)
:newest_crash
set "%~1="
for /f "delims=" %%F in ('dir /b /o:d "crash-reports\crash-*.txt" 2^>nul') do set "%~1=%%F"
exit /b 0