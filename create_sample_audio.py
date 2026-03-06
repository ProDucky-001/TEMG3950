"""Create a short test WAV file (1 sec, 16 kHz) for trying the classifier."""
import os
import wave
import struct

# 1 second of 16 kHz, mono, silence (zeros)
sample_rate = 16000
duration_sec = 1
num_samples = sample_rate * duration_sec
out_path = os.path.join(os.path.dirname(__file__), "test_sample.wav")

with wave.open(out_path, "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)  # 16-bit
    wav.setframerate(sample_rate)
    for _ in range(num_samples):
        wav.writeframes(struct.pack("<h", 0))

print(f"Created: {out_path}")
