# Cue Track — Flip-to-Live Checklist

*Work through this top to bottom before launching to production. Each section is a gate.*

---

## Environment Variables

### Database (Neon Postgres)
| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Neon dashboard → Connection Details → Connection string |

### Auth (NextAuth.js)
| Variable | Notes |
|---|---|
| `NEXTAUTH_SECRET` | Run: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://cuetrack.app` |

### Google Cloud (TTS + Storage)
| Variable | Notes |
|---|---|
| `GOOGLE_TTS_API_KEY` | GCP Console → APIs & Services → Credentials |
| `GCS_BUCKET_NAME` | Your Cloud Storage bucket name |
| `GCS_PROJECT_ID` | GCP project ID |

### Stripe (SWITCH FROM TEST TO LIVE)
| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` from Stripe Dashboard |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` from Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from webhook endpoint |
| `STRIPE_PRICE_SINGLE` | Create in Stripe: one-time, $3.00 USD |
| `STRIPE_PRICE_PRO` | Create in Stripe: recurring monthly, $19.00 USD |

### Email (Resend)
| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | Resend dashboard → API Keys |
| `RESEND_FROM_EMAIL` | `noreply@cuetrack.app` |

### App
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://cuetrack.app` |

---

## Steps to Go Live

1. Register domain (`cuetrack.app`) and point to Vercel
2. Create Neon project and run schema migration: `npx prisma migrate deploy`
3. Create Stripe products: "Single Track" $3.00 one-time, "Cue Track Pro" $19.00/mo
4. Switch Stripe to live mode, update all env vars, create production webhook
5. Set up GCP: enable TTS API, create storage bucket, create service account
6. Set up Resend: verify domain, add DNS records, create API key
7. Add production domain and all env vars in Vercel
8. Configure Stripe webhook pointing to `https://cuetrack.app/api/stripe/webhook`
9. Run end-to-end purchase test with a real card ($3.00), then refund
10. Verify download link works and confirmation email arrives
11. Enable Vercel Analytics
12. Submit sitemap to Google Search Console

---

## Cost Projections

### Low Volume — 100 tracks/month
- Infrastructure: ~$1/mo (all free tiers)
- Revenue: $300/mo
- Margin: ~87%

### Medium Volume — 1,000 tracks/month
- Infrastructure: ~$25/mo
- Revenue: ~$3,000/mo
- Margin: ~96%

### High Volume — 10,000 tracks/month
- Infrastructure: ~$128/mo (excl. Stripe fees)
- Revenue: ~$30,000/mo
- Margin: ~96%

---

## Post-Launch Checklist

- [ ] Monitor Sentry for production errors in first 48 hours
- [ ] Check Stripe for failed webhook deliveries
- [ ] Verify GCS lifecycle rules aren't too aggressive
- [ ] Test subscription cancellation and renewal flow
- [ ] Check Neon isn't approaching free tier compute limit
- [ ] Review Vercel function execution times — flag anything over 8 seconds
- [ ] Check Core Web Vitals after 100+ real page views
