@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ORACULUM · 打包桌面客户端

REM 构建高画质客户端版 → 打包成 Windows 程序 → 安装到 D:\ORACULUM\app → 桌面快捷方式「ORACULUM 塔罗」
REM 数据（历史、设置、着色器缓存）在 D:\ORACULUM\data，重装不会清掉。
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call npm run desktop
if errorlevel 1 ( echo 打包失败 & pause & exit /b 1 )
echo.
echo 完成：双击桌面上的「ORACULUM 塔罗」即可打开。
pause
