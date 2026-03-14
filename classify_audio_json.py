"""
JSON output for voice classification (used by Electron app). Launcher; logic in voice.classify_audio_json.

Usage: python classify_audio_json.py <path_to_audio>
Prints one JSON line: {"label":"human"|"ai","prob_human":float,"prob_ai":float,"checkpoint_loaded":bool}
"""
import importlib.util
import os
import sys
import types

# Stub torchcodec/torchaudio before any voice import (same as run_classifier.py).
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voice.classify_audio_json import main

if __name__ == "__main__":
    main()
