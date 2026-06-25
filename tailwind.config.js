/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // Apple-inspired neutral surface + a single confident accent.
        canvas: '#f5f5f7',
        ink: {
          DEFAULT: '#1d1d1f',
          soft: '#424245',
          muted: '#6e6e73',
        },
        accent: {
          DEFAULT: '#0071e3',
          hover: '#0077ed',
          ring: '#0071e3',
        },
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
        'card-lg': '0 4px 12px rgba(0,0,0,0.06), 0 24px 48px rgba(0,0,0,0.10)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
};
