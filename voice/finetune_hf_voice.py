"""
Finetune the Hugging Face Wav2Vec2 audio classifier (Gustking model) on your own data.
Saves a model you can use with run_classifier.py via --model <output_dir>.

Usage:
    python -m voice.finetune_hf_voice --human_dir path/to/human_audio --ai_dir path/to/ai_audio --output_dir ./my_model
    python -m voice.finetune_hf_voice --data_csv path/to/labels.csv --output_dir ./my_model
"""
import argparse
import csv
import os
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000


def load_audio_numpy(path: str) -> tuple[np.ndarray, int]:
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        raise FileNotFoundError(path)

    try:
        import soundfile as sf
        data, sr = sf.read(path, dtype="float32")
    except Exception:
        data, sr = None, None

    if data is not None:
        if data.ndim > 1:
            data = data.mean(axis=1)
        if data.dtype != np.float32:
            data = data.astype(np.float32)
        if sr != SAMPLE_RATE:
            from scipy.signal import resample as scipy_resample
            n = int(round(len(data) * SAMPLE_RATE / sr))
            data = scipy_resample(data, n).astype(np.float32)
            sr = SAMPLE_RATE
        return data, sr

    ext = Path(path).suffix.lower()
    if ext in (".mp3", ".m4a", ".aac", ".ogg"):
        import subprocess
        import tempfile
        import wave
        ffmpeg = "ffmpeg"
        try:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            wav_path = f.name
        try:
            subprocess.run(
                [ffmpeg, "-y", "-i", path, "-acodec", "pcm_s16le", "-ac", "1",
                 "-ar", str(SAMPLE_RATE), "-loglevel", "error", wav_path],
                check=True, capture_output=True,
            )
            with wave.open(wav_path, "rb") as wav:
                sr = wav.getframerate()
                nframes = wav.getnframes()
                raw = wav.readframes(nframes)
            if wav.getsampwidth() != 2:
                raise ValueError("Unsupported WAV sample width")
            data = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
            if wav.getnchannels() == 2:
                data = data.reshape(-1, 2).mean(axis=1)
            from scipy.signal import resample as scipy_resample
            n = int(round(len(data) * SAMPLE_RATE / sr))
            data = scipy_resample(data, n).astype(np.float32)
            return data, SAMPLE_RATE
        finally:
            if os.path.isfile(wav_path):
                try:
                    os.remove(wav_path)
                except OSError:
                    pass

    raise RuntimeError(f"Could not load audio: {path}")


def collect_samples(human_dir: str | None, ai_dir: str | None, data_csv: str | None) -> list[tuple[str, int]]:
    samples = []
    exts = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}

    if data_csv:
        with open(data_csv, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                path = row.get("path", row.get("file", row.get("audio", "")))
                label = int(row.get("label", row.get("target", 0)))
                if os.path.isfile(path):
                    samples.append((path, label))
        return samples

    if human_dir:
        for path in Path(human_dir).rglob("*"):
            if path.suffix.lower() in exts:
                samples.append((str(path), 0))
    if ai_dir:
        for path in Path(ai_dir).rglob("*"):
            if path.suffix.lower() in exts:
                samples.append((str(path), 1))
    return samples


def main(args=None):
    parser = argparse.ArgumentParser(description="Finetune Gustking Wav2Vec2 human vs AI voice classifier")
    parser.add_argument("--human_dir", type=str, default=None, help="Directory of human (real) voice samples")
    parser.add_argument("--ai_dir", type=str, default=None, help="Directory of AI-generated (fake) voice samples")
    parser.add_argument("--data_csv", type=str, default=None, help="CSV with path,label (0=human, 1=AI)")
    parser.add_argument("--output_dir", type=str, default="finetuned_voice_model", help="Where to save the model")
    parser.add_argument("--model_id", type=str, default="Gustking/wav2vec2-large-xlsr-deepfake-audio-classification",
                        help="Base model to finetune (default: Gustking)")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--val_split", type=float, default=0.15, help="Fraction for validation")
    parser.add_argument("--device", type=str, default="cuda", choices=("cuda", "cpu"))
    args = parser.parse_args() if args is None else args

    if not args.data_csv and not (args.human_dir or args.ai_dir):
        parser.error("Provide --human_dir and/or --ai_dir, or --data_csv")

    samples = collect_samples(args.human_dir, args.ai_dir, args.data_csv)
    if not samples:
        raise SystemExit("No audio files found.")

    from datasets import Dataset
    from transformers import (
        AutoFeatureExtractor,
        AutoModelForAudioClassification,
        Trainer,
        TrainingArguments,
    )

    def gen():
        for path, label in samples:
            try:
                array, sr = load_audio_numpy(path)
                yield {"audio": {"array": array, "sampling_rate": sr}, "label": label}
            except Exception as e:
                print(f"Skip {path}: {e}")

    rows = list(gen())
    if not rows:
        raise SystemExit("No samples could be loaded.")
    dataset = Dataset.from_list(rows)

    dataset = dataset.train_test_split(test_size=args.val_split, seed=42, stratify_by_column="label")
    train_ds = dataset["train"]
    eval_ds = dataset["test"]

    model_id = args.model_id
    feature_extractor = AutoFeatureExtractor.from_pretrained(model_id)
    model = AutoModelForAudioClassification.from_pretrained(model_id, num_labels=2)
    if not hasattr(model.config, "id2label") or model.config.id2label is None:
        model.config.id2label = {0: "real", 1: "fake"}
        model.config.label2id = {"real": 0, "fake": 1}

    import torch

    max_length_samples = int(feature_extractor.sampling_rate * 30)

    def data_collator(features):
        audio_arrays = [f["audio"]["array"] for f in features]
        batch = feature_extractor(
            audio_arrays,
            sampling_rate=feature_extractor.sampling_rate,
            padding=True,
            return_tensors="pt",
            truncation=True,
            max_length=max_length_samples,
        )
        batch["labels"] = torch.tensor([f["label"] for f in features], dtype=torch.long)
        return batch

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_ratio=0.1,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_accuracy",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=feature_extractor,
        data_collator=data_collator,
    )

    trainer.train()
    trainer.save_model(args.output_dir)
    feature_extractor.save_pretrained(args.output_dir)

    print(f"Model saved to {args.output_dir}. Run with:")
    print(f"  python run_classifier.py --model {os.path.abspath(args.output_dir)}")


if __name__ == "__main__":
    main()
