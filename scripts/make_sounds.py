"""Writes the settlement clips, synthesized, 16-bit mono WAV: a coin for a win, a sad trombone for a loss."""

import math
import struct
import sys
import wave
from pathlib import Path

RATE = 22050


def tone(freq_hz: float, length_s: float, decay: float, harmonics: tuple[float, ...], vibrato_hz: float = 0.0) -> list[float]:
    samples = []
    phase = 0.0
    for i in range(int(RATE * length_s)):
        t = i / RATE
        wobble = 1 + 0.03 * math.sin(2 * math.pi * vibrato_hz * t) if vibrato_hz else 1
        phase += 2 * math.pi * freq_hz * wobble / RATE
        body = sum(weight * math.sin((n + 1) * phase) for n, weight in enumerate(harmonics))
        attack = min(1.0, t / 0.01)
        samples.append(attack * math.exp(-t * decay) * body)
    return samples


def coin() -> list[float]:
    bright = (1.0, 0.3, 0.15)
    return tone(988, 0.08, 20, bright) + tone(1319, 0.45, 7, bright)


def trombone() -> list[float]:
    brass = (1.0, 0.6, 0.45, 0.3, 0.2, 0.1)
    gap = [0.0] * int(RATE * 0.05)
    notes = [(293.7, 0.32, 3, 0.0), (277.2, 0.32, 3, 0.0), (261.6, 0.32, 3, 0.0), (246.9, 1.1, 1.6, 5.0)]
    clip: list[float] = []
    for freq, length, decay, vibrato in notes:
        clip += tone(freq, length, decay, brass, vibrato) + gap
    return clip


def write(path: Path, clip: list[float]) -> None:
    peak = max(abs(s) for s in clip)
    frames = b"".join(struct.pack("<h", int(30000 * s / peak)) for s in clip)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(frames)


def main(directory: str) -> None:
    folder = Path(directory)
    write(folder / "coin.wav", coin())
    write(folder / "trombone.wav", trombone())


if __name__ == "__main__":
    main(sys.argv[1])
