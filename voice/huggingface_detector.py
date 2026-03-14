"""
Voice classifier using the Gustking Wav2Vec2 deepfake model from Hugging Face.

Model: Gustking/wav2vec2-large-xlsr-deepfake-audio-classification
- Fine-tuned for binary classification (real vs. fake/deepfake audio)
- Evaluated on ASVspoof2019: ~93% accuracy, ~94% F1, ~4% EER
- Uses 16 kHz sampling rate

No local checkpoint needed; the model is loaded from Hugging Face Hub.
"""

from __future__ import annotations

import numpy as np

# Model expects 16 kHz (Wav2Vec2 standard)
SAMPLE_RATE = 16000

# Pipeline returns labels 'real' and 'fake'; we map to human/ai (swapped: real→ai, fake→human)
LABEL_REAL = "real"
LABEL_FAKE = "fake"
SWAP_LABELS = True  # If True, report model "real" as ai and "fake" as human


def _load_audio_numpy(path: str) -> tuple[np.ndarray, int]:
    """Load audio as mono 16 kHz numpy using soundfile + scipy. Bypasses torchaudio (avoids TorchCodec/backend issues on torchaudio 2.10+)."""
    import os
    import tempfile
    import subprocess
    import wave
    from pathlib import Path
    from scipy.signal import resample as scipy_resample

    path = os.path.abspath(path)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Audio file not found: {path}")

    def _to_mono_16k(samples: np.ndarray, sr: int) -> tuple[np.ndarray, int]:
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        if samples.dtype != np.float32:
            samples = samples.astype(np.float32)
        if sr != SAMPLE_RATE:
            n = int(round(len(samples) * SAMPLE_RATE / sr))
            samples = scipy_resample(samples, n).astype(np.float32)
            sr = SAMPLE_RATE
        return samples, sr

    # Prefer soundfile (no torchaudio)
    try:
        import soundfile as sf
        data, sr = sf.read(path, dtype="float32")
        return _to_mono_16k(data, sr)
    except Exception:
        pass

    # Fallback: ffmpeg to WAV, then stdlib wave (for MP3/M4A/etc.)
    ext = Path(path).suffix.lower()
    if ext in (".mp3", ".m4a", ".aac", ".ogg"):
        try:
            ffmpeg_exe = "ffmpeg"
            try:
                import imageio_ffmpeg
                ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            except Exception:
                pass
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                wav_path = f.name
            try:
                subprocess.run(
                    [ffmpeg_exe, "-y", "-i", path, "-acodec", "pcm_s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-loglevel", "error", wav_path],
                    check=True,
                    capture_output=True,
                )
                with wave.open(wav_path, "rb") as wav:
                    nch = wav.getnchannels()
                    sr = wav.getframerate()
                    nframes = wav.getnframes()
                    raw = wav.readframes(nframes)
                if wav.getsampwidth() != 2:
                    raise ValueError("Unsupported WAV sample width")
                samples = np.frombuffer(raw, dtype="<i2")
                if nch == 2:
                    samples = samples.reshape(-1, 2).mean(axis=1)
                samples = samples.astype(np.float32) / 32768.0
                return _to_mono_16k(samples, sr)
            finally:
                if os.path.isfile(wav_path):
                    try:
                        os.remove(wav_path)
                    except OSError:
                        pass
        except Exception as e:
            raise RuntimeError(
                "Could not load audio with soundfile or ffmpeg. For MP3/M4A, install imageio-ffmpeg or add ffmpeg to PATH."
            ) from e

    raise RuntimeError("Could not load audio. Try WAV/FLAC or install soundfile; for MP3 install imageio-ffmpeg.")


DEFAULT_MODEL_ID = "Gustking/wav2vec2-large-xlsr-deepfake-audio-classification"


def _get_classifier(device: int | str | None = -1, model_id: str | None = None):
    """Build the Hugging Face audio-classification pipeline. device: -1 for CPU, 0 for GPU."""
    from transformers import pipeline
    model = model_id or DEFAULT_MODEL_ID
    return pipeline(
        "audio-classification",
        model=model,
        device=device,
    )


class HuggingFaceVoiceDetector:
    """
    Voice classifier using Gustking/wav2vec2-large-xlsr-deepfake-audio-classification.
    Returns 'human' for real and 'ai' for fake/deepfake. No local checkpoint required.
    """

    def __init__(self, device: str | None = None, model_id: str | None = None):
        import torch
        if device is None:
            device = 0 if torch.cuda.is_available() else -1
        elif device == "cpu":
            device = -1
        else:
            device = 0
        self._device = device
        self._classifier = _get_classifier(device, model_id=model_id)

    def predict_file(self, audio_path: str) -> dict | None:
        """
        Classify one audio file as human (real) or AI-generated (fake).
        Returns dict with label ("human"|"ai"), prob_human, prob_ai, checkpoint_loaded=True.
        """
        try:
            waveform_np, sr = _load_audio_numpy(audio_path)
        except Exception as e:
            return {
                "error": str(e),
                "label": "error",
                "prob_human": 0.5,
                "prob_ai": 0.5,
                "checkpoint_loaded": True,
            }

        # Pipeline accepts path or {"array": np.ndarray, "sampling_rate": int}
        inputs = {"array": waveform_np, "sampling_rate": sr}
        result = self._classifier(inputs)

        # result is list of {"label": "real"|"fake", "score": float}, sorted by score
        prob_human = 0.5
        prob_ai = 0.5
        for item in result:
            label = (item.get("label") or "").strip().lower()
            score = float(item.get("score", 0.0))
            if label == LABEL_REAL:
                prob_human = score
            elif label == LABEL_FAKE:
                prob_ai = score

        # If pipeline uses different label names, infer from order (first = top prediction)
        if prob_human == 0.5 and prob_ai == 0.5 and result:
            top = result[0]
            score = float(top.get("score", 0.5))
            label = (top.get("label") or "").strip().lower()
            if "real" in label or "human" in label or "bonafide" in label:
                prob_human, prob_ai = score, 1.0 - score
            else:
                prob_ai, prob_human = score, 1.0 - score

        label = "human" if prob_human >= prob_ai else "ai"
        if SWAP_LABELS:
            label = "ai" if label == "human" else "human"
            prob_human, prob_ai = prob_ai, prob_human
        return {
            "label": label,
            "prob_human": prob_human,
            "prob_ai": prob_ai,
            "checkpoint_loaded": True,  # pre-trained model, no local ckpt
        }


def predict_huggingface(audio_path: str, device: str | None = None) -> dict:
    """
    One-off classification using the Gustking model.
    Returns dict with label, prob_human, prob_ai, checkpoint_loaded=True.
    """
    detector = HuggingFaceVoiceDetector(device=device)
    result = detector.predict_file(audio_path)
    if result is None:
        return {
            "label": "error",
            "prob_human": 0.5,
            "prob_ai": 0.5,
            "checkpoint_loaded": True,
            "error": "No result",
        }
    return result
