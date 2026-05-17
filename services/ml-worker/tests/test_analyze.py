"""
Unit tests for the analyze helpers + the FastAPI endpoint.

The allin1 model itself is not exercised here (it is a several-hundred-MB
PyTorch download and slow to load); the endpoint test monkeypatches
analyze_bytes so the route can be validated without it. The Docker
image build runs `import allin1; allin1.download_models()` to confirm
the heavyweight path works at deploy time.

Run from services/ml-worker/:
    pytest -q
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ml_worker.analyze import (
    SuggestedSection,
    bars_for_span,
    octave_correct_bpm,
    safe_label,
    segments_to_sections,
)


def test_safe_label_canonical_passthrough() -> None:
    assert safe_label("intro") == "Intro"
    assert safe_label("verse") == "Verse"
    assert safe_label("chorus") == "Chorus"
    assert safe_label("bridge") == "Bridge"
    assert safe_label("outro") == "Outro"


def test_safe_label_handles_allin1_variants() -> None:
    assert safe_label("inst") == "Verse"
    assert safe_label("solo") == "Bridge"
    assert safe_label("instrumental") == "Verse"
    assert safe_label("break") == "Bridge"
    assert safe_label("end") == "Outro"
    assert safe_label("start") == "Intro"


def test_safe_label_unknown_defaults_to_verse() -> None:
    assert safe_label("post-chorus") == "Verse"
    assert safe_label("pre-chorus") == "Verse"
    assert safe_label("") == "Verse"
    assert safe_label("   ") == "Verse"


def test_safe_label_case_insensitive() -> None:
    assert safe_label("INTRO") == "Intro"
    assert safe_label("Chorus") == "Chorus"


def test_octave_correct_drops_double_time() -> None:
    assert octave_correct_bpm(240) == 120
    # 400 halves once to 200; 200 is at the ceiling (BPM_CEIL inclusive)
    # so the loop stops. Acceptable: fast techno source stays at 200.
    assert octave_correct_bpm(400) == 200


def test_octave_correct_doubles_half_time() -> None:
    assert octave_correct_bpm(45) == 90
    # 30 doubles once to 60; 60 is at the floor (BPM_FLOOR inclusive)
    # so the loop stops. Acceptable: ballad source stays at 60.
    assert octave_correct_bpm(30) == 60


def test_octave_correct_handles_garbage() -> None:
    assert octave_correct_bpm(0) == 120
    assert octave_correct_bpm(-50) == 120
    assert octave_correct_bpm(float("nan")) == 120


def test_bars_for_span_basic() -> None:
    # 8 seconds @ 120bpm = 8 / (4*60/120) = 8 / 2 = 4 bars
    assert bars_for_span(8.0, 120) == 4
    # 16 seconds @ 120bpm = 8 bars
    assert bars_for_span(16.0, 120) == 8
    # 1 second clamps to 1
    assert bars_for_span(1.0, 120) == 1
    # 0 seconds clamps to 1
    assert bars_for_span(0.0, 120) == 1


def test_segments_to_sections_with_dicts() -> None:
    segments = [
        {"start": 0.0, "end": 10.0, "label": "intro"},
        {"start": 10.0, "end": 30.0, "label": "verse"},
        {"start": 30.0, "end": 60.0, "label": "chorus"},
    ]
    result = segments_to_sections(segments, duration_sec=60.0, bpm=120)
    assert len(result) == 3
    assert result[0].name == "Intro"
    assert result[0].bars == 5  # 10s @ 120bpm = 5 bars
    assert result[1].name == "Verse"
    assert result[1].bars == 10  # 20s @ 120bpm = 10 bars
    assert result[2].name == "Chorus"
    assert result[2].bars == 15  # 30s @ 120bpm = 15 bars


def test_segments_to_sections_empty_returns_loop() -> None:
    result = segments_to_sections([], duration_sec=30.0, bpm=120)
    assert len(result) == 1
    assert result[0].name == "Loop"
    assert result[0].bars == 15


def test_segments_to_sections_maps_inst_and_solo() -> None:
    segments = [
        {"start": 0.0, "end": 10.0, "label": "inst"},
        {"start": 10.0, "end": 20.0, "label": "solo"},
    ]
    result = segments_to_sections(segments, duration_sec=20.0, bpm=120)
    assert result[0].name == "Verse"
    assert result[1].name == "Bridge"


def test_section_to_dict_shape() -> None:
    s = SuggestedSection(id="abc", name="Verse", bars=8)
    d = s.to_dict()
    assert d == {"id": "abc", "name": "Verse", "bars": 8}


# --- Endpoint tests ---


@pytest.fixture
def client() -> TestClient:
    from ml_worker import server

    server.WORKER_SHARED_SECRET = "test-secret"
    return TestClient(server.app)


def test_health_returns_ok(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "cuetrack-ml-worker"


def test_analyze_rejects_missing_secret(client: TestClient) -> None:
    res = client.post("/analyze", content=b"x", headers={"content-type": "audio/wav"})
    assert res.status_code == 401


def test_analyze_rejects_wrong_secret(client: TestClient) -> None:
    res = client.post(
        "/analyze",
        content=b"x",
        headers={"content-type": "audio/wav", "X-Worker-Secret": "wrong"},
    )
    assert res.status_code == 401


def test_analyze_rejects_unsupported_mime(client: TestClient) -> None:
    res = client.post(
        "/analyze",
        content=b"x",
        headers={"content-type": "audio/flac", "X-Worker-Secret": "test-secret"},
    )
    assert res.status_code == 415


def test_analyze_rejects_empty_body(client: TestClient) -> None:
    res = client.post(
        "/analyze",
        content=b"",
        headers={"content-type": "audio/wav", "X-Worker-Secret": "test-secret"},
    )
    assert res.status_code == 400


def test_analyze_calls_analyze_bytes_and_returns_result(client: TestClient) -> None:
    fake_result = {
        "bpm": 128,
        "duration": 180.0,
        "sampleRate": 44100,
        "suggestedSections": [
            {"id": "s1", "name": "Intro", "bars": 4},
            {"id": "s2", "name": "Chorus", "bars": 16},
        ],
        "diagnostics": {
            "modelMsLoad": 0,
            "modelMsInfer": 1500,
            "labelMix": {"intro": 1, "chorus": 1},
            "rawBpm": 128.0,
            "numSegments": 2,
        },
    }
    with patch("ml_worker.server.analyze_bytes", return_value=fake_result):
        res = client.post(
            "/analyze",
            content=b"fakebytes",
            headers={"content-type": "audio/wav", "X-Worker-Secret": "test-secret"},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["bpm"] == 128
    assert body["suggestedSections"][0]["name"] == "Intro"
    assert body["diagnostics"]["modelMsInfer"] == 1500


def test_analyze_returns_422_on_analyzer_exception(client: TestClient) -> None:
    with patch("ml_worker.server.analyze_bytes", side_effect=RuntimeError("decode boom")):
        res = client.post(
            "/analyze",
            content=b"badbytes",
            headers={"content-type": "audio/wav", "X-Worker-Secret": "test-secret"},
        )
    assert res.status_code == 422
    body = res.json()
    assert "decode boom" in body["detail"]
