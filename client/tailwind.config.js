/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          1: '#161a24',
          2: '#1c2131',
          3: '#232840',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#4f52e0',
          light: '#818cf8',
          muted: 'rgba(99,102,241,0.15)',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.07)',
          active: 'rgba(99,102,241,0.5)',
        },
        text: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#475569',
        },
        status: {
          applied: '#10b981',
          skipped: '#f59e0b',
          failed: '#ef4444',
          duplicate: '#8b5cf6',
        },
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.4)',
        glow: '0 0 20px rgba(99,102,241,0.3)',
        card: '0 4px 24px rgba(0,0,0,0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease',
        'slide-up': 'slideUp 0.3s ease',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
