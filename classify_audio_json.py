"""
Output-only JSON for voice classification. Used by the Electron app.

Usage: python classify_audio_json.py <path_to_audio>
Prints one JSON object to stdout: {"label":"human"|"ai","prob_human":float,"prob_ai":float,"checkpoint_loaded":bool}

Uses the same Gustking Wav2Vec2 model as run_classifier.py (voice_bot + huggingface_detector).
"""
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)

import importlib.util
import json
import sys
import types

# Stub torchcodec/torchaudio so DLLs are never loaded when the app runs this script
# (same as run_classifier.py; audio is loaded with soundfile+scipy in huggingface_detector).
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

if "torchaudio" not in sys.modules:
    def _torchaudio_load_stub(*args, **kwargs):
        raise ImportError("torchaudio is stubbed; audio is loaded with soundfile+scipy.")
    _stub = types.ModuleType("torchaudio")
    _stub.__version__ = "2.0.0"
    _stub.__spec__ = importlib.util.spec_from_loader("torchaudio", loader=None, is_package=True)
    _stub.load = _torchaudio_load_stub
    _stub.transforms = types.ModuleType("torchaudio.transforms")
    _stub.transforms.__spec__ = importlib.util.spec_from_loader("torchaudio.transforms", loader=None, is_package=False)
    sys.modules["torchaudio"] = _stub
    sys.modules["torchaudio.transforms"] = _stub.transforms


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio path"}), flush=True)
        sys.exit(1)
    path = sys.argv[1].strip().strip('"').strip("'")
    try:
        from voice_bot import VoiceBot
        bot = VoiceBot()
        result = bot.classify(path)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e), "label": "error"}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
