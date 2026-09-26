/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
      colors: {
        'safar-navy': '#0F1F3D', 'safar-blue': '#2563EB', 'safar-sky': '#38BDF8',
        'safar-saffron': '#F59E0B', 'safar-safe': '#16A34A', 'safar-risk': '#F59E0B',
        'safar-broken': '#EF4444', 'safar-ai': '#8B5CF6',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out', 'fade-in-up': 'fadeInUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slideInLeft 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-ring': 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', 'pulse-soft': 'pulseSoft 2.5s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite', cascade: 'cascade 0.5s ease-out', blink: 'blink 1s ease-in-out infinite', typing: 'typing 1.1s steps(3,end) infinite',
      },
      keyframes: {
        fadeIn: {'0%': { opacity: '0' }, '100%': { opacity: '1' }},
        fadeInUp: {'0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' }},
        slideInRight: {'0%': { opacity: '0', transform: 'translateX(30px)' }, '100%': { opacity: '1', transform: 'translateX(0)' }},
        slideInLeft: {'0%': { opacity: '0', transform: 'translateX(-30px)' }, '100%': { opacity: '1', transform: 'translateX(0)' }},
        scaleIn: {'0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' }},
        pulseRing: {'0%': { transform: 'scale(0.8)', opacity: '0.8' }, '100%': { transform: 'scale(2.2)', opacity: '0' }},
        pulseSoft: {'0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' }},
        shimmer: {'0%': { backgroundPosition: '-1000px 0' }, '100%': { backgroundPosition: '1000px 0' }},
        cascade: {'0%': { transform: 'scale(0.92)', opacity: '0' }, '60%': { transform: 'scale(1.05)', opacity: '1' }, '100%': { transform: 'scale(1)', opacity: '1' }},
        blink: {'0%, 100%': { opacity: '1' }, '50%': { opacity: '0.3' }},
        typing: {'0%, 20%': { opacity: '0.25' }, '50%': { opacity: '1' }, '80%, 100%': { opacity: '0.25' }},
      },
      boxShadow: { card: '0 1px 2px rgba(15,31,61,.04), 0 8px 24px rgba(15,31,61,.05)' },
    },
  },
  plugins: [],
};
