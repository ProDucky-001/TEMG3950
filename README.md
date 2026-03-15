# Anti-Scam AI Copilot

System tray application with background monitoring for scam and phishing detection, plus **Human vs AI voice classification** (Wav2Vec2). Built with **Electron**, **TypeScript**, **React**, and **Python**.

---

## Tech stack

| Area | Technologies |
|------|--------------|
| **Desktop app** | Electron, TypeScript, React, React Router, Vite (electron-vite) |
| **State & storage** | electron-store, electron-updater |
| **UI & charts** | Recharts |
| **System integration** | active-win (active window), Tesseract.js (OCR), Sharp (images), @cherrystudio/mac-system-ocr (macOS) |
| **Build & test** | electron-vite, Jest, Playwright, Testing Library |
| **Voice / ML** | Python 3, PyTorch, torchaudio, Hugging Face Transformers (Wav2Vec2), soundfile, scipy, imageio-ffmpeg, datasets |

---

## Quick start

### Electron app (ScamShield)

```bash
npm install
npm run dev
```

- **Build:** `npm run build` (output in `out/`)
- **Package:** `npm run postinstall` then `npx electron-builder` for distributable (DMG/NSIS/AppImage)
- **Tests:** `npm test` (unit/integration), `npm run test:e2e` (Playwright)

### Voice classifier (Human vs AI)

```bash
pip install -r requirements.txt
python run_classifier.py
```

When prompted, type or paste the path to an audio file (MP3, WAV, FLAC, OGG, M4A). Or pass the file as an argument:

```bash
python run_classifier.py "C:\path\to\audio.mp3"
python predict_voice.py path/to/audio.mp3
```

**Optional (Windows):** Double-click `RUN_CLASSIFIER.bat` to run the interactive classifier.

---

## Project structure

```
├── index.html
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── requirements.txt
├── run_classifier.py          # Voice classifier launcher (interactive + CLI)
├── predict_voice.py            # Voice classifier launcher (CLI)
├── classify_audio_json.py     # JSON output for Electron app
├── RUN_CLASSIFIER.bat
├── DOWNLOAD_AUDIOMNIST.bat
├── src/                       # Electron app (main, renderer, preload, shared)
│   ├── main/
│   ├── preload/
│   ├── renderer/
│   └── shared/
├── voice/                     # Python voice classification package
│   ├── __init__.py
│   ├── voice_bot.py           # VoiceBot API
│   ├── huggingface_detector.py
│   ├── run_classifier.py
│   ├── predict_voice.py
│   ├── classify_audio_json.py
│   ├── download_audio_mnist.py
│   ├── train_voice_classifier.py
│   ├── train_with_my_data.py
│   ├── finetune_hf_voice.py
│   ├── example.py
│   ├── audio_utils.py
│   ├── sonar_detector.py
│   ├── create_sample_audio.py
│   ├── model/                 # Wav2Vec2 framework (training)
│   ├── sonar/                 # SONAR model (optional)
│   └── scripts/               # get_sonar_checkpoint.py
├── assets/icons/
├── tests/
└── data/                      # e.g. audio_mnist_human after download
```

---

## Electron app (ScamShield)

### Architecture

| Layer            | Path                | Role                                      |
|-----------------|---------------------|-------------------------------------------|
| Main process    | `src/main/index.ts` | App lifecycle, tray, windows, IPC         |
| Renderer        | `src/renderer/`     | React UI (dashboard, settings, alerts)     |
| Preload         | `src/preload/index.ts` | Bridge: `window.scamshield` API       |
| Shared          | `src/shared/`       | Types, IPC channels, constants            |

### Features

- **System tray:** Shield icon (green/yellow/red), menu: Dashboard, Toggle Monitoring, Settings, Quit
- **Settings:** Monitoring on/off, monitored apps, alert preferences (sound, quiet hours, focus mode), sensitivity, launch at startup, minimize/close to tray
- **Dashboard:** Recent alerts (filter, sort, export JSON/CSV), statistics, manual “Check URL”
- **Persistence:** electron-store for settings, window state, scam DB, alert history
- **Background monitoring:** Clipboard, browser URL (macOS), screen capture + OCR for email clients (Gmail, Outlook, Apple Mail)
- **Voice classification:** Electron can call the Python classifier (`classify_audio_json.py`) when Python and dependencies are installed

### macOS development (permissions)

- **Screen Recording:** Required for email OCR. Grant to Terminal/Cursor in System Settings → Privacy & Security → Screen Recording.
- **Accessibility:** For active-window detection. Add `[project]/node_modules/electron/dist/Electron.app` in System Settings → Privacy & Security → Accessibility.

### Running the built app

```bash
npm run build
npm run start
```

For a packaged app: `npx electron-builder --mac` (or `--win`). Output in `release/`.

### Debugging

```bash
npm run dev:verbose
```

---

## Voice classifier (Human vs AI)

Uses **[Gustking/wav2vec2-large-xlsr-deepfake-audio-classification](https://huggingface.co/Gustking/wav2vec2-large-xlsr-deepfake-audio-classification)** from Hugging Face (~93% accuracy on ASVspoof2019). No local training required; the model is downloaded on first run.

### Install

```bash
pip install -r requirements.txt
```

Installs `transformers`, `torch`, `torchaudio`, `soundfile`, `scipy`, `imageio-ffmpeg`. Optional: install **ffmpeg** (or `imageio-ffmpeg`) for all MP3 variants.

### Run

1. **Interactive:** `python run_classifier.py` — then enter file paths at the prompt (or `q` to quit).
2. **CLI with path:** `python run_classifier.py path/to/audio.mp3` or `python predict_voice.py path/to/audio.mp3`.
3. **Device:** Use GPU by default. Force CPU: `python run_classifier.py --device cpu path/to/audio.mp3`.

### Use in code

```python
from voice import VoiceBot

bot = VoiceBot()
result = bot.classify("call_recording.mp3")
# result["label"]       -> "human" | "ai"
# result["prob_human"]  -> 0.92
# result["prob_ai"]     -> 0.08

if bot.is_ai("suspicious.mp3"):
    print("Possible synthetic voice")
```

### Supported formats

WAV, MP3, FLAC, OGG, M4A, AAC. Audio is resampled to 16 kHz for the model.

### Training / finetuning

- **Finetune Hugging Face model (recommended):**
  ```bash
  python -m voice.train_with_my_data --human_dir ./human_audio --ai_dir ./ai_audio --output_dir ./my_model
  python -m voice.train_with_my_data --interactive
  ```
  Then: `python run_classifier.py --model ./my_model`

- **Legacy trainer (custom Wav2Vec2 + config.json):**
  ```bash
  python -m voice.train_voice_classifier --human_dir path/to/human --ai_dir path/to/ai --config config.json --epochs 20
  ```

### Human voice dataset (AudioMNIST)

Download human voice WAVs for training:

```bash
python -m voice.download_audio_mnist
```

Files are saved to `data/audio_mnist_human`. Or: `python -m voice.download_audio_mnist path/to/output_dir`. On Windows you can use `DOWNLOAD_AUDIOMNIST.bat`.

### PyTorch GPU (CUDA)

If you need a specific CUDA build (e.g. “No matching distribution” for cu121):

```powershell
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

Other options: `cu126`, `cu128`. Verify: `python -c "import torch; print('CUDA:', torch.cuda.is_available())"`.

---

## Assets

Place tray icons in `assets/icons/`:

- `tray-safe.png`, `tray-warning.png`, `tray-threat.png` (e.g. 16×16 or 32×32)
- `icon.icns` (macOS), `icon.ico` (Windows) for the built app

If tray PNGs are missing, the app uses a placeholder.

---

## Reference

- [Wav2Vec 2.0: A Framework for Self-Supervised Learning of Speech Representations](https://arxiv.org/abs/2006.11477)
- [Gustking/wav2vec2-large-xlsr-deepfake-audio-classification](https://huggingface.co/Gustking/wav2vec2-large-xlsr-deepfake-audio-classification)

## Author

- [Harunori Kawano](https://harunorikawano.github.io/)
- [Fan Siu Lung Drake](https://www.linkedin.com/in/siulungfan/)
- [Mok Sen Yi](https://www.linkedin.com/in/sen-yi-m-2a977528a/)
