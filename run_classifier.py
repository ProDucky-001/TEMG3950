"""
Interactive runner: enter an audio file path and see human vs AI classification.

Run:  python run_classifier.py
      python run_classifier.py --device cuda   # force GPU
Then type or paste the path to an MP3/WAV/etc. file when prompted.
"""

import argparse
import os
import sys

# Fail fast if transformers is missing (SONAR dependency)
try:
    import transformers  # noqa: F401
except ModuleNotFoundError:
    print("transformers is not installed. Install with:")
    print("  pip install -r requirements.txt")
    sys.exit(1)

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voice_bot import VoiceBot


def _parse_args():
    p = argparse.ArgumentParser(description="Voice classifier — Human vs AI (SONAR)")
    p.add_argument("audio", nargs="?", help="Path to audio file (optional; if omitted, interactive)")
    p.add_argument("--device", choices=("cuda", "cpu"), default=None,
                   help="Device: cuda or cpu. Default: cuda if available, else cpu")
    return p.parse_args()


def main():
    args = _parse_args()
    import torch
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")

    print("=" * 50)
    print("  Voice classifier — Human vs AI")
    print("=" * 50)
    print("Supported: MP3, WAV, FLAC, OGG, M4A")
    if device == "cuda":
        print("Device: GPU (cuda)")
    else:
        print("Device: CPU")
    print()

    bot = VoiceBot(device=device)
    if not bot._checkpoint_loaded:
        print("Note: No SONAR checkpoint in ckpt/. For better accuracy, add a fine-tuned .pth (see HOW_TO_RUN.md).")
        print()

    # If file path given as argument, classify it and exit
    if args.audio:
        path = args.audio.strip().strip('"').strip("'")
        if not os.path.isfile(path):
            print(f"File not found: {path}")
            sys.exit(1)
        result = bot.classify(path)
        label = "Human" if result["label"] == "human" else "AI-generated"
        print(f"File: {path}")
        print(f"Prediction: {label}")
        print(f"  P(Human): {result['prob_human']:.1%}")
        print(f"  P(AI):    {result['prob_ai']:.1%}")
        if not result.get("checkpoint_loaded"):
            print()
            print("  (Probabilities are uncalibrated: no fine-tuned checkpoint. You'll often see ~50%. Add a .pth to ckpt/ for real scores — see HOW_TO_RUN.md.)")
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
            if not result.get("checkpoint_loaded"):
                print("    (Uncalibrated — add a checkpoint to ckpt/ for meaningful scores.)")
            print()
        except Exception as e:
            print(f"  Error: {e}\n")


if __name__ == "__main__":
    main()
