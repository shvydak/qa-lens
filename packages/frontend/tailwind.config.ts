import type {Config} from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        gray: {
          950: '#080b11',
        },
      },
      animation: {
        'spin-slow': 'spin 1.4s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
