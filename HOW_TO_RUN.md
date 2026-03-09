# How to run the voice classifier and input a file

The app uses **[Gustking/wav2vec2-large-xlsr-deepfake-audio-classification](https://huggingface.co/Gustking/wav2vec2-large-xlsr-deepfake-audio-classification)** from Hugging Face — a fine-tuned Wav2Vec2 model for binary classification (real vs. fake/deepfake audio). It was evaluated on ASVspoof2019 (~93% accuracy, ~94% F1, ~4% EER). **No local training or checkpoint is required;** the model is loaded from the Hub on first run.

## Install

```bash
pip install -r requirements.txt
```

This installs `transformers`, `torch`, `torchaudio`, `soundfile`, and `imageio-ffmpeg`. The first run will download the model from Hugging Face.

**Optional (for MP3 without torchaudio):** `pip install imageio-ffmpeg` or install ffmpeg and add it to PATH.

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

WAV, MP3, FLAC, OGG, M4A, AAC. Audio is resampled to 16 kHz for the model.

## Device

Use GPU if available (default). To force CPU:

```bash
python run_classifier.py --device cpu "path\to\audio.mp3"
```

## Human voice dataset (AudioMNIST data/01)

To download the [AudioMNIST](https://github.com/soerenab/AudioMNIST) human voice WAV files from `data/01` for use as a human-voice dataset (e.g. for finetuning):

1. In a terminal in this folder, run:
   ```bash
   python download_audio_mnist.py
   ```
   Or on Windows, double-click **`DOWNLOAD_AUDIOMNIST.bat`**.
2. Files are saved to **`data/audio_mnist_human`** (500 WAVs). To use a different folder:
   ```bash
   python download_audio_mnist.py path/to/output_dir
   ```
3. Use the folder when training, e.g.:
   ```bash
   python train_with_my_data.py --human_dir ./data/audio_mnist_human --ai_dir path/to/ai_audio --output_dir ./my_model
   ```

## Note

The classifier returns scores for **real** (human) and **fake** (AI-generated). Performance may vary on audio that differs from the model’s training data; test on your own samples as needed.
