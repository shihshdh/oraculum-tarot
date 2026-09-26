@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ORACULUM · 部署到 Beam

echo ==== 第 1 步：构建前端（与后端同域，不设 VITE_API_BASE）====
set VITE_API_BASE=
call npm run build
if errorlevel 1 ( echo 前端构建失败 & pause & exit /b 1 )
call node scripts/export-shared.mjs
if errorlevel 1 ( echo 导出提示词失败 & pause & exit /b 1 )

echo ==== 第 2 步：在 WSL 里部署到 Beam ====
REM 前端和后端一起部署（前端文件随部署包上传）
wsl.exe --cd "%~dp0." -e ../../sharp-web/.venv-beam/bin/python deploy/beam_deploy.py
if errorlevel 1 ( echo 部署失败，详情见 .beam-tools\deploy-latest.log & pause & exit /b 1 )
echo.
echo 部署完成，地址记录在 .beam-tools\deployment.json
pause
