"""
Inference script for AI vs Human voice detection.

Uses Gustking/wav2vec2-large-xlsr-deepfake-audio-classification (Hugging Face).
Supports WAV, MP3, FLAC, OGG, M4A, AAC.
"""

import argparse
import os
import sys

from .voice_bot import VoiceBot


def main():
    parser = argparse.ArgumentParser(
        description="Classify audio as human or AI-generated (Gustking Wav2Vec2 model)."
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
    parser.add_argument("--device", choices=("cuda", "cpu"), default="cuda",
                        help="Device: cuda (default) or cpu")
    args = parser.parse_args()

    audio_path = args.audio_opt or args.audio
    if not audio_path:
        parser.error("Provide an audio file: predict_voice.py <file.mp3> or --audio <file>")

    if not os.path.isfile(audio_path):
        print(f"Error: File not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    import torch
    want_gpu = args.device == "cuda"
    device = "cuda" if (want_gpu and torch.cuda.is_available()) else "cpu"
    if want_gpu and not torch.cuda.is_available():
        print("Note: CUDA not available, using CPU.", file=sys.stderr)
    bot = VoiceBot(checkpoint_path=args.checkpoint, config_path=args.config, device=device)
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
