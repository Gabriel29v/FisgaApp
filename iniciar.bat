@echo off
title Fisga App Server
cd /d "%~dp0"

where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    node server.js
) else (
    if exist "%APPDATA%\JetBrains\IntelliJIdea2026.1\node\versions\24.19.0\node.exe" (
        "%APPDATA%\JetBrains\IntelliJIdea2026.1\node\versions\24.19.0\node.exe" server.js
    ) else if exist "%LOCALAPPDATA%\JetBrains\acp-agents\.runtimes\node\24.13.0\bin\node.exe" (
        "%LOCALAPPDATA%\JetBrains\acp-agents\.runtimes\node\24.13.0\bin\node.exe" server.js
    ) else (
        echo Node.js nao foi encontrado no sistema.
        echo Baixe e instale em: https://nodejs.org
        pause
    )
)
pause
