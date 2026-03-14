@echo off
cd /d "%~dp0"
python -m voice.download_audio_mnist
pause
