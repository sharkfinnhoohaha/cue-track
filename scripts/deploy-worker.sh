#!/usr/bin/env bash
set -e

echo "========================================================"
echo "    Cue Track Audio Worker — Google Cloud Deployment"
echo "========================================================"
echo ""

# 1. Ensure user is logged in
echo "Checking Google Cloud authentication..."
CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
if [[ "$CURRENT_ACCOUNT" != *"overlookstrategy.com"* ]]; then
  echo "You are currently logged in as $CURRENT_ACCOUNT."
  echo "Please log in to your overlookstrategy.com account:"
  gcloud auth login --update-adc
else
  echo "✓ Authenticated as $CURRENT_ACCOUNT"
fi

# 2. Let user select the project
echo ""
echo "Fetching your Google Cloud Projects..."
# Temporarily unset the active project config and quota project to avoid PERMISSION_DENIED on the previous project context
gcloud config unset project >/dev/null 2>&1 || true
gcloud config unset billing/quota_project >/dev/null 2>&1 || true
gcloud projects list --format="table(projectId,name)"
echo ""
read -p "Enter the PROJECT_ID that has your $300 credits: " PROJECT_ID

echo ""
echo "Setting active project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

# 3. Enable necessary APIs
echo "Enabling Cloud Run API..."
gcloud services enable run.googleapis.com
gcloud services enable texttospeech.googleapis.com

# 4. Generate Worker Secret
echo "Generating secure shared secret..."
WORKER_SECRET=$(openssl rand -base64 32)

# 5. Deploy to Cloud Run
echo ""
echo "Deploying the audio worker to Cloud Run (this will take a few minutes)..."
cd services/audio-worker

# Check if GOOGLE_TTS_API_KEY is available in local env, if not we will just set the secret
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
  --set-env-vars "WORKER_SHARED_SECRET=$WORKER_SECRET"

# 6. Success Output
echo ""
echo "========================================================"
echo "  ✅ Deployment Complete! "
echo "========================================================"
echo ""
echo "Next steps:"
echo "1. Go to your Vercel Dashboard -> cue-track -> Settings -> Environment Variables"
echo "2. Add the variable AUDIO_WORKER_URL and paste the Service URL printed above."
echo "3. Add the variable AUDIO_WORKER_SHARED_SECRET and paste the following secret:"
echo ""
echo "   $WORKER_SECRET"
echo ""
echo "4. Redeploy the Vercel app to apply the changes."
echo ""
