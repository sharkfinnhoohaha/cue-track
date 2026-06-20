#!/usr/bin/env bash
#
# Cue Track — one-command section-detection setup.
#
# Run it from the repo root:
#
#     bash eval/sections/setup.sh
#
# It does everything that can be automated: installs deps, (optionally) deploys
# the allin1 model to Cloud Run, auto-labels your songs with it, and prints a
# baseline of how the fast detector compares. The ONLY things it needs from you:
#   1. your songs in corpus/audio/
#   2. gcloud installed + logged in (one time) — or an existing ML_WORKER_URL
#
# Safe to re-run: it skips steps that are already done.

set -euo pipefail

CORPUS_DIR="corpus"
AUDIO_DIR="$CORPUS_DIR/audio"
GCP_PROJECT="overlook-works"
GCP_REGION="us-east1"
SERVICE="cuetrack-ml-worker"
SECRET_FILE="$HOME/.cuetrack-ml-worker-secret"

bold()  { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }
ok()    { printf "\033[32m  ✓ %s\033[0m\n" "$1"; }
warn()  { printf "\033[33m  ! %s\033[0m\n" "$1"; }
die()   { printf "\n\033[31m✗ %s\033[0m\n\n" "$1"; exit 1; }

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# ── 1. Basic tools ──────────────────────────────────────────────────────────
bold "Checking tools"
command -v node >/dev/null || die "Node not found. Install Node 22+ from https://nodejs.org and re-run."
command -v npm  >/dev/null || die "npm not found (it ships with Node)."
ok "node $(node --version)"

# ── 2. Your audio ───────────────────────────────────────────────────────────
bold "Looking for your songs in $AUDIO_DIR"
mkdir -p "$AUDIO_DIR"
AUDIO_COUNT=$(find "$AUDIO_DIR" -maxdepth 1 -type f \( -iname '*.mp3' -o -iname '*.wav' -o -iname '*.m4a' -o -iname '*.flac' -o -iname '*.ogg' \) | wc -l | tr -d ' ')
if [ "$AUDIO_COUNT" -eq 0 ]; then
  die "No audio found. Put 25–50 songs (mp3/wav) in:  $AUDIO_DIR  then re-run this script."
fi
ok "$AUDIO_COUNT songs found"

# ── 3. Dependencies ─────────────────────────────────────────────────────────
bold "Installing dependencies (one time, ~1 min)"
npm install --no-fund --no-audit >/dev/null 2>&1 || npm install
( cd services/audio-worker && npm install --no-fund --no-audit >/dev/null 2>&1 || npm install )
ok "installed"

# ── 4. allin1 model (the auto-labeler) ──────────────────────────────────────
bold "Setting up the allin1 model"
if [ -n "${ML_WORKER_URL:-}" ] && [ -n "${ML_WORKER_SHARED_SECRET:-}" ]; then
  ok "already configured ($ML_WORKER_URL)"
elif command -v gcloud >/dev/null; then
  if ! gcloud auth print-access-token >/dev/null 2>&1; then
    die "gcloud is installed but not logged in. Run:  gcloud auth login   then re-run this script."
  fi
  echo
  warn "The allin1 model isn't deployed yet. Deploying it to Cloud Run takes ~30 min"
  warn "the first time and creates billable resources in project '$GCP_PROJECT'."
  read -r -p "  Deploy it now? [y/N] " REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    die "Skipped. Re-run when you're ready, or set ML_WORKER_URL + ML_WORKER_SHARED_SECRET if it's already deployed elsewhere."
  fi
  [ -f "$SECRET_FILE" ] || { openssl rand -hex 32 > "$SECRET_FILE"; chmod 600 "$SECRET_FILE"; }
  SECRET="$(cat "$SECRET_FILE")"
  bold "Deploying allin1 (grab a coffee — first build is slow)"
  URL="$(gcloud run deploy "$SERVICE" \
      --source services/ml-worker --region "$GCP_REGION" --project "$GCP_PROJECT" \
      --port 8080 --memory 4Gi --cpu 2 --timeout 300s \
      --min-instances 0 --max-instances 5 --no-cpu-throttling --allow-unauthenticated \
      --set-env-vars="WORKER_SHARED_SECRET=$SECRET" --format='value(status.url)')"
  export ML_WORKER_URL="$URL"
  export ML_WORKER_SHARED_SECRET="$SECRET"
  ok "deployed: $URL"
  echo
  warn "Save these for next time / for Vercel:"
  echo "      ML_WORKER_URL=$URL"
  echo "      ML_WORKER_SHARED_SECRET=$SECRET"
else
  die "Need allin1 to label your songs. Either:
    • install the gcloud CLI + run 'gcloud auth login', then re-run this script (it'll deploy allin1), or
    • if it's already deployed, set ML_WORKER_URL and ML_WORKER_SHARED_SECRET and re-run."
fi

# ── 5. Auto-label every song (no manual labeling) ───────────────────────────
bold "Auto-labeling your songs with allin1 (cold start can take a minute)"
npx tsx eval/sections/label-with-teacher.ts --audio "$AUDIO_DIR" --out "$CORPUS_DIR"

# ── 6. Baseline: how the fast detector compares ─────────────────────────────
bold "Baseline — fast (Foote) detector vs allin1 on your songs"
npx tsx eval/sections/run-eval.ts --corpus "$CORPUS_DIR" --split dev || warn "Foote baseline hit an error (non-fatal); allin1 labels are still written."

# ── Done ────────────────────────────────────────────────────────────────────
bold "Done ✅"
cat <<'EOF'
  Your songs are now labeled and a baseline is printed above.

  You're set up. Two ways to go from here:

  • Hand it to an autonomous agent (recommended): open this repo in Antigravity
    (or Claude Code) ON THIS MACHINE and give it:

        Read eval/sections/HANDOFF.md and execute it. Drive section detection
        to ≥90% honestly, keep tsc + tests green, only edit the detector + eval
        tooling, and stop to involve me at the checkpoints it names.

  • Or just paste me (Claude) the numbers printed above and I'll tell you the
    next change to make.

  Optional, for a fully trustworthy 90%: hand-correct ~8 songs later — the agent
  will tell you exactly which ones. You do NOT need to do that to get started.
EOF
