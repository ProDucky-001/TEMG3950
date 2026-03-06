"""
Inference script for AI vs Human voice detection.

Uses the integrated Voice Bot; supports any MP3 or other audio format.

Usage:
    python predict_voice.py --audio path/to/audio.mp3
    python predict_voice.py path/to/audio.mp3
    python predict_voice.py --audio path/to/audio.wav --checkpoint checkpoints/voice_classifier.pt
"""

import argparse
import os
import sys

# Ensure project root is on path when run as script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voice_bot import VoiceBot, DEFAULT_CHECKPOINT_PATH


def main():
    parser = argparse.ArgumentParser(
        description="Classify audio (any MP3/WAV/etc.) as human or AI-generated voice."
    )
    parser.add_argument(
        "audio",
        nargs="?",
        type=str,
        help="Path to audio file (MP3, WAV, FLAC, etc.)",
    )
    parser.add_argument(
        "--audio",
        type=str,
        dest="audio_opt",
        help="Path to audio file (alternative to positional)",
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        default=DEFAULT_CHECKPOINT_PATH,
        help="Path to trained checkpoint",
    )
    parser.add_argument("--config", type=str, default=None)
    args = parser.parse_args()

    audio_path = args.audio_opt or args.audio
    if not audio_path:
        parser.error("Provide an audio file: predict_voice.py <file.mp3> or --audio <file>")

    if not os.path.isfile(audio_path):
        print(f"Error: File not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    bot = VoiceBot(
        checkpoint_path=args.checkpoint,
        config_path=args.config,
    )
    if not bot._checkpoint_loaded:
        print(
            "WARNING: No checkpoint loaded. Train with: python train_voice_classifier.py --human_dir ... --ai_dir ...",
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
