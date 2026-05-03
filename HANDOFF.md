# Cue Track — Flip-to-Live Checklist

*This document is for Finn. Work through it top to bottom before launching to production. Each section is a gate: do not proceed past a section until it is complete.*

---

## Environment Variables

Set all of these in Vercel before the production deployment. Group them exactly as listed below so you can audit them systematically.

### Database (Neon Postgres)

| Variable | Value | Where to get it |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Neon dashboard → your project → Connection Details → Connection string |

The connection string looks like: `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

### Auth (NextAuth.js)

| Variable | Value | Where to get it |
|---|---|---|
| `NEXTAUTH_SECRET` | Random 32-byte base64 string | Run: `openssl rand -base64 32` in your terminal |
| `NEXTAUTH_URL` | `https://cuetrack.app` | Your production domain, no trailing slash |

`NEXTAUTH_SECRET` must be a new value for production — do not reuse your development secret. If this leaks, rotate it immediately and invalidate all sessions.

### Google Cloud (TTS + Storage)

| Variable | Value | Where to get it |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON file | GCP Console → IAM & Admin → Service Accounts → create key → JSON |
| `GOOGLE_TTS_API_KEY` | API key string (alternative to service account) | GCP Console → APIs & Services → Credentials → Create API Key |
| `GCS_BUCKET_NAME` | Your Cloud Storage bucket name | GCP Console → Cloud Storage → your bucket name |
| `GCS_PROJECT_ID` | GCP project ID | GCP Console → project selector at top of page |

Note: On Vercel, you cannot use `GOOGLE_APPLICATION_CREDENTIALS` as a file path because the filesystem is ephemeral. Instead, encode the JSON content as a base64 string and decode it at runtime, or use `GOOGLE_TTS_API_KEY` for the TTS REST endpoint directly. The app should handle both patterns — check `src/lib/tts.ts` for which one is active.

### Stripe (SWITCH FROM TEST TO LIVE)

**This is the most critical section. Test keys and live keys are not interchangeable. A misconfigured Stripe key will either silently decline all payments or charge real cards using test data.**

| Variable | Value | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` | Stripe Dashboard → Developers → API Keys → Secret key (live mode) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Stripe Dashboard → Developers → API Keys → Publishable key (live mode) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret |
| `STRIPE_PRICE_SINGLE` | `price_...` | Create in Stripe Dashboard: one-time, $3.00 USD |
| `STRIPE_PRICE_PRO` | `price_...` | Create in Stripe Dashboard: recurring monthly, $19.00 USD |

**Checklist before flipping Stripe:**
- [ ] Toggle Stripe dashboard to live mode (top-left toggle)
- [ ] Create "Single Track" product: $3.00, one-time payment
- [ ] Create "Pro Monthly" product: $19.00/mo recurring, no trial
- [ ] Create a webhook endpoint pointing to `https://cuetrack.app/api/stripe/webhook`
- [ ] Select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Copy the new webhook signing secret into `STRIPE_WEBHOOK_SECRET`
- [ ] Delete or disable the test-mode webhook endpoint

### Email (Resend)

| Variable | Value | Where to get it |
|---|---|---|
| `RESEND_API_KEY` | `re_...` | Resend dashboard → API Keys |
| `RESEND_FROM_EMAIL` | `noreply@cuetrack.app` | Must match a verified domain in Resend |

You must verify the cuetrack.app domain in Resend before transactional emails will deliver. Resend will give you DNS records (SPF, DKIM, DMARC) to add at your registrar. Allow 24–48 hours for propagation.

### Monitoring

| Variable | Value | Where to get it |
|---|---|---|
| `SENTRY_DSN` | `https://...@sentry.io/...` | Sentry → your project → Settings → Client Keys (DSN) |
| `NEXT_PUBLIC_SENTRY_DSN` | Same DSN as above | Same source — this one is exposed to the browser bundle |

`SENTRY_DSN` is used server-side (API routes, server components). `NEXT_PUBLIC_SENTRY_DSN` is used client-side. They are the same value; Next.js requires separate variable names because `NEXT_PUBLIC_` variables are inlined at build time.

### App

| Variable | Value | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://cuetrack.app` | Your production domain, no trailing slash |

---

## Third-Party Accounts to Provision

Work through each service in this order. Later steps depend on earlier ones.

### 1. Neon (neon.tech)

**Sign up:** https://neon.tech — free account, no credit card required for free tier.

**Free tier limits:**
- 0.5 GB storage
- 190 compute hours per month
- 1 project, 10 branches

**What to do:**
1. Create a new project. Choose the region closest to your Vercel deployment (us-east-1 for US, eu-central-1 for Europe).
2. Copy the connection string from the dashboard.
3. Run `npx prisma migrate deploy` (or your schema migration command) against the new database.
4. Verify the schema with `npx prisma studio` or a Postgres client.

**When to upgrade:** When storage hits 0.4 GB or compute hours consistently exceed 150/mo. Neon Pro is $19/mo.

---

### 2. Stripe (stripe.com)

**Sign up:** https://stripe.com — free account. No monthly fee. Charges only on transactions.

**Fee structure:** 2.9% + $0.30 per successful transaction. For a $3.00 single-track purchase, Stripe takes $0.39, netting $2.61. For a $19/mo Pro subscription, Stripe takes $0.85/mo, netting $18.15/mo.

**What to do:**
1. Complete Stripe account verification (business details, bank account for payouts).
2. Toggle to live mode.
3. Create products and prices as described in the environment variables section above.
4. Configure the webhook endpoint.
5. Set the statement descriptor in Stripe settings to "CUETRACK" so it appears recognizably on customer bank statements.

**Tax note:** If you are collecting subscriptions from customers in the EU or certain US states, you may need to configure Stripe Tax. Check with your accountant before launch.

---

### 3. Google Cloud Platform (cloud.google.com)

**Account:** $300 in credits already available. Do not create a new account — use the existing GCP project.

**What to enable and create:**
1. Enable the **Cloud Text-to-Speech API**: GCP Console → APIs & Services → Library → search "Text-to-Speech" → Enable.
2. Enable the **Cloud Storage API**: already enabled if you have a bucket, but verify.
3. Create a **Cloud Storage bucket**: Storage → Create Bucket. Choose a globally unique name (e.g., `cuetrack-audio-prod`). Region: same as Vercel. Storage class: Standard. Access control: Uniform (not Fine-Grained).
4. Set bucket lifecycle rules: delete objects older than 90 days for single-track purchases. Pro subscriber files can be kept longer. This prevents storage costs from accumulating.
5. Create a **service account**: IAM & Admin → Service Accounts → Create. Grant roles: `roles/texttospeech.user` and `roles/storage.objectAdmin`. Create and download a JSON key.
6. Set bucket CORS if the app streams audio directly from GCS URLs in the browser. Add `https://cuetrack.app` as an allowed origin.

**Free tier / credits:**
- TTS Standard voices: 4 million characters/month free, then $4.00 per 1M characters.
- TTS WaveNet/Neural2 voices: 1 million characters/month free, then $16.00 per 1M characters.
- Cloud Storage: first 5 GB stored free, then $0.020/GB/month. Egress is $0.12/GB after the first 1 GB.

Use Standard voices unless audio quality testing shows a meaningful difference. The cost difference is 4x and the free tier is 4x larger.

---

### 4. Resend (resend.com)

**Sign up:** https://resend.com — free account.

**Free tier limits:**
- 100 emails per day
- 3,000 emails per month
- 1 domain

**What to do:**
1. Add and verify your sending domain (`cuetrack.app`). Resend will provide DNS records.
2. Add the DNS records at your registrar. Verify in Resend dashboard.
3. Create an API key with send-only permissions.
4. Send a test email to yourself before considering this done.

**When to upgrade:** When you exceed 3,000 emails/month. Resend Pro is $20/mo for 50,000 emails.

---

### 5. Sentry (sentry.io)

**Sign up:** https://sentry.io — free account.

**Free tier limits:**
- 5,000 errors per month
- 1 team member on the free plan

**What to do:**
1. Create a new project. Select "Next.js" as the platform.
2. Sentry will provide a DSN. Copy it.
3. The Sentry Next.js SDK should already be configured in the project — verify `sentry.client.config.ts` and `sentry.server.config.ts` exist and reference `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` respectively.
4. Deploy once and trigger a test error to verify events appear in Sentry.

---

### 6. Vercel (vercel.com)

**Account:** Connect via GitHub. Hobby tier is free.

**Hobby tier limits:**
- Unlimited deployments
- 100 GB bandwidth/month
- Serverless function timeout: 10 seconds (this may be too short for TTS generation — see note below)

**Function timeout note:** Google TTS for a typical worship song (4–6 minutes of click+cue audio, ~12,000–20,000 characters) may take 5–15 seconds to generate. Vercel Hobby functions time out at 10 seconds. If you hit this limit in production, you have two options:
1. Upgrade to Vercel Pro ($20/mo) for 60-second function timeouts.
2. Restructure the generation to use a background job pattern (queue the job, poll for completion, or use Vercel's fluid compute / streaming response).

Test the generation endpoint under load before launch.

---

## Cost Projections

### Low Volume — 100 tracks/month

| Line item | Calculation | Monthly cost |
|---|---|---|
| Google Cloud TTS | 2,000 chars/track × 100 = 200K chars → free tier (4M chars free) | $0 |
| Cloud Storage | ~3 MB/track × 100 = 300 MB → free tier (5 GB free) | $0 |
| Neon Postgres | Minimal usage → free tier | $0 |
| Stripe fees | 100 × $3 × 2.9% + $0.30 = $38.70 on $300 revenue | $38.70 |
| Resend | ~100 emails → free tier | $0 |
| Vercel | Free tier | $0 |
| **Total infrastructure** | | **~$1/mo** |
| **Revenue** | 100 × $3 | **$300/mo** |
| **Margin** | | ~87% |

### Medium Volume — 1,000 tracks/month

| Line item | Calculation | Monthly cost |
|---|---|---|
| Google Cloud TTS | 2M chars/month → still within free tier | $0 |
| Cloud Storage | ~3 MB/track × 1,000 = 3 GB → free tier | $0 |
| Neon Postgres | Moderate usage → free tier still holds | $0 |
| Stripe fees | ~$3,000 revenue × ~3.2% effective rate | ~$117 |
| Resend | ~1,000 emails → free tier | $0 |
| Vercel | May need Pro for function timeouts | $20 |
| **Total infrastructure** | | **~$25/mo** |
| **Revenue** | 1,000 × $3 | **~$3,000/mo** |
| **Margin** | After Stripe fees | ~96% |

### High Volume — 10,000 tracks/month

| Line item | Calculation | Monthly cost |
|---|---|---|
| Google Cloud TTS | 20M chars/month → 16M billed at $4/1M (Standard voices) | ~$64 |
| Cloud Storage | 30 GB stored; ~30 GB egress | ~$5 |
| Neon Postgres | Need paid plan at this scale | $19 |
| Stripe fees | ~$30,000 revenue × ~3.2% effective rate | ~$960 |
| Resend | ~10,000 emails → paid plan | $20 |
| Vercel Pro | Required | $20 |
| **Total infrastructure** | Excluding Stripe fees | **~$128/mo** |
| **Revenue (transactions only)** | 10,000 × $3 | **~$30,000/mo** |
| **Margin after all fees** | | ~96% |

**Unit economics note on Pro subscribers:** A Pro subscriber at $19/mo generating 20 tracks/month costs roughly $0.04 in TTS ($0.002/track at Standard voice rates after free tier is used up) and negligible storage. Revenue per Pro subscriber: $18.15/mo after Stripe fees. Gross margin on Pro is higher than on per-track purchases, and Pro subscribers generate predictable MRR. Conversion of per-track buyers to Pro is the primary growth lever.

---

## Steps to Go Live

Complete these in order. Do not skip steps.

**1. Register the domain**
   - Register `cuetrack.app` (or your chosen domain) at Cloudflare Registrar, Namecheap, or your preferred registrar.
   - If using Vercel's nameservers: add the domain in the Vercel dashboard first, then point the domain's nameservers to Vercel.
   - If managing DNS yourself: add the Vercel-provided A and CNAME records.

**2. Create Neon project and run schema migration**
   - Create a new Neon project in the appropriate region.
   - Set `DATABASE_URL` in your local `.env.local`.
   - Run: `npx prisma migrate deploy` (or your migration command).
   - Verify tables exist with a quick `SELECT` in the Neon SQL editor.

**3. Create Stripe products and prices**
   - In Stripe live mode, create:
     - Product: "Single Track" → Price: $3.00 one-time
     - Product: "Cue Track Pro" → Price: $19.00/month recurring
   - Copy both price IDs (`price_...`) into your env vars.

**4. Switch Stripe to live mode and update env vars**
   - Replace all `sk_test_` and `pk_test_` values with live keys.
   - Create the production webhook endpoint in Stripe pointing to `https://cuetrack.app/api/stripe/webhook`.
   - Copy the new `whsec_...` signing secret into `STRIPE_WEBHOOK_SECRET`.

**5. Set up Google Cloud**
   - Enable Text-to-Speech API and Cloud Storage API in GCP Console.
   - Create the production Cloud Storage bucket (e.g., `cuetrack-audio-prod`).
   - Create the service account with `roles/texttospeech.user` and `roles/storage.objectAdmin`.
   - Download the JSON key. Either encode as base64 for Vercel env vars, or use `GOOGLE_TTS_API_KEY` instead.
   - Set bucket lifecycle rules: delete single-track audio after 90 days.

**6. Set up Resend**
   - Add cuetrack.app as a verified sending domain in Resend.
   - Add the SPF, DKIM, and DMARC records to your domain DNS.
   - Wait for DNS propagation. Verify green status in Resend dashboard.
   - Create a send-only API key. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

**7. Set up Sentry project**
   - Create a new Sentry project for Next.js.
   - Copy the DSN into `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.
   - Confirm the Sentry configuration files are present in the repo.

**8. Add production domain and set all env vars in Vercel**
   - In Vercel project settings, add `cuetrack.app` as a production domain.
   - Under Environment Variables, add every variable from the sections above.
   - Set them for the "Production" environment. Do not add live Stripe keys to Preview or Development environments.
   - Trigger a new deployment after saving env vars.

**9. Configure Stripe webhook endpoint to production URL**
   - Already done in step 4, but verify: go to Stripe Dashboard → Webhooks → your endpoint → confirm the URL is `https://cuetrack.app/api/stripe/webhook` and the status shows as active.
   - Send a test event from the Stripe dashboard and confirm the webhook handler logs a 200 response.

**10. Run a real end-to-end purchase test**
   - Use a real credit card (your own). Buy a single track ($3.00).
   - Confirm: Stripe shows the payment as succeeded. The track generates. The download link works. The confirmation email arrives.
   - Refund the test purchase from Stripe dashboard.

**11. Verify download and email delivery**
   - Specifically check: the download link does not expire immediately (GCS signed URLs should have a reasonable TTL, minimum 24 hours).
   - Check email deliverability: verify the email did not land in spam. Check SPF/DKIM alignment with a tool like MXToolbox or mail-tester.com.

**12. Enable Vercel Analytics**
   - In Vercel dashboard → your project → Analytics → Enable.
   - No code changes required. Real User Metrics will start collecting on next deployment.

**13. Submit sitemap to Google Search Console**
   - Add cuetrack.app to Google Search Console. Verify via DNS TXT record or HTML file.
   - Submit `https://cuetrack.app/sitemap.xml`.
   - Verify the sitemap is indexed and no crawl errors are reported.

---

## Post-Launch Checklist

Do these in the first week after launch:

- [ ] Monitor Sentry for any production errors in the first 48 hours
- [ ] Check Stripe for any failed webhook deliveries
- [ ] Verify GCS lifecycle rules are not deleting files too aggressively
- [ ] Test the subscription cancellation and renewal flow
- [ ] Confirm Neon is not approaching the free tier compute limit under real traffic
- [ ] Review Vercel function execution times — flag anything over 8 seconds
- [ ] Check Core Web Vitals in Vercel Analytics after 100+ real page views
