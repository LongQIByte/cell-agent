@echo off
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 24，再重新双击此文件。
  pause
  exit /b 1
)
node --import tsx scripts\service.mjs start
if errorlevel 1 (
  pause
  exit /b 1
)
node --import tsx scripts\service-console.mjs --open
