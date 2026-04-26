# IEM Backing Track Generator — Landing Page

## Product Name
TBD (working: "CueTrack", "Backline", "InEarGen")

## What It Does
Upload a song → AI detects sections (verse/chorus/bridge) → Auto-generates voice count-ins and markers → Download ready-to-use backing track with IEM cues.

## Reference Design
**Temporal.xyz** — Dark, minimal, crypto-native aesthetic
- Custom creative coding visuals (3D particles, generative)
- Clean, high-end, tech-driven
- Sophisticated and quietly confident
- "Pushing the boundaries" energy
- Deep intellect, high standards

## Design Direction
- **Dark mode** — Black/near-black background
- **Accent color** — Pacific teal `#4A9D97` (from Overlook design system)
- **Typography** — Geist Sans + Geist Mono (clean, technical)
- **Hero** — Generative audio waveform visualization (canvas/Three.js)
- **Vibe** — Professional musician tool, not consumer toy

## Sections
1. **Hero** — Animated audio waveform, headline, subhead, CTA button
2. **Problem** — "Hours marking tracks by hand..."
3. **Solution** — 3-step process (Upload → Detect → Download)
4. **Features** — Section detection, voice markers, IEM-ready, custom cues
5. **Waitlist** — Email capture form
6. **Footer** — Links, copyright

## Tech Stack
- Next.js 14 + Tailwind + shadcn/ui
- Three.js or Canvas 2D for audio visualization
- Vercel for hosting

## Deliverables
- `app/page.tsx` — Landing page
- `app/globals.css` — Styles
- `public/` — Assets
- Deploy to Vercel

## Priority
**P0** — Get waitlist live ASAP for validation
