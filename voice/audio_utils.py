"""
Audio preprocessing utilities for voice classification.

Supports any common audio format (MP3, WAV, FLAC, OGG, M4A, etc.) and
extracts 80-dimensional mel spectrogram features for the Wav2Vec2 input.
"""

import os
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

import torch
import torchaudio
import torchaudio.transforms as T


# Default audio params matching common Wav2Vec2 setups
SAMPLE_RATE = 16000
N_FFT = 400
HOP_LENGTH = 160
N_MELS = 80
F_MIN = 0
F_MAX = 8000

# Minimum duration (seconds) to produce valid features; shorter clips are padded
MIN_DURATION_SEC = 0.5


def _read_wav_with_wave(wav_path: str) -> tuple[torch.Tensor, int]:
    """Read a WAV file (e.g. from ffmpeg) with stdlib wave. Returns (waveform, sr). No torchaudio."""
    with wave.open(wav_path, "rb") as wav:
        nch = wav.getnchannels()
        sampwidth = wav.getsampwidth()
        sr = wav.getframerate()
        nframes = wav.getnframes()
        raw = wav.readframes(nframes)
    if sampwidth == 2:  # 16-bit
        fmt = "<" + "h" * (len(raw) // 2)
        samples = struct.unpack(fmt, raw)
    else:
        raise ValueError(f"Unsupported WAV sample width: {sampwidth}")
    arr = torch.tensor(samples, dtype=torch.float32) / 32768.0
    if nch == 2:
        arr = arr.view(-1, 2).mean(dim=1)
    arr = arr.unsqueeze(0)
    return arr, sr


def _get_ffmpeg_exe() -> str:
    """Return path to ffmpeg: use imageio-ffmpeg's bundled binary if available, else 'ffmpeg' (PATH)."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def _load_with_torchaudio(path: str) -> tuple[torch.Tensor, int]:
    """Load with torchaudio using a legacy backend only (avoids TorchCodec and its DLL)."""
    last_error = None
    for backend in ("soundfile", "sox", "ffmpeg"):
        try:
            waveform, sr = torchaudio.load(path, backend=backend)
            return waveform, sr
        except Exception as e:
            last_error = e
            continue
    raise RuntimeError(
        "Could not load audio with any torchaudio backend (soundfile, sox, ffmpeg). "
        "Install one of them, e.g.: pip install soundfile"
    ) from (last_error or None)


def _load_with_ffmpeg(path: str, target_sr: int) -> torch.Tensor:
    """Fallback: decode with ffmpeg to 16 kHz mono WAV, then load. Works for any MP3."""
    ffmpeg_exe = _get_ffmpeg_exe()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name
    try:
        subprocess.run(
            [
                ffmpeg_exe, "-y", "-i", path,
                "-acodec", "pcm_s16le", "-ac", "1", "-ar", str(target_sr),
                "-loglevel", "error", wav_path,
            ],
            check=True,
            capture_output=True,
        )
        waveform, sr = _read_wav_with_wave(wav_path)
        return waveform, sr
    finally:
        if os.path.isfile(wav_path):
            try:
                os.remove(wav_path)
            except OSError:
                pass


def load_audio(path: str, target_sr: int = SAMPLE_RATE) -> tuple[torch.Tensor, int]:
    """
    Load any audio file (MP3, WAV, FLAC, OGG, M4A, etc.) and return mono at target_sr.

    Tries torchaudio first; for MP3 on systems where torchaudio fails, falls back
    to ffmpeg if available so that any form of MP3 is supported.

    Args:
        path: Path to audio file.
        target_sr: Target sample rate (default 16000).

    Returns:
        waveform: (1, num_samples) mono, float32 in [-1, 1].
        sample_rate: Equal to target_sr.
    """
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Audio file not found: {path}")

    try:
        waveform, sr = _load_with_torchaudio(path)
    except Exception:
        if Path(path).suffix.lower() in (".mp3", ".m4a", ".aac", ".ogg"):
            try:
                waveform, sr = _load_with_ffmpeg(path, target_sr)
            except (subprocess.CalledProcessError, FileNotFoundError, RuntimeError, OSError) as e:
                raise RuntimeError(
                    "Could not load audio with torchaudio. For MP3/M4A, install imageio-ffmpeg "
                    "(pip install imageio-ffmpeg) to use a bundled ffmpeg, or install ffmpeg and add it to PATH."
                ) from e
        else:
            raise

    if waveform.numel() == 0:
        raise ValueError(f"Audio file is empty: {path}")

    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sr != target_sr:
        resampler = T.Resample(sr, target_sr)
        waveform = resampler(waveform)
        sr = target_sr

    return waveform, sr


def extract_mel_features(
    waveform: torch.Tensor,
    sample_rate: int = SAMPLE_RATE,
    n_mels: int = N_MELS,
    n_fft: int = N_FFT,
    hop_length: int = HOP_LENGTH,
) -> torch.Tensor:
    """
    Extract mel spectrogram features (B, T, D) for Wav2Vec2 input.

    Args:
        waveform: (1, num_samples) or (num_samples,)
        sample_rate: sample rate
        n_mels: number of mel bins (80 for Wav2Vec2)
        n_fft: FFT size
        hop_length: hop length

    Returns:
        (1, T, n_mels) mel features
    """
    if waveform.dim() == 1:
        waveform = waveform.unsqueeze(0)

    mel_spec = T.MelSpectrogram(
        sample_rate=sample_rate,
        n_fft=n_fft,
        hop_length=hop_length,
        n_mels=n_mels,
        f_min=F_MIN,
        f_max=F_MAX,
    )(waveform)

    log_mel = torch.log(mel_spec.clamp(min=1e-5))
    log_mel = log_mel.transpose(1, 2)

    return log_mel


def load_and_extract(
    path: str,
    min_frames: int | None = None,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Load any audio file (MP3, WAV, etc.) and extract mel features.

    Args:
        path: Path to audio file.
        min_frames: If set, ensure at least this many time frames (pads with zeros).
                    Default: MIN_DURATION_SEC * SAMPLE_RATE / HOP_LENGTH.

    Returns:
        features: (1, T, 80) mel spectrogram
        lengths: (1,) valid length (actual frames, excluding padding)
    """
    waveform, sr = load_audio(path)
    features = extract_mel_features(waveform, sr)
    T_frames = features.size(1)
    if min_frames is None:
        min_frames = max(1, int(MIN_DURATION_SEC * sr / HOP_LENGTH))
    if T_frames < min_frames:
        pad = torch.zeros(1, min_frames - T_frames, features.size(2), dtype=features.dtype)
        features = torch.cat([features, pad], dim=1)
    lengths = torch.tensor([T_frames], dtype=torch.long)
    return features, lengths


def collate_batch(batch: list[tuple[torch.Tensor, torch.Tensor, int]]) -> tuple:
    """
    Collate a batch of (features, lengths, label) for DataLoader.

    Pads features to max length in batch.
    """
    features_list = [b[0] for b in batch]
    lengths = torch.tensor([b[1].item() for b in batch])
    labels = torch.tensor([b[2] for b in batch], dtype=torch.long)

    max_len = max(f.size(1) for f in features_list)
    feat_dim = features_list[0].size(2)
    device = features_list[0].device

    padded = torch.zeros(len(batch), max_len, feat_dim, device=device)
    for i, f in enumerate(features_list):
        padded[i, : f.size(1), :] = f.squeeze(0)

    return padded, lengths, labels
