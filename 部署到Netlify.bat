@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ORACULUM · 部署到 Netlify

REM 页面放在 Netlify，/api/* 由 netlify.toml 里的转发规则交给 Beam 后端（浏览器不直连 beam.cloud）。
REM 第一次使用：npm i -g netlify-cli ，再运行 netlify login 授权。
REM 后端（backend/beam）改了要另外运行 部署到Beam.bat。

where netlify >nul 2>nul || ( echo 请先运行 npm i -g netlify-cli & pause & exit /b 1 )

call netlify deploy --build --prod
if errorlevel 1 ( echo 部署失败 & pause & exit /b 1 )
echo.
echo 部署完成：https://oraculum-tarot.netlify.app
pause
