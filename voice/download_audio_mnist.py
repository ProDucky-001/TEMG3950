"""
Download AudioMNIST human voice WAV files from data/01 (GitHub).
Use as human voice dataset for finetuning.

Run:  python -m voice.download_audio_mnist
  or:  python -m voice.download_audio_mnist path/to/output_dir
"""
import os
import sys
import urllib.request
from pathlib import Path

BASE_URL = "https://github.com/soerenab/AudioMNIST/raw/master/data/01"
SCRIPT_DIR = Path(__file__).resolve().parent
# Default: data/audio_mnist_human at project root (parent of voice/)
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_OUT_DIR = PROJECT_ROOT / "data" / "audio_mnist_human"


def main():
    out_dir = os.environ.get("AUDIOMNIST_OUT", str(DEFAULT_OUT_DIR))
    if len(sys.argv) > 1:
        out_dir = sys.argv[1]
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    print(f"Downloading AudioMNIST data/01 (human voice) -> {out_path.absolute()}")

    failed = []
    for digit in range(10):
        for idx in range(50):
            fname = f"{digit}_01_{idx}.wav"
            url = f"{BASE_URL}/{fname}"
            dest = out_path / fname
            try:
                urllib.request.urlretrieve(url, dest)
                print(f"  OK {fname}")
            except Exception as e:
                failed.append((fname, str(e)))
                print(f"  FAIL {fname}: {e}")

    n_ok = 10 * 50 - len(failed)
    print(f"\nDone: {n_ok} files saved to {out_path.absolute()}")
    if failed:
        print(f"Failed: {len(failed)} files")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
