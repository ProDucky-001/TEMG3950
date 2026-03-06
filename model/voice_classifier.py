"""
AI vs Human Voice Classifier for Scam Detection.

Uses Wav2Vec2 encoder representations to classify audio as either
human-generated or AI-generated (synthetic/TTS) voice.
"""

import torch
from torch import nn

from model import Config, Wav2Vec2Framework


def mean_pool_masked(hidden_states: torch.Tensor, lengths: torch.Tensor) -> torch.Tensor:
    """
    Mean pool over time dimension with masking for variable-length sequences.

    Args:
        hidden_states: (B, T, D) encoder outputs
        lengths: (B,) valid length per sequence

    Returns:
        (B, D) pooled representation
    """
    batch_size, max_len, hidden_size = hidden_states.size()
    device = hidden_states.device

    # Create mask: (B, T) where 1 = valid, 0 = padding
    range_tensor = torch.arange(max_len, device=device).unsqueeze(0).expand(batch_size, -1)
    mask = (range_tensor < lengths.unsqueeze(1)).float().unsqueeze(-1)

    # Sum and divide by lengths (avoid div by zero)
    masked_sum = (hidden_states * mask).sum(dim=1)
    lengths_expanded = lengths.unsqueeze(1).float().clamp(min=1)
    pooled = masked_sum / lengths_expanded

    return pooled


class VoiceClassifierHead(nn.Module):
    """Classification head for human vs AI voice detection."""

    def __init__(self, input_size: int, hidden_size: int = 256, num_classes: int = 2, dropout: float = 0.2):
        super().__init__()
        self.classifier = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size // 2, num_classes),
        )

    def forward(self, pooled_features: torch.Tensor) -> torch.Tensor:
        return self.classifier(pooled_features)


class Wav2Vec2VoiceClassifier(nn.Module):
    """
    Wav2Vec2-based model for AI vs Human voice classification.

    Combines the Wav2Vec2 self-supervised encoder with a classification head
    to distinguish AI-generated (synthetic) voice from real human voice.
    """

    def __init__(
        self,
        config: Config,
        feature_extractor: nn.Module,
        encoder: nn.Module,
        num_classes: int = 2,
        classifier_hidden_size: int = 256,
        classifier_dropout: float = 0.2,
    ):
        super().__init__()
        self.wav2vec = Wav2Vec2Framework(config, feature_extractor, encoder)
        self.classifier_head = VoiceClassifierHead(
            input_size=config.code_vector_size,
            hidden_size=classifier_hidden_size,
            num_classes=num_classes,
            dropout=classifier_dropout,
        )

    def forward(
        self,
        input_values: torch.Tensor,
        lengths: torch.Tensor,
        return_encoder_output: bool = False,
    ):
        """
        Forward pass for voice classification.

        Args:
            input_values: (B, T, D) mel spectrogram features (e.g. 80-dim)
            lengths: (B,) valid length per sequence
            return_encoder_output: if True, also return pooled encoder features

        Returns:
            logits: (B, num_classes) classification logits (0=human, 1=AI)
            Optional: pooled_features if return_encoder_output
        """
        encoder_out, quantized_features, perplexity, time_mask = self.wav2vec(
            input_values, lengths
        )
        pooled = mean_pool_masked(encoder_out, lengths)
        logits = self.classifier_head(pooled)

        if return_encoder_output:
            return logits, pooled
        return logits

    def predict_proba(self, input_values: torch.Tensor, lengths: torch.Tensor) -> torch.Tensor:
        """Return class probabilities (human, AI)."""
        logits = self.forward(input_values, lengths)
        return torch.softmax(logits, dim=-1)

    def predict(self, input_values: torch.Tensor, lengths: torch.Tensor) -> torch.Tensor:
        """Return predicted class (0=human, 1=AI)."""
        logits = self.forward(input_values, lengths)
        return logits.argmax(dim=-1)
