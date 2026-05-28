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
# allin1 1.1.0 has two Linux install traps, both UNDECLARED as pip deps
# (allin1 only lists natten for macOS; on Linux you install it yourself):
#   - NATTEN: allin1 imports the OLD functional API (natten1dav, etc.) that
#     only exists in natten 0.14.x. PyPI's current natten (0.17+) removed it
#     and the old prebuilt wheels are gone, so build 0.14.6 from its sdist.
#   - madmom: its PyPI release doesn't build on modern Python; install from git.
# Both compile against torch, so install CPU torch 2.0.1 FIRST (this is a CPU
# service; pinning also avoids the multi-GB CUDA torch the resolver pulled).
# setuptools pinned <81: torch 2.0.1's cpp_extension (used to compile natten)
# imports pkg_resources, which setuptools removed in 81. 69.5.1 still ships it.
# MAX_JOBS caps natten's parallel C++ compile so it can't OOM the builder
# (the default Cloud Build worker died at ~28 min compiling it).
ENV MAX_JOBS=2
RUN pip install --no-cache-dir --upgrade pip wheel ninja cython "setuptools==69.5.1" \
    && pip install --no-cache-dir "numpy>=1.26,<2" \
    && pip install --no-cache-dir torch==2.0.1 torchaudio==2.0.2 \
         --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --no-build-isolation natten==0.14.6 \
    && pip install --no-cache-dir --no-build-isolation "git+https://github.com/CPJKU/madmom.git" \
    && pip install --no-cache-dir -r requirements.txt

# Fail the build LOUDLY if the import chain is broken. The previous version
# hid a broken import behind "|| echo skipped", which is how the missing
# madmom dep shipped a green build that 422'd on every real request.
RUN python -c "import allin1; print('allin1 import OK')"

# Pre-download model weights at build time so the first request is fast.
RUN python -c "import allin1; allin1.download_models()" || echo "model preload skipped (will lazy-load on first request)"

COPY ml_worker ./ml_worker
COPY tests ./tests

ENV PORT=8080
EXPOSE 8080

CMD ["uvicorn", "ml_worker.server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
