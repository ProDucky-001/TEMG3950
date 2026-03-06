"""
Training script for AI vs Human voice classifier.

Usage:
    python train_voice_classifier.py --human_dir path/to/human_audio --ai_dir path/to/ai_audio
    python train_voice_classifier.py --data_csv path/to/labels.csv

Data format:
    - Directory mode: --human_dir and --ai_dir with .wav/.mp3 files
    - CSV mode: --data_csv with columns [path, label] where label is 0 (human) or 1 (AI)
"""

import argparse
import json
import os
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader

from model import Config, Wav2Vec2VoiceClassifier
from example import ExampleFeatureExtractor, ExampleEncoder
from audio_utils import load_and_extract


class VoiceDataset(Dataset):
    """Dataset of (audio_path, label) for human (0) vs AI (1) voice."""

    def __init__(self, samples: list[tuple[str, int]]):
        self.samples = samples

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        features, lengths = load_and_extract(path)
        return features.squeeze(0), lengths, label


def collect_from_dirs(human_dir: str, ai_dir: str) -> list[tuple[str, int]]:
    """Collect (path, label) from human and AI directories."""
    samples = []
    exts = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}

    for path in Path(human_dir).rglob("*"):
        if path.suffix.lower() in exts:
            samples.append((str(path), 0))

    for path in Path(ai_dir).rglob("*"):
        if path.suffix.lower() in exts:
            samples.append((str(path), 1))

    return samples


def collect_from_csv(csv_path: str) -> list[tuple[str, int]]:
    """Collect (path, label) from CSV with columns path, label."""
    import csv

    samples = []
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            path = row.get("path", row.get("file", row.get("audio", "")))
            label = int(row.get("label", row.get("target", 0)))
            if os.path.isfile(path):
                samples.append((path, label))
    return samples


def train_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    for features, lengths, labels in loader:
        features = features.to(device)
        lengths = lengths.to(device)
        labels = labels.to(device)

        optimizer.zero_grad()
        logits = model(features, lengths)
        loss = criterion(logits, labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item()
        pred = logits.argmax(dim=1)
        correct += (pred == labels).sum().item()
        total += labels.size(0)

    return total_loss / len(loader), correct / total if total else 0


def eval_epoch(model, loader, criterion, device):
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for features, lengths, labels in loader:
            features = features.to(device)
            lengths = lengths.to(device)
            labels = labels.to(device)

            logits = model(features, lengths)
            loss = criterion(logits, labels)

            total_loss += loss.item()
            pred = logits.argmax(dim=1)
            correct += (pred == labels).sum().item()
            total += labels.size(0)

    return total_loss / len(loader) if loader else 0, correct / total if total else 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--human_dir", type=str, help="Directory of human voice samples")
    parser.add_argument("--ai_dir", type=str, help="Directory of AI/synthetic voice samples")
    parser.add_argument("--data_csv", type=str, help="CSV with path,label columns")
    parser.add_argument("--config", type=str, default="config.json")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--val_split", type=float, default=0.2)
    parser.add_argument("--save_dir", type=str, default="checkpoints")
    parser.add_argument("--save_name", type=str, default="voice_classifier.pt")
    args = parser.parse_args()

    if args.data_csv:
        samples = collect_from_csv(args.data_csv)
    elif args.human_dir and args.ai_dir:
        samples = collect_from_dirs(args.human_dir, args.ai_dir)
    else:
        raise ValueError("Provide --human_dir and --ai_dir, or --data_csv")

    if not samples:
        raise ValueError("No audio samples found")

    # Train/val split
    n_val = int(len(samples) * args.val_split)
    n_train = len(samples) - n_val
    train_samples = samples[:n_train]
    val_samples = samples[n_train:]

    train_ds = VoiceDataset(train_samples)
    val_ds = VoiceDataset(val_samples)

    def collate_fn(batch):
        features_list = [b[0] for b in batch]
        lengths = torch.tensor([b[1].item() for b in batch])
        labels = torch.tensor([b[2] for b in batch], dtype=torch.long)
        max_len = max(f.size(1) for f in features_list)
        feat_dim = features_list[0].size(2)
        padded = torch.zeros(len(batch), max_len, feat_dim)
        for i, f in enumerate(features_list):
            padded[i, : f.size(1), :] = f
        return padded, lengths, labels

    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=collate_fn, num_workers=0
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False, collate_fn=collate_fn, num_workers=0
    )

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}, Train: {n_train}, Val: {n_val}")

    with open(args.config, encoding="utf-8") as f:
        config = Config(**json.load(f))

    feature_extractor = ExampleFeatureExtractor(config.extracted_feature_size)
    encoder = ExampleEncoder(config.extracted_feature_size, config.encoder_hidden_size)
    model = Wav2Vec2VoiceClassifier(config, feature_extractor, encoder).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    os.makedirs(args.save_dir, exist_ok=True)
    best_acc = 0.0

    for epoch in range(args.epochs):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc = eval_epoch(model, val_loader, criterion, device)
        print(
            f"Epoch {epoch + 1}/{args.epochs} | "
            f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f}"
        )

        if val_acc > best_acc:
            best_acc = val_acc
            save_path = os.path.join(args.save_dir, args.save_name)
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "config": vars(config),
                    "epoch": epoch,
                },
                save_path,
            )
            print(f"  -> Saved best model to {save_path}")

    print(f"Training complete. Best val accuracy: {best_acc:.4f}")


if __name__ == "__main__":
    main()
