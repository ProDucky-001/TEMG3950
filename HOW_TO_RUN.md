# How to run the voice classifier and input a file

The app uses **[ai-audio-detector](https://pypi.org/project/ai-audio-detector/)** (Benford's Law + spectral features, ensemble ML) to classify audio as human or AI-generated.

## Install

```bash
pip install ai-audio-detector
# or
pip install -r requirements.txt
```

**Optional (Ubuntu/Debian):** `sudo apt-get install libsndfile1 ffmpeg`  
**Optional (macOS):** `brew install libsndfile ffmpeg`

## First-time: train models

1. Put audio files in two folders: **human** and **AI**.
2. From this project folder, run:

```bash
ai-audio-detector --train --human-dir path/to/human_audio --ai-dir path/to/ai_audio
```

Models are saved under `models/ai_audio_detector.joblib` in this folder. You only need to train once (or when you want to add more data).

## Option 1: Interactive (type or paste file path)

1. Open a terminal (PowerShell or Command Prompt) in this folder.
2. Run:
   ```bash
   python run_classifier.py
   ```
   Or on Windows, double-click **`RUN_CLASSIFIER.bat`**.
3. When you see **`File path:`**, type or paste the path to your audio file (e.g. `C:\Users\You\Music\recording.mp3`) and press Enter.
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

If you see "No trained models found", train first with:

```bash
ai-audio-detector --train --human-dir path/to/human_audio --ai-dir path/to/ai_audio
```

Then run the classifier again; it will use `models/ai_audio_detector.joblib` in this folder.
