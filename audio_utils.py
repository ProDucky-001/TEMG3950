"""
Audio preprocessing utilities for voice classification.

Extracts 80-dimensional mel spectrogram features compatible with
the Wav2Vec2 feature extractor input.
"""

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


def load_audio(path: str, target_sr: int = SAMPLE_RATE) -> tuple[torch.Tensor, int]:
    """
    Load audio file and resample if needed.

    Args:
        path: Path to audio file (wav, mp3, flac, etc.)
        target_sr: Target sample rate (default 16000)

    Returns:
        waveform: (1, num_samples) mono
        sample_rate: actual sample rate
    """
    waveform, sr = torchaudio.load(path)
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

    # Log mel: (1, n_mels, T) -> (1, T, n_mels)
    log_mel = torch.log(mel_spec.clamp(min=1e-5))
    log_mel = log_mel.transpose(1, 2)

    return log_mel


def load_and_extract(path: str) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Load audio file and extract mel features.

    Returns:
        features: (1, T, 80) mel spectrogram
        lengths: (1,) valid length
    """
    waveform, sr = load_audio(path)
    features = extract_mel_features(waveform, sr)
    lengths = torch.tensor([features.size(1)], dtype=torch.long)
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
