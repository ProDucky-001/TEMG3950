"""
Input your training files and finetune the voice classifier.

Run:  python -m voice.train_with_my_data --human_dir ./human_audio --ai_dir ./ai_audio --output_dir ./my_model
  or: python -m voice.train_with_my_data --interactive
"""
import argparse
import os
import sys
from pathlib import Path

EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}


def count_audio_in_dir(path: str) -> int:
    if not path or not os.path.isdir(path):
        return 0
    return sum(1 for p in Path(path).rglob("*") if p.suffix.lower() in EXTENSIONS)


def interactive_prompt():
    print("\n--- Voice classifier: input training data ---\n")
    human_dir = input("Folder with HUMAN (real) voice files [or Enter to skip]: ").strip().strip('"')
    ai_dir = input("Folder with AI-GENERATED (fake) voice files [or Enter to skip]: ").strip().strip('"')
    data_csv = input("Or path to CSV with columns path,label (0=human,1=AI) [Enter to skip]: ").strip().strip('"')
    output_dir = input("Output folder for saved model [finetuned_voice_model]: ").strip().strip('"') or "finetuned_voice_model"
    epochs_str = input("Epochs [3]: ").strip() or "3"

    if not data_csv and not human_dir and not ai_dir:
        print("Error: provide at least human_dir + ai_dir, or data_csv.")
        return None
    if data_csv and not os.path.isfile(data_csv):
        print(f"Error: CSV not found: {data_csv}")
        return None
    if human_dir and not os.path.isdir(human_dir):
        print(f"Error: directory not found: {human_dir}")
        return None
    if ai_dir and not os.path.isdir(ai_dir):
        print(f"Error: directory not found: {ai_dir}")
        return None

    n_human = count_audio_in_dir(human_dir)
    n_ai = count_audio_in_dir(ai_dir)
    if not data_csv:
        print(f"  Human clips: {n_human}  |  AI clips: {n_ai}")
        if n_human == 0 and n_ai == 0:
            print("Error: no audio files found in the given folders.")
            return None

    try:
        epochs = int(epochs_str)
    except ValueError:
        epochs = 3

    return argparse.Namespace(
        human_dir=human_dir or None,
        ai_dir=ai_dir or None,
        data_csv=data_csv or None,
        output_dir=output_dir,
        model_id="Gustking/wav2vec2-large-xlsr-deepfake-audio-classification",
        epochs=epochs,
        batch_size=8,
        lr=2e-5,
        val_split=0.15,
        device="cuda",
    )


def main():
    parser = argparse.ArgumentParser(
        description="Input training files and finetune the human vs AI voice classifier.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--human_dir", type=str, default=None)
    parser.add_argument("--ai_dir", type=str, default=None)
    parser.add_argument("--data_csv", type=str, default=None)
    parser.add_argument("--output_dir", type=str, default="finetuned_voice_model")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--interactive", action="store_true")
    args = parser.parse_args()

    if args.interactive or (not args.data_csv and not args.human_dir and not args.ai_dir):
        full = interactive_prompt()
        if full is None:
            sys.exit(1)
    else:
        full = argparse.Namespace(
            human_dir=args.human_dir,
            ai_dir=args.ai_dir,
            data_csv=args.data_csv,
            output_dir=args.output_dir,
            model_id="Gustking/wav2vec2-large-xlsr-deepfake-audio-classification",
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=2e-5,
            val_split=0.15,
            device="cuda",
        )

    from .finetune_hf_voice import main as run_finetune
    run_finetune(args=full)


if __name__ == "__main__":
    main()
