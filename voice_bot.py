"""
Voice Bot: single integration point to classify any audio as human or AI-generated.

Uses the ai-audio-detector package (Benford's Law + spectral features, ensemble ML).
See: https://pypi.org/project/ai-audio-detector/

Example:
    from voice_bot import VoiceBot

    bot = VoiceBot()
    result = bot.classify("call_recording.mp3")
    # result["label"] -> "human" | "ai"
    # result["prob_human"], result["prob_ai"]
"""

import os
from pathlib import Path

# Default base dir: project root (where voice_bot.py lives)
_BASE_DIR = Path(__file__).resolve().parent


def _get_detector():
    from ai_audio_detector import AIAudioDetector
    return AIAudioDetector(base_dir=_BASE_DIR)


def _models_exist(base_dir: Path) -> bool:
    """Check if ai-audio-detector has trained models."""
    models_file = base_dir / "models" / "ai_audio_detector.joblib"
    return models_file.is_file()


class VoiceBot:
    """
    Bot that classifies audio as human or AI-generated voice using ai-audio-detector.

    Supports WAV, MP3, FLAC, OGG, M4A, AAC. Train once with human and AI audio dirs,
    then call classify() on any file.
    """

    def __init__(self, checkpoint_path: str | None = None, config_path: str | None = None, device: str | None = None):
        """
        Args:
            checkpoint_path: Unused (kept for API compatibility). Models live in models/ai_audio_detector.joblib.
            config_path: Unused (kept for API compatibility).
            device: Unused (kept for API compatibility). ai-audio-detector runs on CPU.
        """
        self._base_dir = _BASE_DIR
        self._checkpoint_loaded = _models_exist(self._base_dir)
        self._detector = None  # Lazy init so import errors show at first classify()

    def _get_detector(self):
        if self._detector is None:
            self._detector = _get_detector()
        return self._detector

    def classify(
        self,
        audio_path: str,
        *,
        return_probs: bool = True,
    ) -> dict:
        """
        Classify one audio file as human or AI-generated voice.

        Args:
            audio_path: Path to the audio file (WAV, MP3, FLAC, OGG, M4A, AAC).
            return_probs: If True, include prob_human and prob_ai in the result.

        Returns:
            dict with:
                - "label": "human" | "ai"
                - "prob_human": float in [0, 1] (if return_probs)
                - "prob_ai": float in [0, 1] (if return_probs)
                - "checkpoint_loaded": bool (True if trained models exist)
        """
        audio_path = os.path.abspath(audio_path)
        if not os.path.isfile(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        detector = self._get_detector()
        result = detector.predict_file(audio_path)
        if result is None or not isinstance(result, dict):
            raise ValueError(
                "Detector returned no result. Train models first: "
                "ai-audio-detector --train --human-dir path/to/human_audio --ai-dir path/to/ai_audio"
            )
        if "is_ai" not in result:
            raise ValueError("Detector result missing 'is_ai'. Train models first.")

        is_ai = result["is_ai"]
        confidence = float(result.get("confidence", 0.0))
        # confidence is confidence in the predicted class (AI or human)
        prob_ai = min(1.0, max(0.0, confidence if is_ai else (1.0 - confidence)))
        prob_human = 1.0 - prob_ai

        label = "ai" if is_ai else "human"

        out = {
            "label": label,
            "checkpoint_loaded": self._checkpoint_loaded,
        }
        if return_probs:
            out["prob_human"] = prob_human
            out["prob_ai"] = prob_ai
        return out

    def is_human(self, audio_path: str) -> bool:
        """Return True if the audio is classified as human, False if AI-generated."""
        return self.classify(audio_path, return_probs=False)["label"] == "human"

    def is_ai(self, audio_path: str) -> bool:
        """Return True if the audio is classified as AI-generated, False if human."""
        return self.classify(audio_path, return_probs=False)["label"] == "ai"


def classify_voice(
    audio_path: str,
    checkpoint_path: str | None = None,
    config_path: str | None = None,
) -> dict:
    """
    One-off classification without keeping a bot instance.

    Returns:
        dict with "label" ("human" | "ai"), "prob_human", "prob_ai", "checkpoint_loaded".
    """
    bot = VoiceBot(checkpoint_path=checkpoint_path, config_path=config_path)
    return bot.classify(audio_path)


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Classify audio as human or AI-generated (ai-audio-detector)."
    )
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--checkpoint", default=None, help="Ignored (API compat)")
    parser.add_argument("--config", default=None, help="Ignored (API compat)")
    args = parser.parse_args()

    bot = VoiceBot(checkpoint_path=args.checkpoint, config_path=args.config)
    result = bot.classify(args.audio)
    label = "Human" if result["label"] == "human" else "AI-generated"
    print(f"File: {args.audio}")
    print(f"Prediction: {label}  (P(human)={result['prob_human']:.2%}, P(AI)={result['prob_ai']:.2%})")
