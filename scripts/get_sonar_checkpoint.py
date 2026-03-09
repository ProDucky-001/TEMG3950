#!/usr/bin/env python3
"""
Train a SONAR checkpoint (Wav2Vec2 on Wavefake) and copy it into this project's ckpt/.

Prerequisites:
  1. Git (to clone SONAR).
  2. Wavefake dataset: download from https://zenodo.org/records/5642694 and extract
     so that the SONAR repo has data/wavefake/ with subdirs like ljspeech_full_band_melgan,
     ljspeech_hifiGAN, etc. (See SONAR README for exact layout.)

Usage:
  1. Download Wavefake from Zenodo (link above), extract to a folder.
  2. Run: python scripts/get_sonar_checkpoint.py
     On first run this clones SONAR into sonar_repo/. Then copy (or symlink) your
     Wavefake extraction into sonar_repo/data/wavefake/ and run again.
  Or set WAVEFAKE_DIR to the path of your Wavefake extraction (will copy/link into SONAR).

  python scripts/get_sonar_checkpoint.py --wavefake-dir "C:\path\to\wavefake"
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Project root (directory containing ckpt/, voice_bot.py)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SONAR_REPO = PROJECT_ROOT / "sonar_repo"
OUR_CKPT = PROJECT_ROOT / "ckpt"
SONAR_DATA = SONAR_REPO / "data"
WAVEFAKE_DIR = SONAR_DATA / "wavefake"
SONAR_CKPT = SONAR_REPO / "ckpt"
SONAR_REPO_URL = "https://github.com/Jessegator/SONAR.git"


def clone_sonar() -> bool:
    """Clone SONAR into sonar_repo/. Returns True if repo exists or clone succeeded."""
    if (SONAR_REPO / "main_fm.py").exists():
        return True
    print("Cloning SONAR into sonar_repo/ ...")
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", SONAR_REPO_URL, str(SONAR_REPO)],
            check=True,
            cwd=str(PROJECT_ROOT),
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print("Clone failed:", e, file=sys.stderr)
        print("Ensure git is installed and run: git clone", SONAR_REPO_URL, "sonar_repo", file=sys.stderr)
        return False


def ensure_wavefake(wavefake_src: Path | None) -> bool:
    """Ensure sonar_repo/data/wavefake/ exists. If wavefake_src given, copy/link it. Returns True if ready."""
    WAVEFAKE_DIR.mkdir(parents=True, exist_ok=True)
    if wavefake_src and wavefake_src.is_dir():
        # Copy or symlink contents into WAVEFAKE_DIR
        for p in wavefake_src.iterdir():
            dest = WAVEFAKE_DIR / p.name
            if dest.exists():
                continue
            if p.is_dir():
                print("Linking", p.name, "into sonar_repo/data/wavefake/ ...")
                try:
                    dest.symlink_to(p.resolve())
                except OSError:
                    print("Symlink failed; copying (may be slow) ...")
                    shutil.copytree(p, dest)
            else:
                shutil.copy2(p, dest)
    # Check for expected layout (at least one vocoder subdir)
    subdirs = [d for d in WAVEFAKE_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if not subdirs:
        print("SONAR expects data/wavefake/ to contain vocoder subdirs (e.g. ljspeech_full_band_melgan).")
        print("Download Wavefake from https://zenodo.org/records/5642694 and extract it.")
        print("Then either:")
        print("  - Copy the extracted folder contents into:", WAVEFAKE_DIR)
        print("  - Or run: python scripts/get_sonar_checkpoint.py --wavefake-dir <path-to-extracted-wavefake>")
        return False
    return True


def run_training(epochs: int = 3) -> bool:
    """Run SONAR main_fm.py --model wave2vec2 --epochs N. Returns True on success."""
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SONAR_REPO)
    cmd = [
        sys.executable,
        "main_fm.py",
        "--model", "wave2vec2",
        "--epochs", str(epochs),
        "--output_dir", str(SONAR_CKPT),
    ]
    print("Running:", " ".join(cmd), "in", SONAR_REPO)
    try:
        subprocess.run(cmd, cwd=str(SONAR_REPO), env=env, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print("Training failed:", e, file=sys.stderr)
        return False


def copy_checkpoints() -> int:
    """Copy sonar_repo/ckpt/*.pth to our ckpt/. Returns number of files copied."""
    OUR_CKPT.mkdir(parents=True, exist_ok=True)
    count = 0
    if not SONAR_CKPT.is_dir():
        return 0
    for p in SONAR_CKPT.glob("*.pth"):
        dest = OUR_CKPT / p.name
        shutil.copy2(p, dest)
        print("Copied", p.name, "->", dest)
        count += 1
    return count


def main() -> int:
    ap = argparse.ArgumentParser(description="Train SONAR checkpoint and copy to project ckpt/")
    ap.add_argument(
        "--wavefake-dir",
        type=Path,
        default=None,
        help="Path to extracted Wavefake dataset (will be linked/copied into sonar_repo/data/wavefake)",
    )
    ap.add_argument("--epochs", type=int, default=3, help="Training epochs (default 3)")
    args = ap.parse_args()

    if not clone_sonar():
        return 1

    wavefake_src = args.wavefake_dir or (Path(os.environ.get("WAVEFAKE_DIR", "")) if os.environ.get("WAVEFAKE_DIR") else None)
    if wavefake_src and not wavefake_src.is_dir():
        print("Not a directory:", wavefake_src, file=sys.stderr)
        return 1

    if not ensure_wavefake(wavefake_src):
        return 1

    if not run_training(epochs=args.epochs):
        return 1

    n = copy_checkpoints()
    if n == 0:
        print("No .pth files found in", SONAR_CKPT, file=sys.stderr)
        return 1
    print("Done. Restart the classifier; it will use the new checkpoint and report checkpoint_loaded: true.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
