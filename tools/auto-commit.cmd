@echo off
cd /d "%~dp0.."
if not exist logs mkdir logs
node tools\auto-commit.js >> logs\auto-commit.log 2>&1
