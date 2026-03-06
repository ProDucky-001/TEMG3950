"""
Interactive runner: enter an audio file path and see human vs AI classification.

Run:  python run_classifier.py
Then type or paste the path to an MP3/WAV/etc. file when prompted.
"""

import os
import sys

# Fail fast if ai-audio-detector is missing
try:
    import ai_audio_detector  # noqa: F401
except ModuleNotFoundError:
    print("ai-audio-detector is not installed. Install it with:")
    print("  pip install ai-audio-detector")
    print("  or:  pip install -r requirements.txt")
    sys.exit(1)

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voice_bot import VoiceBot


def main():
    print("=" * 50)
    print("  Voice classifier — Human vs AI")
    print("=" * 50)
    print("Supported: MP3, WAV, FLAC, OGG, M4A")
    print()

    bot = VoiceBot()
    if not bot._checkpoint_loaded:
        print("Note: No trained models found. Train first with:")
        print('      ai-audio-detector --train --human-dir path/to/human_audio --ai-dir path/to/ai_audio')
        print()

    # If file path given as argument, classify it and exit
    if len(sys.argv) > 1:
        path = sys.argv[1].strip().strip('"').strip("'")
        if not os.path.isfile(path):
            print(f"File not found: {path}")
            sys.exit(1)
        result = bot.classify(path)
        label = "Human" if result["label"] == "human" else "AI-generated"
        print(f"File: {path}")
        print(f"Prediction: {label}")
        print(f"  P(Human): {result['prob_human']:.1%}")
        print(f"  P(AI):    {result['prob_ai']:.1%}")
        return

    print("Enter path to an audio file (or 'q' to quit).")
    print()

    while True:
        try:
            path = input("File path: ").strip().strip('"').strip("'")
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break

        if not path:
            continue
        if path.lower() == "q":
            print("Bye.")
            break

        if not os.path.isfile(path):
            print(f"  File not found: {path}\n")
            continue

        try:
            result = bot.classify(path)
            label = "Human" if result["label"] == "human" else "AI-generated"
            print()
            print("  Result:")
            print(f"    Prediction: {label}")
            print(f"    P(Human):   {result['prob_human']:.1%}")
            print(f"    P(AI):      {result['prob_ai']:.1%}")
            print()
        except Exception as e:
            print(f"  Error: {e}\n")


if __name__ == "__main__":
    main()
