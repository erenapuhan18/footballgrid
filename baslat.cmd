@echo off
rem FOOTBALLGRID - bu bilgisayarda ve ayni Wi-Fi'de oynamak icin cift tikla.
cd /d "%~dp0"
if not exist node_modules call npm install --no-fund --no-audit
node server\index.js
pause
