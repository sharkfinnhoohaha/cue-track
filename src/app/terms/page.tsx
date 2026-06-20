import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of Cue Track.',
};

// NOTE: Starting-point terms reflecting current behavior (per-track $3 one-time
// purchases and a $19/mo Pro subscription, no warranty on rendered audio).
// Review with counsel and confirm refund/contact details before launch.
const EFFECTIVE_DATE = 'June 18, 2026';
const CONTACT_EMAIL = 'support@cuetrack.app';

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pt-28 pb-20">
        <h1 className="font-display font-bold tracking-[-0.035em] text-zinc-100 text-[clamp(32px,4vw,48px)] mb-3">
          Terms of Service
        </h1>
        <p className="text-[13px] text-zinc-400 mb-12">Effective {EFFECTIVE_DATE}</p>

        <div className="space-y-8 text-[15px] leading-[1.7] text-zinc-300">
          <section>
            <h2 className="text-[20px] font-bold text-zinc-100 mb-2">1. The service</h2>
            <p>
              Cue Track generates click tracks with spoken section cues from audio you
              provide. By using the service you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-zinc-100 mb-2">2. Your content &amp; rights</h2>
            <p>
              You must own or have the rights to any audio you upload. You retain ownership
              of your uploads and of the cue tracks you generate. You grant us a limited
              license to process your audio solely to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-zinc-100 mb-2">3. Payments</h2>
            <p>
              Single tracks are a one-time charge of $3 (USD) per track. Pro is a recurring
              subscription of $19/month that you can cancel anytime from your billing
              portal; cancellation stops future renewals and access continues until the end
              of the paid period. All payments are handled by Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-zinc-100 mb-2">4. Acceptable use</h2>
            <p>
              Don&apos;t use the service to infringe others&apos; rights, upload unlawful
              content, attempt to break or overload the service, or resell it without
              permission.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-zinc-100 mb-2">5. No warranty</h2>
            <p>
              The service is provided &ldquo;as is.&rdquo; Tempo and section detection are
              automated estimates and may need adjustment. We don&apos;t guarantee the
              output is fit for any particular performance.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-zinc-100 mb-2">6. Limitation of liability</h2>
            <p>
              To the extent permitted by law, our total liability for any claim is limited
              to the amount you paid us in the 12 months before the claim.
            </p>
          </section>

          <section>
            <h2 className="text-[20px] font-bold text-zinc-100 mb-2">7. Contact</h2>
            <p>
              Questions about these terms? Email{' '}
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
