"""
Interactive runner: enter an audio file path and see human vs AI classification.
Uses GPU (CUDA) by default when available.
"""

import argparse
import os
import sys

from .voice_bot import VoiceBot


def _parse_args():
    p = argparse.ArgumentParser(description="Voice classifier — Human vs AI (Gustking Wav2Vec2)")
    p.add_argument("audio", nargs="?", help="Path to audio file (optional; if omitted, interactive)")
    p.add_argument("--device", choices=("cuda", "cpu"), default="cuda",
                   help="Device: cuda (default) or cpu")
    p.add_argument("--model", type=str, default=None,
                   help="Path to finetuned model dir or Hugging Face model id (default: Gustking)")
    return p.parse_args()


def main():
    args = _parse_args()
    import torch
    if "torchaudio" in sys.modules:
        _ta_stub = sys.modules["torchaudio"]
        torch.audio = _ta_stub
        sys.modules["torch.audio"] = _ta_stub
        sys.modules["torch.audio.transforms"] = getattr(_ta_stub, "transforms", _ta_stub)
    want_gpu = args.device == "cuda"
    if want_gpu and not torch.cuda.is_available():
        device = "cpu"
        print("Note: CUDA not available, using CPU. Install PyTorch with CUDA for GPU.")
    else:
        device = "cuda" if want_gpu else "cpu"

    print("=" * 50)
    print("  Voice classifier — Human vs AI")
    print("=" * 50)
    print("Supported: MP3, WAV, FLAC, OGG, M4A")
    if device == "cuda":
        print("Device: GPU (cuda)")
    else:
        print("Device: CPU")
    print()

    bot = VoiceBot(device=device, model_id=args.model)

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
