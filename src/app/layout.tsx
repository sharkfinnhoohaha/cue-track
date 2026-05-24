import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

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
    description: 'Generate professional click tracks and cue tracks for live musicians.',
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
  themeColor: '#f5f5f7',
  colorScheme: 'light',
};

// ─── Root Layout ─────────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
