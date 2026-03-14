#!/usr/bin/env python3
"""
Train a SONAR checkpoint (Wav2Vec2 on Wavefake) and copy it into project ckpt/.

Usage:
  python -m voice.scripts.get_sonar_checkpoint
  python -m voice.scripts.get_sonar_checkpoint --wavefake-dir "C:\path\to\wavefake"
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Project root (voice/scripts -> voice -> project root)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SONAR_REPO = PROJECT_ROOT / "sonar_repo"
OUR_CKPT = PROJECT_ROOT / "ckpt"
SONAR_DATA = SONAR_REPO / "data"
WAVEFAKE_DIR = SONAR_DATA / "wavefake"
SONAR_CKPT = SONAR_REPO / "ckpt"
SONAR_REPO_URL = "https://github.com/Jessegator/SONAR.git"


def clone_sonar() -> bool:
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
        return False


def ensure_wavefake(wavefake_src: Path | None) -> bool:
    WAVEFAKE_DIR.mkdir(parents=True, exist_ok=True)
    if wavefake_src and wavefake_src.is_dir():
        for p in wavefake_src.iterdir():
            dest = WAVEFAKE_DIR / p.name
            if dest.exists():
                continue
            if p.is_dir():
                try:
                    dest.symlink_to(p.resolve())
                except OSError:
                    shutil.copytree(p, dest)
            else:
                shutil.copy2(p, dest)
    subdirs = [d for d in WAVEFAKE_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if not subdirs:
        print("SONAR expects data/wavefake/ to contain vocoder subdirs. See Zenodo 5642694.")
        return False
    return True


def run_training(epochs: int = 3) -> bool:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SONAR_REPO)
    cmd = [sys.executable, "main_fm.py", "--model", "wave2vec2", "--epochs", str(epochs), "--output_dir", str(SONAR_CKPT)]
    try:
        subprocess.run(cmd, cwd=str(SONAR_REPO), env=env, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print("Training failed:", e, file=sys.stderr)
        return False


def copy_checkpoints() -> int:
    OUR_CKPT.mkdir(parents=True, exist_ok=True)
    count = 0
    if not SONAR_CKPT.is_dir():
        return 0
    for p in SONAR_CKPT.glob("*.pth"):
        shutil.copy2(p, OUR_CKPT / p.name)
        count += 1
    return count


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wavefake-dir", type=Path, default=None)
    ap.add_argument("--epochs", type=int, default=3)
    args = ap.parse_args()

    if not clone_sonar():
        return 1
    wavefake_src = args.wavefake_dir or (Path(os.environ.get("WAVEFAKE_DIR", "")) if os.environ.get("WAVEFAKE_DIR") else None)
    if wavefake_src and not wavefake_src.is_dir():
        return 1
    if not ensure_wavefake(wavefake_src):
        return 1
    if not run_training(epochs=args.epochs):
        return 1
    if copy_checkpoints() == 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
