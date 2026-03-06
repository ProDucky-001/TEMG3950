# How to run the voice classifier and input a file

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

- MP3, WAV, FLAC, OGG, M4A

## Note

If you see "No trained checkpoint found", the model is using random weights. To get real human vs AI classification, train first:

```bash
python train_voice_classifier.py --human_dir path/to/human_audio --ai_dir path/to/ai_audio --epochs 20
```

Then run the classifier again; it will load `checkpoints/voice_classifier.pt` automatically.
