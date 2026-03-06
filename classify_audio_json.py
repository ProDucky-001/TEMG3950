"""
Output-only JSON for voice classification. Used by the Electron app.

Usage: python classify_audio_json.py <path_to_audio>
Prints one JSON object to stdout: {"label":"human"|"ai","prob_human":float,"prob_ai":float,"checkpoint_loaded":bool}
"""

import json
import sys

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio path"}), flush=True)
        sys.exit(1)
    path = sys.argv[1].strip().strip('"').strip("'")
    try:
        from voice_bot import VoiceBot
        bot = VoiceBot()
        result = bot.classify(path)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e), "label": "error"}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
