"""
FastAPI server for the Cue Track ML worker.

Endpoints:
  POST /analyze    Decode + analyze audio bytes, return AnalyzeResult JSON
  GET  /health     Liveness probe (does NOT load allin1; that happens on
                   first /analyze call to keep cold-start startup time low)

Auth: shared secret in X-Worker-Secret header. The Vercel side reads
ML_WORKER_SHARED_SECRET to construct it; this worker reads the same
value from WORKER_SHARED_SECRET.

The audio body comes in as raw bytes with Content-Type set to
audio/mpeg or audio/wav (matching the Node worker's /analyze contract,
so the same Vercel route can dispatch to either backend).
"""

from __future__ import annotations

import logging
import os
import time

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .analyze import analyze_bytes


logger = logging.getLogger("cuetrack.ml_worker")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Cue Track ML Worker", version="0.1.0")

WORKER_SHARED_SECRET = os.environ.get("WORKER_SHARED_SECRET")
MAX_BYTES = 52 * 1024 * 1024  # 52 MB
ACCEPTED_MIMES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/vnd.wave",
}


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "cuetrack-ml-worker",
        "secretConfigured": bool(WORKER_SHARED_SECRET),
    }


def _normalize_mime(mime: str | None) -> str | None:
    if not mime:
        return None
    base = mime.lower().split(";")[0].strip()
    return base if base in ACCEPTED_MIMES else None


@app.post("/analyze")
async def analyze_endpoint(
    request: Request,
    x_worker_secret: str | None = Header(default=None, alias="X-Worker-Secret"),
) -> JSONResponse:
    if not WORKER_SHARED_SECRET:
        logger.error("WORKER_SHARED_SECRET not configured; rejecting request")
        raise HTTPException(status_code=503, detail="Worker not configured")

    if x_worker_secret != WORKER_SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    mime = _normalize_mime(request.headers.get("content-type"))
    if not mime:
        raise HTTPException(
            status_code=415,
            detail=f"Expected audio/mpeg or audio/wav, got: {request.headers.get('content-type') or '(none)'}",
        )

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="empty_body")
    if len(body) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"payload exceeds {MAX_BYTES} bytes")

    started = time.time()
    try:
        result = analyze_bytes(body, mime)
    except Exception as err:
        logger.exception("Analyze failed")
        raise HTTPException(status_code=422, detail=str(err)) from err

    elapsed_ms = int((time.time() - started) * 1000)
    logger.info(
        "Analyzed %d bytes (%s) in %dms: bpm=%s sections=%d",
        len(body),
        mime,
        elapsed_ms,
        result.get("bpm"),
        len(result.get("suggestedSections", [])),
    )

    return JSONResponse(content=result, status_code=200)
