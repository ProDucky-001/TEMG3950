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

### AI vs Human Voice Classification (Scam Copilot)

Differentiate AI-generated (synthetic/TTS) voice from real human voice for scam detection:

**1. Train** on labeled data (human and AI voice samples):
```bash
# Using separate directories
python train_voice_classifier.py --human_dir path/to/human_audio --ai_dir path/to/ai_audio --epochs 20

# Using a CSV file (columns: path, label where 0=human, 1=AI)
python train_voice_classifier.py --data_csv path/to/labels.csv --epochs 20
```

**2. Predict** on new audio:
```bash
python predict_voice.py --audio path/to/audio.wav --checkpoint checkpoints/voice_classifier.pt
```

**Data requirements:** 16 kHz audio (wav, mp3, flac). More diverse samples (different TTS systems, speakers) improve generalization.
 
## Code Style
I follow [PEP-8](https://www.python.org/dev/peps/pep-0008/) for code style. Especially the style of docstrings is important to generate documentation.  
  
## Reference
- [wav2vec 2.0: A Framework for Self-Supervised Learning of Speech Representations](https://arxiv.org/abs/2006.11477)
  
## Author
  
* [Harunori Kawano](https://harunorikawano.github.io/)