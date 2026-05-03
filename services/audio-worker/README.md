# Cue Track Audio Worker

Standalone HTTP service for rendering click and cue tracks. Designed for Google Cloud Run but runs anywhere Node.js does.

The Next.js app calls this service when `AUDIO_WORKER_URL` is set in its environment. Without that env var, the Next.js app runs the audio engine in-process (which is fine for V1 on Vercel Hobby up to ~1,000 tracks/month).

## When to use this service

- Vercel Hobby's 10s function timeout is failing >5% of generations
- You want to keep Vercel on the cheaper Hobby tier and offload heavy work to GCP credits
- You need to support very long songs (10+ minutes) that exceed even Vercel Pro's 60s limit
- You want predictable per-render cost instead of a flat Vercel Pro subscription

## Endpoints

### `GET /health`

Health check. Returns `{ status, uptime, nodeVersion, bucket, secretConfigured }`.

### `POST /render`

Render a track and return base64 audio inline.

```http
POST /render
X-Worker-Secret: <shared_secret>
Content-Type: application/json

{
  "trackId": "uuid",
  "spec": { /* SongSpec */ }
}
```

Response:
```json
{
  "trackId": "uuid",
  "duration": 58.0,
  "format": "wav",
  "fullTrackBase64": "...",
  "previewBase64": "..."
}
```

Use this when you want the bytes back to store wherever you choose. Convenient but inflates JSON size 33% for base64 encoding.

### `POST /render-to-gcs`

Render a track and upload directly to Cloud Storage. Returns paths instead of bytes.

Same request shape. Response:
```json
{
  "trackId": "uuid",
  "duration": 58.0,
  "format": "wav",
  "fullPath": "tracks/uuid/full.wav",
  "previewPath": "tracks/uuid/preview.wav",
  "fullSizeBytes": 10231244,
  "previewSizeBytes": 2646044
}
```

Requires `GCS_BUCKET_NAME` environment variable. The service account running the worker needs `roles/storage.objectAdmin` on the bucket.

This is the production-recommended endpoint. Vercel never touches the audio bytes; the Next.js app stores the GCS paths in the database and generates signed URLs at download time.

## Auth

All `POST` endpoints require an `X-Worker-Secret` header matching the `WORKER_SHARED_SECRET` env var. If the env var is unset, all requests are rejected.

For higher security at scale, switch to IAM-authenticated Cloud Run invocations using a Vercel-side service account. Shared secret is fine for V1.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `WORKER_SHARED_SECRET` | yes | Random string (>=32 chars). Match this exactly in the Next.js app's `WORKER_SHARED_SECRET` env var. |
| `GOOGLE_TTS_API_KEY` | for TTS | API key for Cloud Text-to-Speech. Alternative: `GOOGLE_APPLICATION_CREDENTIALS` JSON file. |
| `GCS_BUCKET_NAME` | for `/render-to-gcs` | Cloud Storage bucket name. |
| `PORT` | no | Defaults to 8080. Cloud Run sets this automatically. |

## Deploy to Cloud Run

### Prerequisites

- `gcloud` CLI installed and authenticated against the project with $300 credits
- Text-to-Speech API and Cloud Storage API enabled in that project
- A service account with `roles/texttospeech.user` and `roles/storage.objectAdmin`

### One-shot deploy

From this directory (`services/audio-worker/`):

```bash
gcloud run deploy cuetrack-audio-worker \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 4 \
  --set-env-vars "WORKER_SHARED_SECRET=$(openssl rand -base64 32)" \
  --set-env-vars "GOOGLE_TTS_API_KEY=$GOOGLE_TTS_API_KEY" \
  --set-env-vars "GCS_BUCKET_NAME=cuetrack-audio-prod"
```

The `--source .` flag tells Cloud Run to build the container from this directory using the Dockerfile.

### Two-step deploy (build then deploy)

If you want to build the image once and deploy multiple times (preview, staging, prod):

```bash
# Build and push
gcloud builds submit --tag gcr.io/$PROJECT_ID/cuetrack-audio-worker

# Deploy
gcloud run deploy cuetrack-audio-worker \
  --image gcr.io/$PROJECT_ID/cuetrack-audio-worker \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 4
```

### Cloud Run flag rationale

- `--memory 1Gi`: audio buffers can hit 50MB+ for long songs; 1 GiB gives ample headroom
- `--cpu 1`: 1 vCPU is enough; this isn't CPU-bound, it's TTS-API-bound
- `--timeout 300`: 5 minutes max per request; far more than any real song needs
- `--min-instances 0`: scale to zero when idle, no baseline cost
- `--max-instances 10`: cap on bills. Raise as you scale.
- `--concurrency 4`: each instance handles up to 4 simultaneous renders. Lower than default 80 because the audio engine holds large buffers in memory.

## Wire up to the Next.js app

After deploying, take the Cloud Run URL (e.g. `https://cuetrack-audio-worker-xxx-uc.a.run.app`) and set these env vars in Vercel:

```
AUDIO_WORKER_URL=https://cuetrack-audio-worker-xxx-uc.a.run.app
WORKER_SHARED_SECRET=<same value used in Cloud Run deploy>
```

The Next.js app's `src/app/api/tracks/generate/route.ts` should be updated to check `AUDIO_WORKER_URL` and call the worker via fetch when set. The current route runs the engine locally; the worker integration is documented but not yet wired.

## Local development

```bash
cd services/audio-worker
npm install

# Run smoke test (no API key needed; uses fallback TTS tones)
npm test

# Run the server
WORKER_SHARED_SECRET=dev-secret npm run dev

# In another terminal:
curl -X POST http://localhost:8080/render \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: dev-secret" \
  -d '{"trackId":"test","spec":{"title":"Test","bpm":120,"timeSignature":{"beats":4,"subdivision":4},"sections":[{"id":"1","name":"Intro","bars":4},{"id":"2","name":"Verse","bars":8}],"voiceId":"en-US-Studio-M","clickSound":"classic","format":"wav","enableCountIn":true,"enableSectionAnnounce":true,"enableBarCountdown":false,"countInBars":1}}'
```

## Cost expectations

For a typical render (4-second compute time, 1 vCPU, 1 GiB memory):

- Cloud Run compute: ~$0.0001 per render
- TTS API: free for first 4M characters/month, then $4 per 1M
- Cloud Storage: ~$0.0001 per render (3MB stored, $0.020/GB/mo)

At 1,000 tracks/month: under $1/mo total infrastructure (excluding Stripe fees).

At 10,000 tracks/month: around $10/mo for compute + storage; TTS becomes the variable cost (~$60-80/mo for 20M characters).

## Operational notes

- The audio engine has a TTS cache keyed on `voiceId:text`. Within a single Cloud Run instance, repeated section names ("Verse", "Chorus") only hit the TTS API once. This cache evaporates when the instance scales down to zero.
- For better cache utilization, consider keeping `--min-instances 1` (~$8/mo for an always-on f1-micro-equivalent instance).
- The fallback tone synthesis kicks in automatically if `GOOGLE_TTS_API_KEY` is missing or the API call fails. Track these in your error monitoring as they indicate a config issue, not a real fallback you want in production.
- `lamejs` (MP3 encoder) is the slowest part of the pipeline at ~1-3 seconds for a 4-minute song. If MP3 encoding becomes a bottleneck, replace with `child_process.spawn('ffmpeg', ...)` and add the `ffmpeg` package to the Dockerfile.

## Troubleshooting

**401 unauthorized**: `WORKER_SHARED_SECRET` env var doesn't match the `X-Worker-Secret` header. Verify both sides have the exact same value.

**"GCS_BUCKET_NAME not configured"**: Set the env var when deploying, or use `/render` instead of `/render-to-gcs`.

**TTS calls failing**: Check the Cloud Run service account has `roles/texttospeech.user`. If using `GOOGLE_TTS_API_KEY`, verify the key is restricted to the Text-to-Speech API only and that the API is enabled in the project.

**Out-of-memory crashes**: Increase `--memory` to 2Gi. A 10-minute song at 44.1kHz stereo Float32 is roughly 100MB in memory; mixing requires roughly 2x for input + output buffers.

**Cold start latency**: First request after scale-down takes 2-5 seconds for the container to start. If this matters, set `--min-instances 1`.
