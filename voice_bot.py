"""
Voice Bot: single integration point to classify any MP3 (or other audio) as human or AI-generated.

Use this module from your app to distinguish human voice from AI/synthetic voice in audio files.

Example:
    from voice_bot import VoiceBot

    bot = VoiceBot()
    result = bot.classify("call_recording.mp3")
    # result["label"] -> "human" | "ai"
    # result["prob_human"], result["prob_ai"]
"""

import json
import os
from pathlib import Path

import torch

from model import Config, Wav2Vec2VoiceClassifier
from example import ExampleFeatureExtractor, ExampleEncoder
from audio_utils import load_and_extract


# Default paths relative to this package
DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
DEFAULT_CHECKPOINT_PATH = os.path.join(os.path.dirname(__file__), "checkpoints", "voice_classifier.pt")


class VoiceBot:
    """
    Bot that classifies audio as human or AI-generated voice.

    Load the model once, then call classify() on any MP3 or other audio file.
    Supports any common format: MP3, WAV, FLAC, OGG, M4A, etc.
    """

    def __init__(
        self,
        checkpoint_path: str | None = None,
        config_path: str | None = None,
        device: str | None = None,
    ):
        """
        Args:
            checkpoint_path: Path to trained checkpoint (.pt). If None, uses default
                             and runs with random weights if file missing.
            config_path: Path to config.json. If None, uses config.json in project root.
            device: "cuda:0", "cpu", or None (auto: cuda if available).
        """
        self.device = device or ("cuda:0" if torch.cuda.is_available() else "cpu")
        config_path = config_path or DEFAULT_CONFIG_PATH
        checkpoint_path = checkpoint_path or DEFAULT_CHECKPOINT_PATH

        with open(config_path, encoding="utf-8") as f:
            self._config = Config(**json.load(f))

        self._feature_extractor = ExampleFeatureExtractor(self._config.extracted_feature_size)
        self._encoder = ExampleEncoder(
            self._config.extracted_feature_size,
            self._config.encoder_hidden_size,
        )
        self._model = Wav2Vec2VoiceClassifier(
            self._config,
            self._feature_extractor,
            self._encoder,
        ).to(self.device)

        if os.path.isfile(checkpoint_path):
            ckpt = torch.load(checkpoint_path, map_location=self.device)
            state = ckpt.get("model_state_dict", ckpt)
            self._model.load_state_dict(state, strict=True)
            self._checkpoint_loaded = True
        else:
            self._checkpoint_loaded = False

        self._model.eval()

    def classify(
        self,
        audio_path: str,
        *,
        return_probs: bool = True,
    ) -> dict:
        """
        Classify one audio file as human or AI-generated voice.

        Works with any common format: MP3, WAV, FLAC, OGG, M4A, etc.
        Any form of MP3 (different encodings, bitrates, mono/stereo) is supported;
        if torchaudio fails, ffmpeg is used when available.

        Args:
            audio_path: Path to the audio file (e.g. .mp3, .wav).
            return_probs: If True, include prob_human and prob_ai in the result.

        Returns:
            dict with:
                - "label": "human" | "ai"
                - "prob_human": float in [0, 1] (if return_probs)
                - "prob_ai": float in [0, 1] (if return_probs)
                - "checkpoint_loaded": bool
        """
        audio_path = os.path.abspath(audio_path)
        if not os.path.isfile(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        features, lengths = load_and_extract(audio_path)
        features = features.to(self.device)
        lengths = lengths.to(self.device)

        with torch.no_grad():
            probs = self._model.predict_proba(features, lengths)
            pred = self._model.predict(features, lengths)

        prob_human = probs[0, 0].item()
        prob_ai = probs[0, 1].item()
        is_human = pred[0].item() == 0
        label = "human" if is_human else "ai"

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

    Use VoiceBot() and reuse it when classifying many files.

    Args:
        audio_path: Path to MP3 or other audio file.
        checkpoint_path: Optional path to checkpoint.
        config_path: Optional path to config.json.

    Returns:
        dict with "label" ("human" | "ai"), "prob_human", "prob_ai", "checkpoint_loaded".
    """
    bot = VoiceBot(checkpoint_path=checkpoint_path, config_path=config_path)
    return bot.classify(audio_path)


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Classify any MP3 (or WAV/FLAC/OGG/M4A) as human or AI-generated voice."
    )
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--checkpoint", default=None, help="Path to checkpoint")
    parser.add_argument("--config", default=None, help="Path to config.json")
    args = parser.parse_args()

    bot = VoiceBot(checkpoint_path=args.checkpoint, config_path=args.config)
    result = bot.classify(args.audio)
    label = "Human" if result["label"] == "human" else "AI-generated"
    print(f"File: {args.audio}")
    print(f"Prediction: {label}  (P(human)={result['prob_human']:.2%}, P(AI)={result['prob_ai']:.2%})")
