# PyTorch GPU Install (2025/2026)

**"No matching distribution found"** for cu121 = cu121 is deprecated. PyTorch now ships cu118, cu126, cu128.

**Python 3.10–3.14** required.

## Option 1: CUDA 11.8 (most compatible)

```powershell
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

## Option 2: CUDA 12.6

```powershell
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
```

## Option 3: CUDA 12.8 (newest GPUs)

```powershell
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

## Verify

```powershell
python -c "import torch; print('CUDA:', torch.cuda.is_available())"
```

Should print `CUDA: True`.
