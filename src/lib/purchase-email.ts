/**
 * Sends a single-track buyer their durable, signed download link after a
 * successful Stripe payment. Mirrors the email transport used for auth
 * (Resend when RESEND_API_KEY is set, otherwise SMTP via nodemailer).
 *
 * Best-effort: the caller wraps this in try/catch so an email outage never
 * fails the Stripe webhook (which would otherwise trigger endless retries).
 * When no email transport is configured, it logs and returns without throwing.
 */
const FROM = process.env.EMAIL_FROM ?? 'Cue Track <noreply@cuetrack.app>';

interface PurchaseEmailArgs {
  to: string;
  trackTitle: string;
  downloadUrl: string;
}

export async function sendPurchaseEmail({ to, trackTitle, downloadUrl }: PurchaseEmailArgs): Promise<void> {
  const subject = 'Your Cue Track download is ready';
  const safeTitle = trackTitle || 'your track';
  const html = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color:#1d1d1f;">Thanks for your purchase</h2>
    <p style="color:#3a3a3c;">Your cue track <strong>${escapeHtml(safeTitle)}</strong> is ready. Use the button below to play it and download the full WAV or MP3 — the link is yours, so keep this email to re-download anytime.</p>
    <p style="margin:24px 0;"><a href="${downloadUrl}" style="display:inline-block;padding:12px 24px;background:#1d1d1f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Get your cue track</a></p>
    <p style="color:#6e6e73;font-size:13px;">If the button doesn't work, paste this link into your browser:<br><span style="color:#0066cc;">${downloadUrl}</span></p>
  </div>`;

  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: FROM, to, subject, html });
    return;
  }

  if (process.env.EMAIL_SERVER_HOST) {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
      auth: {
        user: process.env.EMAIL_SERVER_USER ?? '',
        pass: process.env.EMAIL_SERVER_PASSWORD ?? '',
      },
    });
    await transport.sendMail({ from: FROM, to, subject, html });
    return;
  }

  console.warn('[purchase-email] No email transport configured; skipping receipt to', to);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
