<div align="center">
    <img src="https://github.com/HarunoriKawano/Wav2vec2.0/blob/main/docs/title.png" width="800px">
</div>

<br/>
 <div align="center">
    <a href="https://arxiv.org/abs/2006.11477">
        <img src="https://img.shields.io/badge/model-wav2vec2.0-orange"> 
    </a>
    <a href="https://github.com/pytorch/pytorch">
        <img src="https://img.shields.io/badge/framework-PyTorch-red"> 
    </a>
    <a href="https://github.com/HarunoriKawano/Wav2vec2.0/blob/main/LICENSE">
        <img src="https://img.shields.io/badge/license-Apache--2.0-informational"> 
    </a>
    <a href="https://www.python.org/dev/peps/pep-0008/">
        <img src="https://img.shields.io/badge/codestyle-PEP--8-informational"> 
    </a>
    <a href="https://github.com/HarunoriKawano/Wav2vec2.0">
        <img src="https://img.shields.io/badge/build-passing-success"> 
    </a>
</div>

***

## Overview
<div align="center">
    <img src="https://github.com/HarunoriKawano/Wav2vec2.0/blob/main/docs/overview.png" width="600px" >
</div>

## Installation
  
```
pip install -r requirements.txt  
```

## Usage

Described in example.py
```
python example.py
```

### Voice Bot: Human vs AI Voice (Scam Copilot)

**Integrated bot** that distinguishes **any MP3** (or WAV/FLAC/OGG/M4A) as human or AI-generated voice.

**Use in your app:**
```python
from voice_bot import VoiceBot

bot = VoiceBot()  # optional: checkpoint_path=..., config_path=...
result = bot.classify("call_recording.mp3")
# result["label"]     -> "human" | "ai"
# result["prob_human"] -> 0.92
# result["prob_ai"]    -> 0.08

if bot.is_ai("suspicious.mp3"):
    print("Possible synthetic voice")
```

**CLI** (any audio format, including any form of MP3):
```bash
python predict_voice.py path/to/audio.mp3
python predict_voice.py --audio recording.mp3 --checkpoint checkpoints/voice_classifier.pt

# Or run the bot module directly
python -m voice_bot recording.mp3
```

**1. Train** on labeled data (human and AI voice samples):
```bash
python train_voice_classifier.py --human_dir path/to/human_audio --ai_dir path/to/ai_audio --epochs 20
python train_voice_classifier.py --data_csv path/to/labels.csv --epochs 20
```

**2. Predict** on new audio (MP3, WAV, FLAC, OGG, M4A supported; ffmpeg on PATH enables all MP3 variants if torchaudio fails).
 
## Code Style
I follow [PEP-8](https://www.python.org/dev/peps/pep-0008/) for code style. Especially the style of docstrings is important to generate documentation.  
  
## Reference
- [wav2vec 2.0: A Framework for Self-Supervised Learning of Speech Representations](https://arxiv.org/abs/2006.11477)
  
## Author
  
* [Harunori Kawano](https://harunorikawano.github.io/)