@echo off
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python webcam.py --results model_results %*
pause
