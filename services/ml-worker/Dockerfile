FROM python:3.11-slim

# ffmpeg for allin1's audio decoding (it shells out to ffmpeg for non-wav)
# Build essentials are needed for allin1's NATTEN dep on Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      build-essential \
      git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so the layer caches across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Pre-download the allin1 model weights at build time so the first
# request after deploy does not pay the ~hundred-MB download cost on
# the request path. The harmless dummy call triggers download.
RUN python -c "import allin1; allin1.download_models()" || echo "model preload skipped (will lazy-load on first request)"

COPY ml_worker ./ml_worker
COPY tests ./tests

ENV PORT=8080
EXPOSE 8080

CMD ["uvicorn", "ml_worker.server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
