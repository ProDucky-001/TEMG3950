"""
Voice Bot: single integration point to classify any audio as human or AI-generated.

Uses the Gustking Wav2Vec2 deepfake model from Hugging Face by default:
  Gustking/wav2vec2-large-xlsr-deepfake-audio-classification
(~93% accuracy on ASVspoof2019, real vs. fake; no local checkpoint needed.)

Example:
    from voice.voice_bot import VoiceBot

    bot = VoiceBot()
    result = bot.classify("call_recording.mp3")
    # result["label"] -> "human" | "ai"
    # result["prob_human"], result["prob_ai"]
"""

import os
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent


def _create_detector(device: str | None, model_id: str | None = None):
    from voice.huggingface_detector import HuggingFaceVoiceDetector
    return HuggingFaceVoiceDetector(device=device, model_id=model_id)


class VoiceBot:
    """
    Bot that classifies audio as human or AI-generated using the Gustking
    Wav2Vec2 deepfake model (Hugging Face). Supports WAV, MP3, FLAC, OGG, M4A, AAC.
    """

    def __init__(
        self,
        checkpoint_path: str | None = None,
        config_path: str | None = None,
        device: str | None = None,
        model_id: str | None = None,
    ):
        """
        Args:
            checkpoint_path: Unused (kept for API compatibility; model is from Hugging Face).
            config_path: Unused (kept for API compatibility).
            device: Device for inference ('cuda' or 'cpu').
            model_id: Hugging Face model id or path to finetuned model (e.g. ./finetuned_voice_model).
        """
        self._base_dir = _BASE_DIR
        self._checkpoint_loaded = True  # pre-trained HF model, no local ckpt
        self._detector = None
        self._device = device
        self._model_id = model_id

    def _get_detector(self):
        if self._detector is None:
            self._detector = _create_detector(self._device, model_id=self._model_id)
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
                - "checkpoint_loaded": bool (True; model is pre-trained from Hugging Face)
        """
        audio_path = os.path.abspath(audio_path)
        if not os.path.isfile(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        detector = self._get_detector()
        result = detector.predict_file(audio_path)
        if result is None or "label" not in result:
            raise ValueError(
                "Classifier returned no result. Check audio format and dependencies "
                "(transformers, torch, audio_utils)."
            )
        if result.get("label") == "error":
            raise ValueError(result.get("error", "Classification failed"))

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
    parser.add_argument("--checkpoint", default=None, help="Ignored (API compat)")
    parser.add_argument("--config", default=None, help="Ignored (API compat)")
    args = parser.parse_args()

    bot = VoiceBot(checkpoint_path=args.checkpoint, config_path=args.config)
    result = bot.classify(args.audio)
    label = "Human" if result["label"] == "human" else "AI-generated"
    print(f"File: {args.audio}")
    print(f"Prediction: {label}  (P(human)={result['prob_human']:.2%}, P(AI)={result['prob_ai']:.2%})")
