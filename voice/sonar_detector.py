"""
SONAR-based voice classifier (Wav2Vec2 + classification head).
Optional checkpoint from SONAR fine-tuning on Wavefake.
"""
from __future__ import annotations

import os
from pathlib import Path

from .audio_utils import load_audio
from .sonar import Wav2Vec2

DEFAULT_MODEL_NAME = "facebook/wav2vec2-base"
SONAR_TRAINED_MODEL_NAME = "facebook/wav2vec2-large-960h"
SONAR_SAMPLE_RATE = 16000


def _load_audio_numpy(path: str):
    waveform, sr = load_audio(path, target_sr=SONAR_SAMPLE_RATE)
    return waveform.squeeze(0).numpy(), sr


def _get_detector(model_name: str, checkpoint_path: str | None, device: str):
    import torch
    from transformers import AutoFeatureExtractor

    feature_extractor = AutoFeatureExtractor.from_pretrained(model_name)
    model = Wav2Vec2(model_name, pooling_mode="mean", num_labels=2)
    checkpoint_loaded = False
    if checkpoint_path and os.path.isfile(checkpoint_path):
        state = torch.load(checkpoint_path, map_location="cpu")
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        if isinstance(state, dict):
            state = {k.replace("module.", ""): v for k, v in state.items()}
            missing, unexpected = model.load_state_dict(state, strict=False)
            if not missing or set(missing) <= {"config.num_labels"}:
                checkpoint_loaded = True
    model = model.to(device)
    model.eval()
    return model, feature_extractor, checkpoint_loaded


class SonarVoiceDetector:
    def __init__(
        self,
        model_name: str | None = None,
        checkpoint_path: str | None = None,
        device: str | None = None,
    ):
        import torch
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self._device = device
        if model_name is None:
            model_name = SONAR_TRAINED_MODEL_NAME if (checkpoint_path and os.path.isfile(checkpoint_path)) else DEFAULT_MODEL_NAME
        self._model_name = model_name
        self._model, self._feature_extractor, self._checkpoint_loaded = _get_detector(
            model_name, checkpoint_path, self._device
        )

    def predict_file(self, audio_path: str) -> dict | None:
        import torch
        import numpy as np

        try:
            waveform_np, sr = _load_audio_numpy(audio_path)
        except Exception as e:
            return {"error": str(e), "label": "error", "checkpoint_loaded": self._checkpoint_loaded}

        inputs = self._feature_extractor(
            waveform_np,
            sampling_rate=sr,
            return_attention_mask=True,
            padding=True,
            return_tensors="pt",
        ).to(self._device)

        with torch.no_grad():
            out = self._model(**inputs)

        logits = out.logits
        probs = torch.softmax(logits, dim=-1).cpu().numpy().squeeze()
        if probs.ndim == 0:
            probs = probs[np.newaxis]
        prob_human = float(probs[0])
        prob_ai = float(probs[1]) if len(probs) > 1 else 1.0 - prob_human
        label = "human" if prob_human >= prob_ai else "ai"

        return {
            "label": label,
            "prob_human": prob_human,
            "prob_ai": prob_ai,
            "checkpoint_loaded": self._checkpoint_loaded,
        }


def predict_sonar(
    audio_path: str,
    model_name: str = DEFAULT_MODEL_NAME,
    checkpoint_path: str | None = None,
) -> dict:
    detector = SonarVoiceDetector(model_name=model_name, checkpoint_path=checkpoint_path)
    result = detector.predict_file(audio_path)
    if result is None:
        return {"label": "error", "prob_human": 0.5, "prob_ai": 0.5, "checkpoint_loaded": False, "error": "No result"}
    return result
