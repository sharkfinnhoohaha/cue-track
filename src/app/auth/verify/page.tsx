import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Check your email',
  description: 'A sign-in link has been sent to your email.',
};

export default function VerifyRequestPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F0EDE6] sm:text-5xl">
            Check your email
          </h1>
          <p className="mt-3 text-muted text-lg leading-relaxed">
            A sign-in link has been sent to your inbox. Click it to finish
            signing in. The link expires in 24 hours.
          </p>
        </div>

        <p className="text-sm text-muted/70">
          Did not receive it? Check spam, then try again from the sign-in page.
        </p>
      </main>
      <Footer />
    </>
  );
}
