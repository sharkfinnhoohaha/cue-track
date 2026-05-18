"""
allin1-backed audio analysis.

Given uploaded audio bytes (MP3 or WAV), writes them to a temp file
(allin1's API is path-based) and calls the model. Maps the allin1
output (functional segments + tempo + beats + downbeats) into the
Cue Track AnalyzeResult shape that the Node worker also emits, so
the Vercel A/B router can route to either backend without UI changes.

Section labels: allin1 returns one of intro, verse, chorus, bridge,
outro, inst, solo. The Cue Track TTS_STRICT cache only knows the
prewarmed set (Intro, Verse, Chorus, Bridge, Outro, Loop), so we
map inst -> Verse and solo -> Bridge as defensive substitutions.
The user can rename on the /tracks/[id]/review screen anyway, and
the substitution can be revisited once the TTS prewarm script
covers the extras.

Output shape (matches services/audio-worker/lib/audio/analyze.ts):
  {
    "bpm": int,
    "duration": float,
    "sampleRate": int,
    "suggestedSections": [{"id": str, "name": str, "bars": int}, ...],
    "diagnostics": {
      "modelMsLoad": int,
      "modelMsInfer": int,
      "labelMix": {label: count},
    }
  }
"""

from __future__ import annotations

import os
import time
import uuid
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SAFE_LABEL_MAP = {
    "intro": "Intro",
    "verse": "Verse",
    "chorus": "Chorus",
    "bridge": "Bridge",
    "outro": "Outro",
    "inst": "Verse",
    "solo": "Bridge",
    "instrumental": "Verse",
    "break": "Bridge",
    "end": "Outro",
    "start": "Intro",
}

BEATS_PER_BAR = 4
BPM_FLOOR = 60
BPM_CEIL = 200


@dataclass
class SuggestedSection:
    id: str
    name: str
    bars: int

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "bars": self.bars}


def safe_label(raw: str) -> str:
    if not raw:
        return "Verse"
    key = raw.strip().lower()
    return SAFE_LABEL_MAP.get(key, "Verse")


def octave_correct_bpm(raw_bpm: float) -> int:
    if raw_bpm <= 0 or not (raw_bpm == raw_bpm):  # NaN check
        return 120
    bpm = float(raw_bpm)
    while bpm < BPM_FLOOR:
        bpm *= 2
    while bpm > BPM_CEIL:
        bpm /= 2
    return int(round(bpm))


def write_tempfile(audio_bytes: bytes, mime: str) -> Path:
    """allin1 wants a file path; write the upload to a temp file with
    the right extension so its decoder picks the right path."""
    ext = ".mp3" if mime in ("audio/mpeg", "audio/mp3") else ".wav"
    fd, path = tempfile.mkstemp(suffix=ext, prefix="cuetrack_ml_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(audio_bytes)
    except Exception:
        os.unlink(path)
        raise
    return Path(path)


def bars_for_span(span_sec: float, bpm: int) -> int:
    seconds_per_bar = (BEATS_PER_BAR * 60) / max(bpm, 30)
    return max(1, round(span_sec / seconds_per_bar))


def segments_to_sections(
    segments: list[Any],
    duration_sec: float,
    bpm: int,
) -> list[SuggestedSection]:
    """allin1's segments are objects (or dicts) with start, end, label.
    Convert to the SuggestedSection list the Vercel side expects."""
    out: list[SuggestedSection] = []
    if not segments:
        out.append(
            SuggestedSection(
                id=str(uuid.uuid4()),
                name="Loop",
                bars=bars_for_span(duration_sec, bpm),
            )
        )
        return out

    for seg in segments:
        start = float(getattr(seg, "start", seg["start"] if isinstance(seg, dict) else 0))
        end = float(getattr(seg, "end", seg["end"] if isinstance(seg, dict) else 0))
        label_raw = getattr(seg, "label", seg["label"] if isinstance(seg, dict) else "")
        span = max(0.0, end - start)
        out.append(
            SuggestedSection(
                id=str(uuid.uuid4()),
                name=safe_label(str(label_raw)),
                bars=bars_for_span(span, bpm),
            )
        )
    return out


def analyze_bytes(audio_bytes: bytes, mime: str) -> dict[str, Any]:
    """Top-level entrypoint called by the FastAPI route. Imports allin1
    lazily so test runs that mock the analyzer do not pay for the
    PyTorch import."""
    import allin1  # type: ignore

    t_load_start = time.time()
    # allin1 lazy-loads weights on first call; subsequent calls are warm.
    t_load_ms = int((time.time() - t_load_start) * 1000)

    audio_path = write_tempfile(audio_bytes, mime)
    try:
        t_infer_start = time.time()
        result = allin1.analyze(str(audio_path))
        t_infer_ms = int((time.time() - t_infer_start) * 1000)
    finally:
        try:
            os.unlink(audio_path)
        except FileNotFoundError:
            pass

    # allin1 result has: bpm, beats, downbeats, segments, path
    raw_bpm = float(getattr(result, "bpm", 120) or 120)
    bpm = octave_correct_bpm(raw_bpm)

    segments = getattr(result, "segments", []) or []
    # Try to infer duration from the last beat or last segment end.
    last_beat = getattr(result, "beats", None) or []
    last_segment_end = (
        max(
            (float(getattr(s, "end", s.get("end", 0) if isinstance(s, dict) else 0)) for s in segments),
            default=0.0,
        )
        if segments
        else 0.0
    )
    duration = max(
        last_segment_end,
        float(last_beat[-1]) if last_beat else 0.0,
        1.0,
    )

    sections = segments_to_sections(segments, duration, bpm)

    label_mix: dict[str, int] = {}
    for seg in segments:
        raw = getattr(seg, "label", seg.get("label") if isinstance(seg, dict) else "")
        key = str(raw).lower() or "unknown"
        label_mix[key] = label_mix.get(key, 0) + 1

    return {
        "bpm": bpm,
        "duration": duration,
        "sampleRate": 44100,
        "suggestedSections": [s.to_dict() for s in sections],
        "diagnostics": {
            "modelMsLoad": t_load_ms,
            "modelMsInfer": t_infer_ms,
            "labelMix": label_mix,
            "rawBpm": raw_bpm,
            "numSegments": len(segments),
        },
    }
