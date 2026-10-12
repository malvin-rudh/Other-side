/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mirae-inspired light workspace. navy stays the navigation frame and the
        // primary text colour; surface is the white reading surface.
        navy: '#0B1220',
        navySoft: '#1B2740',
        canvas: '#F5F7FA',
        surface: '#FFFFFF',
        surfaceAlt: '#F8FAFC',
        line: '#E3E8F0',
        lineStrong: '#CBD5E1',
        ink: '#0B1220',
        muted: '#5A6B84',
        mutedSoft: '#8494AB',
        brand: '#F58220',
        brandDeep: '#B4530A',
        buy: '#0F766E',
        buySoft: '#14B8A6',
        sell: '#BE123C',
        sellSoft: '#F43F5E',
        unknown: '#64748B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 18, 32, 0.05), 0 8px 24px -16px rgba(11, 18, 32, 0.18)',
        lift: '0 2px 6px rgba(11, 18, 32, 0.08), 0 18px 40px -20px rgba(11, 18, 32, 0.28)',
      },
    },
  },
  plugins: [],
};
