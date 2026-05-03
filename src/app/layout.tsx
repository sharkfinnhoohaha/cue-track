import type { Metadata, Viewport } from 'next';
import { Playfair_Display, JetBrains_Mono, Inter } from 'next/font/google';
import './globals.css';

// ─── Font definitions ───────────────────────────────────────────────────────

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

// ─── Metadata ────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: 'Cue Track — Click & Cue Tracks for Live Musicians',
    template: '%s | Cue Track',
  },
  description:
    'Generate professional click tracks and cue tracks for live musicians. Set your BPM, arrange song sections, add spoken cues, and download studio-quality WAV or MP3 in seconds.',
  keywords: [
    'click track',
    'cue track',
    'live music',
    'metronome track',
    'backing track',
    'BPM',
    'in-ear monitor',
    'IEM',
    'stage track',
    'song sections',
  ],
  authors: [{ name: 'Cue Track' }],
  creator: 'Cue Track',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://cuetrack.app',
    siteName: 'Cue Track',
    title: 'Cue Track — Click & Cue Tracks for Live Musicians',
    description:
      'Generate professional click tracks and cue tracks for live musicians. Set your BPM, arrange song sections, add spoken cues, and download studio-quality audio in seconds.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Cue Track — Click & Cue Tracks for Live Musicians',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cue Track — Click & Cue Tracks for Live Musicians',
    description:
      'Generate professional click tracks and cue tracks for live musicians.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: '/favicon.ico',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A0A0A',
  colorScheme: 'dark',
};

// ─── Root Layout ─────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={[
        'dark',
        playfair.variable,
        jetbrainsMono.variable,
        inter.variable,
      ].join(' ')}
      suppressHydrationWarning
    >
      <body className="font-body bg-surface text-[#F0EDE6] antialiased min-h-dvh">
        {children}
      </body>
    </html>
  );
}
