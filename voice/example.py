"""Example feature extractor and encoder for Wav2Vec2-style training (used by train_voice_classifier)."""
import json

import torch
from torch import nn

from .model import Config, Wav2Vec2Framework, Wav2vec2Loss, Wav2Vec2VoiceClassifier


class ExampleFeatureExtractor(nn.Module):
    def __init__(self, extracted_feature_size):
        super().__init__()
        self.linear = nn.Linear(80, extracted_feature_size)

    def forward(self, inputs, lengths):
        hidden_states = self.linear(inputs)
        return hidden_states, lengths


class ExampleEncoder(nn.Module):
    def __init__(self, extracted_feature_size, encoder_hidden_size):
        super().__init__()
        self.linear = nn.Linear(extracted_feature_size, encoder_hidden_size)

    def forward(self, hidden_states, lengths):
        hidden_states = self.linear(hidden_states)
        return hidden_states, lengths


if __name__ == "__main__":
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"Use device: {device}")

    extracted_feature_size = 562
    encoder_hidden_size = 1024

    feature_extractor = ExampleFeatureExtractor(extracted_feature_size).to(device)
    encoder = ExampleEncoder(extracted_feature_size, encoder_hidden_size).to(device)

    inputs = torch.randn(4, 1000, 80).to(device)
    input_lengths = torch.tensor([1000, 871, 389, 487]).to(device)

    with open("config.json", "r", encoding="utf-8") as f:
        config = Config(**json.load(f))

    model = Wav2Vec2Framework(config, feature_extractor, encoder).to(device)
    criterion = Wav2vec2Loss(config)
    model_out = model(inputs, input_lengths)
    loss = criterion(*model_out)
    print("Pretraining loss:", loss)
    loss.backward()

    voice_model = Wav2Vec2VoiceClassifier(config, feature_extractor, encoder).to(device)
    logits = voice_model(inputs, input_lengths)
    probs = torch.softmax(logits, dim=-1)
    preds = logits.argmax(dim=-1)
    print("\nVoice classification (0=human, 1=AI):")
    print("  Logits:", logits[0].tolist())
    print("  Probs:", probs[0].tolist())
    print("  Preds:", preds.tolist())
