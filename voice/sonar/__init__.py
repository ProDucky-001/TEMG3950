"""
SONAR: Synthetic AI-Audio Detection (arxiv.org/html/2410.04324v2).
Provides Wav2Vec2-based model for human vs AI voice classification.
"""
from .wave2vec2 import Wav2Vec2

__all__ = ["Wav2Vec2"]
