"""
Interactive runner: enter an audio file path and see human vs AI classification.
Uses GPU (CUDA) by default when available.

Run:  python run_classifier.py          # GPU if available
      python run_classifier.py --device cpu
Then type or paste the path to an MP3/WAV/etc. file when prompted.
"""

import argparse
import importlib.util
import os
import sys
import types

# Stub torchcodec so its DLLs (libtorchcodec_core*.dll) are never loaded. Use plain
# ModuleType with explicit __file__ (string) so inspect.getsourcefile never sees a module.
def _tc_dummy(name):
    m = types.ModuleType(name)
    m.__spec__ = importlib.util.spec_from_loader(name, loader=None, is_package=False)
    m.__file__ = f"<stub {name}>"
    return m

_tc_ops = _tc_dummy("torchcodec._core.ops")
_tc_ops.load_torchcodec_shared_libraries = lambda *a, **k: None
_tc_core = _tc_dummy("torchcodec._core")
_tc_core.ops = _tc_ops
_tc_decoders = _tc_dummy("torchcodec.decoders")
# Stub classes torchaudio may look up (no-op; we load audio with soundfile)
class _TcStubDecoder:
    def __init__(self, *args, **kwargs):
        pass
_tc_decoders.AudioDecoder = _TcStubDecoder
_tc_decoders.VideoDecoder = _TcStubDecoder

_tc = types.ModuleType("torchcodec")
_tc.__spec__ = importlib.util.spec_from_loader("torchcodec", loader=None, is_package=True)
_tc.__file__ = "<stub torchcodec>"
_tc.__package__ = "torchcodec"
_tc._core = _tc_core
_tc.decoders = _tc_decoders

sys.modules["torchcodec"] = _tc
sys.modules["torchcodec._core"] = _tc_core
sys.modules["torchcodec._core.ops"] = _tc_ops
sys.modules["torchcodec.decoders"] = _tc_decoders

# Stub torchaudio so the classifier never uses it (audio is loaded with soundfile+scipy).
if "torchaudio" not in sys.modules:
    def _torchaudio_load_stub(*args, **kwargs):
        raise ImportError("torchaudio is stubbed to avoid torchcodec; audio is loaded with soundfile+scipy.")
    _stub = types.ModuleType("torchaudio")
    _stub.__version__ = "2.0.0"
    _stub.__spec__ = importlib.util.spec_from_loader("torchaudio", loader=None, is_package=True)
    _stub.load = _torchaudio_load_stub
    _stub.transforms = types.ModuleType("torchaudio.transforms")
    _stub.transforms.__spec__ = importlib.util.spec_from_loader("torchaudio.transforms", loader=None, is_package=False)
    sys.modules["torchaudio"] = _stub
    sys.modules["torchaudio.transforms"] = _stub.transforms

# Fail fast if transformers is missing
try:
    import transformers  # noqa: F401
except ModuleNotFoundError:
    print("transformers is not installed. Install with:")
    print("  pip install -r requirements.txt")
    sys.exit(1)

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voice_bot import VoiceBot


def _parse_args():
    p = argparse.ArgumentParser(description="Voice classifier — Human vs AI (Gustking Wav2Vec2)")
    p.add_argument("audio", nargs="?", help="Path to audio file (optional; if omitted, interactive)")
    p.add_argument("--device", choices=("cuda", "cpu"), default="cuda",
                   help="Device: cuda (default) or cpu")
    p.add_argument("--model", type=str, default=None,
                   help="Path to finetuned model dir or Hugging Face model id (default: Gustking)")
    return p.parse_args()


def main():
    args = _parse_args()
    import torch
    # Prevent torch.audio from loading the real torchaudio (and torchcodec DLLs).
    # Also stub torch.audio submodule so pipeline's import_module("torch.audio") gets stub.
    if "torchaudio" in sys.modules:
        _ta_stub = sys.modules["torchaudio"]
        torch.audio = _ta_stub
        sys.modules["torch.audio"] = _ta_stub
        sys.modules["torch.audio.transforms"] = getattr(_ta_stub, "transforms", _ta_stub)
    # Prefer GPU when --device cuda (default); fall back to CPU only if CUDA unavailable
    want_gpu = args.device == "cuda"
    if want_gpu and not torch.cuda.is_available():
        device = "cpu"
        print("Note: CUDA not available, using CPU. Install PyTorch with CUDA for GPU.")
    else:
        device = "cuda" if want_gpu else "cpu"

    print("=" * 50)
    print("  Voice classifier — Human vs AI")
    print("=" * 50)
    print("Supported: MP3, WAV, FLAC, OGG, M4A")
    if device == "cuda":
        print("Device: GPU (cuda)")
    else:
        print("Device: CPU")
    print()

    bot = VoiceBot(device=device, model_id=args.model)

    # If file path given as argument, classify it and exit
    if args.audio:
        path = args.audio.strip().strip('"').strip("'")
        if not os.path.isfile(path):
            print(f"File not found: {path}")
            sys.exit(1)
        result = bot.classify(path)
        label = "Human" if result["label"] == "human" else "AI-generated"
        print(f"File: {path}")
        print(f"Prediction: {label}")
        print(f"  P(Human): {result['prob_human']:.1%}")
        print(f"  P(AI):    {result['prob_ai']:.1%}")
        return

    print("Enter path to an audio file (or 'q' to quit).")
    print()

    while True:
        try:
            path = input("File path: ").strip().strip('"').strip("'")
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break

        if not path:
            continue
        if path.lower() == "q":
            print("Bye.")
            break

        if not os.path.isfile(path):
            print(f"  File not found: {path}\n")
            continue

        try:
            result = bot.classify(path)
            label = "Human" if result["label"] == "human" else "AI-generated"
            print()
            print("  Result:")
            print(f"    Prediction: {label}")
            print(f"    P(Human):   {result['prob_human']:.1%}")
            print(f"    P(AI):      {result['prob_ai']:.1%}")
            print()
        except Exception as e:
            print(f"  Error: {e}\n")


if __name__ == "__main__":
    main()
