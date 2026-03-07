"""
Inference script for AI vs Human voice detection.

Uses SONAR (Wav2Vec2-based AI-audio detection). Supports WAV, MP3, FLAC, OGG, M4A, AAC.

Usage:
    python predict_voice.py --audio path/to/audio.mp3
    python predict_voice.py path/to/audio.mp3
"""

import argparse
import os
import sys

# Ensure project root is on path when run as script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voice_bot import VoiceBot


def main():
    parser = argparse.ArgumentParser(
        description="Classify audio as human or AI-generated (SONAR model)."
    )
    parser.add_argument(
        "audio",
        nargs="?",
        type=str,
        help="Path to audio file (WAV, MP3, FLAC, OGG, M4A, AAC)",
    )
    parser.add_argument(
        "--audio",
        type=str,
        dest="audio_opt",
        help="Path to audio file (alternative to positional)",
    )
    parser.add_argument("--checkpoint", type=str, default=None, help="Path to SONAR checkpoint (.pth)")
    parser.add_argument("--config", type=str, default=None, help="Ignored (API compat)")
    parser.add_argument("--device", choices=("cuda", "cpu"), default=None,
                        help="Device: cuda or cpu (default: cuda if available)")
    args = parser.parse_args()

    audio_path = args.audio_opt or args.audio
    if not audio_path:
        parser.error("Provide an audio file: predict_voice.py <file.mp3> or --audio <file>")

    if not os.path.isfile(audio_path):
        print(f"Error: File not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    import torch
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    bot = VoiceBot(checkpoint_path=args.checkpoint, config_path=args.config, device=device)
    if not bot._checkpoint_loaded:
        print(
            "WARNING: No SONAR checkpoint in ckpt/. Add a fine-tuned .pth for better accuracy (see HOW_TO_RUN.md).",
            file=sys.stderr,
        )

    result = bot.classify(audio_path)
    label_display = "Human" if result["label"] == "human" else "AI-generated"

    print("\n--- Voice Classification Result ---")
    print(f"File: {audio_path}")
    print(f"Prediction: {label_display}")
    print(f"  P(Human): {result['prob_human']:.2%}")
    print(f"  P(AI):    {result['prob_ai']:.2%}")
    print("-----------------------------------\n")


if __name__ == "__main__":
    main()
