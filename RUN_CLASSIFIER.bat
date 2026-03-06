@echo off
cd /d "%~dp0"
echo.
echo  Voice Classifier - Human vs AI
echo  Enter an audio file path (MP3, WAV, etc.) when prompted.
echo.
python run_classifier.py
if errorlevel 1 pause
