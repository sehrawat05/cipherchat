/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0b14',
          900: '#0f1120',
          850: '#15182b',
          800: '#1b1f38',
          700: '#272c4d',
        },
        cipher: {
          400: '#7c8aff',
          500: '#5d6bff',
          600: '#4350f5',
        },
        glow: '#34e7c4',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(52,231,196,0.5)' },
          '100%': { boxShadow: '0 0 0 8px rgba(52,231,196,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.25s ease-out',
        'pulse-ring': 'pulse-ring 1.8s infinite',
        shimmer: 'shimmer 2.4s linear infinite',
      },
    },
  },
  plugins: [],
};
