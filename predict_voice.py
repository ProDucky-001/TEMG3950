"""
CLI for voice classification (Human vs AI). Launcher; logic in voice.predict_voice.

Usage: python predict_voice.py path/to/audio.mp3
       python predict_voice.py --audio path/to/audio.mp3 --device cpu
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voice.predict_voice import main

if __name__ == "__main__":
    main()
