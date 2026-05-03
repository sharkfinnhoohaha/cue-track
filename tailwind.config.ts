import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#C8A250',
          50: '#F9F3E6',
          100: '#F2E5C5',
          200: '#E8CE93',
          300: '#DDB862',
          400: '#C8A250',
          500: '#A8833A',
          600: '#886628',
          700: '#664C1C',
          800: '#453211',
          900: '#231907',
        },
        surface: {
          DEFAULT: '#0A0A0A',
          raised: '#141414',
          border: '#1E1E1E',
        },
        muted: '#6B6B6B',
      },
      fontFamily: {
        display: ['var(--font-playfair)', 'Playfair Display', 'Georgia', 'serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'Menlo', 'monospace'],
        body: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(200, 162, 80, 0)' },
          '50%': { boxShadow: '0 0 0 6px rgba(200, 162, 80, 0.15)' },
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
    },
  },
  plugins: [],
};

export default config;
