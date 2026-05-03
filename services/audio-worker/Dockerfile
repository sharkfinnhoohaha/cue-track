# Cue Track audio worker — Cloud Run image
#
# Build:  gcloud builds submit --tag gcr.io/PROJECT_ID/cuetrack-audio-worker
# Deploy: see README.md

FROM node:24-slim AS base

# Cloud Run sets PORT automatically; default to 8080 for local docker run
ENV NODE_ENV=production \
    PORT=8080

# Install dependencies first for Docker layer caching
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy source after dependencies so source changes don't bust the npm install layer
COPY server.ts ./
COPY lib ./lib

# Cloud Run health checks hit / by default but we expose /health
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 8080

# Use exec form so signals propagate properly for graceful shutdown
CMD ["node", "--experimental-strip-types", "server.ts"]
