"""
Output-only JSON for voice classification. Used by the Electron app.

Usage: python -m voice.classify_audio_json <path_to_audio>
Prints one JSON object to stdout: {"label":"human"|"ai","prob_human":float,"prob_ai":float,"checkpoint_loaded":bool}

Uses the same Gustking Wav2Vec2 model as run_classifier (voice_bot + huggingface_detector).
"""
import json
import sys

from .voice_bot import VoiceBot


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio path"}), flush=True)
        sys.exit(1)
    path = sys.argv[1].strip().strip('"').strip("'")
    try:
        import torch
        device = "cuda" if torch.cuda.is_available() else None
        bot = VoiceBot(device=device)
        result = bot.classify(path)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e), "label": "error"}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
