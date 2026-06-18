import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Cue Track team for support or questions.',
};

const CONTACT_EMAIL = 'support@cuetrack.app';

export default function ContactPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-6 pt-28 pb-20">
        <h1 className="font-sans font-black tracking-[-0.035em] text-[#1d1d1f] text-[clamp(32px,4vw,48px)] mb-4">
          Contact us
        </h1>
        <p className="text-[16px] leading-[1.7] text-[#3a3a3c] mb-8">
          Need help with an analysis, a download, or billing? We&apos;re a small team and
          we read every message.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex items-center rounded-full bg-[#1d1d1f] px-7 py-3 text-[15px] font-semibold text-white hover:opacity-85 transition-opacity"
        >
          Email {CONTACT_EMAIL}
        </a>
        <p className="mt-8 text-[14px] text-[#6e6e73] leading-[1.7]">
          For billing questions, include the email you used at checkout. For analysis
          issues, let us know the song length and format and we&apos;ll take a look.
        </p>
      </main>
      <Footer />
    </>
  );
}
