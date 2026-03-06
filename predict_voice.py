"""
Inference script for AI vs Human voice detection.

Usage:
    python predict_voice.py --audio path/to/audio.wav
    python predict_voice.py --audio path/to/audio.wav --checkpoint checkpoints/voice_classifier.pt
"""

import argparse
import json
import os

import torch

from model import Config, Wav2Vec2VoiceClassifier
from example import ExampleFeatureExtractor, ExampleEncoder
from audio_utils import load_and_extract


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=str, required=True, help="Path to audio file")
    parser.add_argument(
        "--checkpoint",
        type=str,
        default="checkpoints/voice_classifier.pt",
        help="Path to trained checkpoint",
    )
    parser.add_argument("--config", type=str, default="config.json")
    args = parser.parse_args()

    device = "cuda:0" if torch.cuda.is_available() else "cpu"

    # Load config
    with open(args.config, encoding="utf-8") as f:
        config = Config(**json.load(f))

    # Build model
    feature_extractor = ExampleFeatureExtractor(config.extracted_feature_size)
    encoder = ExampleEncoder(config.extracted_feature_size, config.encoder_hidden_size)
    model = Wav2Vec2VoiceClassifier(config, feature_extractor, encoder).to(device)

    # Load checkpoint
    if not os.path.isfile(args.checkpoint):
        print(
            f"WARNING: Checkpoint not found at {args.checkpoint}. "
            "Using untrained model (random weights). Train with train_voice_classifier.py first."
        )
    else:
        ckpt = torch.load(args.checkpoint, map_location=device)

        if "model_state_dict" in ckpt:
            model.load_state_dict(ckpt["model_state_dict"], strict=True)
        else:
            model.load_state_dict(ckpt, strict=True)
        print(f"Loaded checkpoint from {args.checkpoint}")

    model.eval()

    # Load and extract features
    features, lengths = load_and_extract(args.audio)
    features = features.to(device)
    lengths = lengths.to(device)

    with torch.no_grad():
        probs = model.predict_proba(features, lengths)
        pred = model.predict(features, lengths)

    prob_human = probs[0, 0].item()
    prob_ai = probs[0, 1].item()
    label = "Human" if pred[0].item() == 0 else "AI-generated"

    print(f"\n--- Voice Classification Result ---")
    print(f"File: {args.audio}")
    print(f"Prediction: {label}")
    print(f"  P(Human): {prob_human:.2%}")
    print(f"  P(AI):    {prob_ai:.2%}")
    print("-----------------------------------\n")


if __name__ == "__main__":
    main()
