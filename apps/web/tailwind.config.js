/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#F4F7FB',
          100: '#E6EBF2',
          200: '#CBD4E1',
          300: '#A8B4C7',
          400: '#7E8BA0',
          500: '#5A667C',
          600: '#3F495E',
          700: '#2C3447',
          800: '#1A2130',
          900: '#0F1420',
          950: '#070B14',
        },
        signal: {
          DEFAULT: '#00FF88',
          dim: '#00CC6D',
        },
        danger: '#FF3B5C',
        amber: '#FFB020',
      },
      fontFamily: {
        body: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern':
          'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
        'radial-gradient':
          'radial-gradient(ellipse at center, rgba(0,255,136,0.08) 0%, rgba(0,255,136,0) 70%)',
      },
      backgroundSize: {
        'grid-pattern': '48px 48px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-signal': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.2s ease-out',
        'pulse-signal': 'pulse-signal 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
