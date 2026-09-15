@echo off
rem FOOTBALLGRID - internetteki arkadaslar icin gecici herkese acik link (Cloudflare, hesap gerekmez).
cd /d "%~dp0"
if not exist node_modules call npm install --no-fund --no-audit
node tools\public.mjs
pause
