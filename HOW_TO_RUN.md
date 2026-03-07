# How to run the voice classifier and input a file

> **If you just pulled this repo:** Train the AI model first so predictions are meaningful. See [Getting meaningful scores: fine-tuned checkpoint](#getting-meaningful-scores-fine-tuned-checkpoint) below (download Wavefake, run `scripts/get_sonar_checkpoint.py`, then use `run_classifier.py` with a checkpoint in `ckpt/`).

The app uses the **SONAR** model ([arxiv.org/html/2410.04324v2](https://arxiv.org/html/2410.04324v2)) — a Wav2Vec2-based AI-audio detection framework — to classify audio as human or AI-generated.

## Install

```bash
pip install -r requirements.txt
```

This installs `transformers`, `torch`, `torchaudio`, `soundfile`, and `imageio-ffmpeg`. The first run will download the Wav2Vec2 base model from Hugging Face.

**Optional (for MP3 without torchaudio):** `pip install imageio-ffmpeg` or install ffmpeg and add it to PATH.

## Getting meaningful scores: fine-tuned checkpoint

Without a checkpoint, probabilities stay near 50%. To get real human vs AI scores:

### 1. Download the Wavefake dataset

- Go to **[Zenodo: Wavefake](https://zenodo.org/records/5642694)** and download the dataset (e.g. the zip or tar).
- Extract it to a folder, e.g. `C:\data\wavefake` (the extracted folder should contain subfolders like `ljspeech_full_band_melgan`, `ljspeech_hifiGAN`, etc.).

### 2. Train and copy a checkpoint (from this project)

From the **project root** (the folder containing `voice_bot.py` and `ckpt/`):

```bash
python scripts/get_sonar_checkpoint.py --wavefake-dir "C:\data\wavefake"
```

Replace `C:\data\wavefake` with the path where you extracted Wavefake.

- The script clones the [SONAR repo](https://github.com/Jessegator/SONAR) into `sonar_repo/` if needed, prepares `sonar_repo/data/wavefake/`, runs SONAR training (`main_fm.py --model wave2vec2 --epochs 3`), then copies the resulting `.pth` into **`ckpt/`**.
- Requires **Python 3.9+**, **Git**, and the same dependencies SONAR needs (e.g. `torch`, `transformers`, `librosa`). Install SONAR’s deps inside `sonar_repo/` if needed (e.g. `pip install torch transformers librosa scikit-learn tqdm` in a venv that you use only for this script).

### 3. Run the classifier again

After a `.pth` file appears in **`ckpt/`**, run:

```bash
python run_classifier.py "path\to\audio.mp3"
```

The app will load the checkpoint and report **checkpoint_loaded: true**; probabilities will then reflect the model’s confidence instead of staying near 50%.

## Option 1: Interactive (type or paste file path)

1. Open a terminal in this folder.
2. Run:
   ```bash
   python run_classifier.py
   ```
   Or on Windows, double-click **`RUN_CLASSIFIER.bat`**.
3. When you see **`File path:`**, type or paste the path to your audio file and press Enter.
4. The app will show **Prediction: Human** or **AI-generated** and the probabilities.
5. Type another path to classify more files, or type **`q`** and Enter to quit.

## Option 2: Pass the file as an argument

```bash
python run_classifier.py "C:\path\to\your\file.mp3"
```

or

```bash
python predict_voice.py "C:\path\to\your\file.mp3"
```

## Supported formats

WAV, MP3, FLAC, OGG, M4A, AAC.

## Note

If you see “(Uncalibrated: no SONAR checkpoint loaded)”, the model is still runnable but probabilities are from an untrained head. Add a fine-tuned checkpoint to **`ckpt/`** for calibrated results.
