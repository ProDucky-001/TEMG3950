"""
SONAR-style classification head for Wav2Vec2 (human vs AI voice).
From: https://github.com/Jessegator/SONAR (SONAR: A Synthetic AI-Audio Detection Framework and Benchmark)
"""
from dataclasses import dataclass
from typing import Optional, Tuple

import torch
import torch.nn as nn
from transformers.modeling_outputs import ModelOutput


@dataclass
class SpeechClassifierOutput(ModelOutput):
    loss: Optional[torch.FloatTensor] = None
    logits: torch.FloatTensor = None
    hidden_states: Optional[Tuple[torch.FloatTensor]] = None
    attentions: Optional[Tuple[torch.FloatTensor]] = None


class ClassificationHead(nn.Module):
    """Head for wav2vec classification task (human vs AI)."""

    def __init__(self, config, num_labels: int = 2):
        super().__init__()
        hidden_size = getattr(config, "hidden_size", config.hidden_size)
        self.dense = nn.Linear(hidden_size, hidden_size)
        self.dropout = nn.Dropout(0.1)
        self.out_proj = nn.Linear(hidden_size, num_labels)

    def forward(self, features, **kwargs):
        x = self.dropout(features)
        x = self.dense(x)
        x = torch.tanh(x)
        x = self.dropout(x)
        x = self.out_proj(x)
        return x
