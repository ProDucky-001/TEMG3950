"""
Voice Bot: single integration point to classify any audio as human or AI-generated.

Uses the SONAR model (Wav2Vec2-based AI-audio detection).
Paper: https://arxiv.org/html/2410.04324v2
Code: https://github.com/Jessegator/SONAR

Example:
    from voice_bot import VoiceBot

    bot = VoiceBot()
    result = bot.classify("call_recording.mp3")
    # result["label"] -> "human" | "ai"
    # result["prob_human"], result["prob_ai"]
"""

import os
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent

# Optional checkpoint from SONAR fine-tuning (main_fm.py on Wavefake)
# If present, improves accuracy; otherwise uses base Wav2Vec2 + random head (uncalibrated).
DEFAULT_CHECKPOINT_DIR = _BASE_DIR / "ckpt"
DEFAULT_CHECKPOINT_GLOB = "wave2vec2_epoch_*.pth"


def _find_checkpoint() -> str | None:
    """Return path to a SONAR checkpoint if any exist."""
    if not DEFAULT_CHECKPOINT_DIR.is_dir():
        return None
    for p in sorted(DEFAULT_CHECKPOINT_DIR.glob(DEFAULT_CHECKPOINT_GLOB), reverse=True):
        return str(p)
    return None


def _create_detector(checkpoint_path: str | None, device: str | None):
    from sonar_detector import SonarVoiceDetector
    return SonarVoiceDetector(checkpoint_path=checkpoint_path, device=device)


def _checkpoint_available() -> bool:
    """True if a SONAR fine-tuned checkpoint exists."""
    return _find_checkpoint() is not None


class VoiceBot:
    """
    Bot that classifies audio as human or AI-generated using SONAR (Wav2Vec2-based).

    Supports WAV, MP3, FLAC, OGG, M4A, AAC. For best accuracy, fine-tune SONAR
    on Wavefake (see SONAR repo) and place the .pth in ckpt/.
    """

    def __init__(
        self,
        checkpoint_path: str | None = None,
        config_path: str | None = None,
        device: str | None = None,
    ):
        """
        Args:
            checkpoint_path: Optional path to SONAR checkpoint (.pth from main_fm.py).
            config_path: Unused (kept for API compatibility).
            device: Device for inference ('cuda' or 'cpu').
        """
        self._base_dir = _BASE_DIR
        self._checkpoint_path = checkpoint_path or _find_checkpoint()
        self._checkpoint_loaded = (
            self._checkpoint_path is not None and os.path.isfile(self._checkpoint_path)
        )
        self._detector = None
        self._device = device

    def _get_detector(self):
        if self._detector is None:
            self._detector = _create_detector(self._checkpoint_path, self._device)
        return self._detector

    def classify(
        self,
        audio_path: str,
        *,
        return_probs: bool = True,
    ) -> dict:
        """
        Classify one audio file as human or AI-generated.

        Args:
            audio_path: Path to the audio file (WAV, MP3, FLAC, OGG, M4A, AAC).
            return_probs: If True, include prob_human and prob_ai in the result.

        Returns:
            dict with:
                - "label": "human" | "ai"
                - "prob_human": float in [0, 1] (if return_probs)
                - "prob_ai": float in [0, 1] (if return_probs)
                - "checkpoint_loaded": bool (True if SONAR checkpoint was loaded)
        """
        audio_path = os.path.abspath(audio_path)
        if not os.path.isfile(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        detector = self._get_detector()
        result = detector.predict_file(audio_path)
        if result is None or "label" not in result:
            raise ValueError(
                "SONAR detector returned no result. Check audio format and dependencies "
                "(transformers, torch, audio_utils). For best accuracy, add a fine-tuned "
                "checkpoint to ckpt/ (train with SONAR repo on Wavefake)."
            )
        if result.get("label") == "error":
            raise ValueError(result.get("error", "SONAR classification failed"))

        out = {
            "label": result["label"],
            "checkpoint_loaded": result.get("checkpoint_loaded", self._checkpoint_loaded),
        }
        if return_probs:
            out["prob_human"] = result.get("prob_human", 0.5)
            out["prob_ai"] = result.get("prob_ai", 0.5)
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
        description="Classify audio as human or AI-generated (SONAR model)."
    )
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--checkpoint", default=None, help="Path to SONAR checkpoint (.pth)")
    parser.add_argument("--config", default=None, help="Ignored (API compat)")
    args = parser.parse_args()

    bot = VoiceBot(checkpoint_path=args.checkpoint, config_path=args.config)
    result = bot.classify(args.audio)
    label = "Human" if result["label"] == "human" else "AI-generated"
    print(f"File: {args.audio}")
    print(f"Prediction: {label}  (P(human)={result['prob_human']:.2%}, P(AI)={result['prob_ai']:.2%})")
    if not result.get("checkpoint_loaded"):
        print("(Uncalibrated: no SONAR checkpoint loaded. Add a .pth to ckpt/ for better accuracy.)")
