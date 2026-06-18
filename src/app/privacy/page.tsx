import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Cue Track collects, uses, and protects your data.',
};

// NOTE: This is a starting-point policy that reflects how the app actually
// works today (Vercel Blob for uploads, Neon Postgres, Stripe for payments,
// Google sign-in). Review with counsel and update the contact address and
// effective date before relying on it for Stripe/Google verification.
const EFFECTIVE_DATE = 'June 18, 2026';
const CONTACT_EMAIL = 'support@cuetrack.app';

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pt-28 pb-20">
        <h1 className="font-sans font-black tracking-[-0.035em] text-[#1d1d1f] text-[clamp(32px,4vw,48px)] mb-3">
          Privacy Policy
        </h1>
        <p className="text-[13px] text-[#6e6e73] mb-12">Effective {EFFECTIVE_DATE}</p>

        <div className="space-y-8 text-[15px] leading-[1.7] text-[#3a3a3c]">
          <section>
            <h2 className="text-[20px] font-bold text-[#1d1d1f] mb-2">Who we are</h2>
            <p>
              Cue Track (&ldquo;we&rdquo;, &ldquo;us&rdquo;) turns an uploaded song into a
              click track with spoken section cues. This policy explains what data we
              collect, why, and your choices.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-[#1d1d1f] mb-2">What we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Audio you upload.</strong> Your source file is uploaded to our
                storage provider (Vercel Blob) only to analyze tempo and structure. The
                source file is deleted automatically once analysis completes.
              </li>
              <li>
                <strong>Account info.</strong> If you sign in, we store your email address
                and (for Google sign-in) basic profile info to identify your account.
              </li>
              <li>
                <strong>Payment info.</strong> Payments are processed by Stripe. We never
                see or store your full card number; we keep a Stripe customer ID and your
                subscription/purchase status.
              </li>
              <li>
                <strong>Usage data.</strong> Standard logs and privacy-friendly analytics
                (e.g. Vercel Speed Insights) to keep the service running and fast.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-[#1d1d1f] mb-2">How we use it</h2>
            <p>
              To analyze your audio, render and deliver your cue track, process payments,
              provide support, prevent abuse, and improve the product. We do not sell your
              personal data.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-[#1d1d1f] mb-2">Service providers</h2>
            <p>
              We share data only with the processors that run the service: Vercel
              (hosting/storage), Neon (database), Stripe (payments), Google (sign-in and
              text-to-speech). Each handles data under its own terms.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-[#1d1d1f] mb-2">Your rights</h2>
            <p>
              You can request access to, correction of, or deletion of your personal data,
              and you can delete your account at any time. Contact us at{' '}
              <a className="text-[#0066cc] hover:opacity-75" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-[#1d1d1f] mb-2">Changes</h2>
            <p>
              We may update this policy; we&apos;ll revise the effective date above when we
              do. Questions? Email{' '}
              <a className="text-[#0066cc] hover:opacity-75" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
