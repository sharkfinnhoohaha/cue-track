# Cue Track ML Worker — Deploy

Pretrained allin1 section detector (CMU 2023, MIT-licensed) wrapped in
FastAPI. Sibling to `services/audio-worker` (the Node service that
hosts /render and /analyze).

## What this service does

`POST /analyze` takes raw audio bytes (MP3 or WAV, ≤ 52 MB) and returns
a Cue Track AnalyzeResult: detected BPM, duration, sample rate, and a
list of `suggestedSections` with names mapped to the Cue Track TTS
prewarm set (Intro, Verse, Chorus, Bridge, Outro, Loop).

Identical response shape to `services/audio-worker`'s `POST /analyze`
so the Vercel-side A/B router can route to either backend by URL.

## First-time deploy to Cloud Run

Prereqs: gcloud SDK authed as the same account that owns
`cuetrack-audio-worker` (project `overlook-works`, region `us-east1`).

```
# 1. Generate a worker secret (mode 600 in your home dir)
openssl rand -hex 32 > ~/.cuetrack-ml-worker-secret
chmod 600 ~/.cuetrack-ml-worker-secret

# 2. Build + push + deploy. --no-cpu-throttling lets the model stay
#    warm during a long request. --memory 4Gi covers the PyTorch +
#    allin1 model footprint. --timeout 300s gives long uploads room.
#    --min-instances 0 keeps cost flat at the Finn-affordability target;
#    async + polling on the Vercel side absorbs the cold start.
SECRET=$(cat ~/.cuetrack-ml-worker-secret)
gcloud run deploy cuetrack-ml-worker \
  --source services/ml-worker \
  --region us-east1 \
  --project overlook-works \
  --port 8080 \
  --memory 4Gi \
  --cpu 2 \
  --timeout 300s \
  --min-instances 0 \
  --max-instances 5 \
  --no-cpu-throttling \
  --allow-unauthenticated \
  --set-env-vars="WORKER_SHARED_SECRET=$SECRET"
```

Note the deploy URL it returns; that becomes `ML_WORKER_URL` on Vercel.

## After deploy

1. Set Vercel env vars:
   - `ML_WORKER_URL` = the Cloud Run URL from above
   - `ML_WORKER_SHARED_SECRET` = the same secret you wrote to disk
   - `ANALYZE_AB_SPLIT_PERCENT` = `0` initially (ML disabled; ramp via
     A/B router from PR-D when ready)

2. Smoke-test:
   ```
   curl https://cuetrack-ml-worker-XXX.us-east1.run.app/health
   # -> {"status":"ok", ...}
   ```

3. Analyze a real song to warm the model:
   ```
   curl -X POST "https://cuetrack-ml-worker-XXX.us-east1.run.app/analyze" \
     -H "X-Worker-Secret: $(cat ~/.cuetrack-ml-worker-secret)" \
     -H "Content-Type: audio/wav" \
     --data-binary @some-song.wav
   ```
   First call after cold start can take 30-90s (model download +
   PyTorch import + inference). Subsequent calls on the same instance
   are faster (~5-15s for a 4-min song).

## Local development

```
cd services/ml-worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Note: allin1 pulls PyTorch (~2 GB on macOS). Worth it once;
# subsequent activates are fast.

# Run tests (mocks allin1, so installing it is not strictly required
# for the unit suite — but the model is required to actually analyze)
pytest -q

# Run server locally
WORKER_SHARED_SECRET=devsecret uvicorn ml_worker.server:app --reload --port 8080
```

## Tuning knobs

- `--min-instances 1` ($25-40/mo) would keep one instance warm. Finn
  opted to skip this; the async + polling pattern on the Vercel side
  hides the cold start from user UX, and the cost saving wins.
- `--cpu 4 --memory 8Gi` would speed inference but is overkill for
  4-min songs at MVP traffic.
- `--max-instances` is the budget guard. 5 is plenty for V1; raise
  when traffic warrants.

## What does NOT live here

- The Vercel route that calls this service: see
  `src/lib/analyze-jobs.ts` and the A/B router in PR-D.
- The Node worker (Foote + template detectors): see
  `services/audio-worker/`.
- The Cue Track audio engine itself (renders the cue tracks):
  `src/lib/audio/`.
