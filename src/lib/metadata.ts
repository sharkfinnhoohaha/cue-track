/**
 * Shared metadata constants for Cue Track.
 *
 * Import these in layout.tsx and page.tsx files to maintain consistent
 * branding across all routes while allowing per-page title/description.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cuetrack.app';
const SITE_NAME = 'Cue Track';

export const siteConfig = {
  name: SITE_NAME,
  url: SITE_URL,
  description:
    'Build custom click and cue tracks for live performance. Set your tempo, define your sections, and generate audio with spoken voice cues or tone markers.',
  tagline: 'Your song. Your tempo. Their cue.',
} as const;

/**
 * Build a page-specific metadata object that inherits site-wide defaults.
 *
 * Usage in any page.tsx:
 *   export const metadata = pageMetadata({
 *     title: 'Create a Track',
 *     description: 'Build your custom click and cue track.',
 *   });
 */
export function pageMetadata(overrides: {
  title: string;
  description?: string;
  path?: string;
}) {
  const title = `${overrides.title} | ${SITE_NAME}`;
  const description = overrides.description ?? siteConfig.description;
  const url = overrides.path ? `${SITE_URL}${overrides.path}` : SITE_URL;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website' as const,
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}
