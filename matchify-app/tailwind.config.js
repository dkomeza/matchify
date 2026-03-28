/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Base
        background: '#08080C',
        'background-elevated': '#111116',
        // Glass surfaces
        glass: 'rgba(255,255,255,0.07)',
        'glass-raised': 'rgba(255,255,255,0.11)',
        'glass-active': 'rgba(255,255,255,0.16)',
        'glass-border': 'rgba(255,255,255,0.12)',
        'glass-highlight': 'rgba(255,255,255,0.20)',
        // Text
        primary: '#FFFFFF',
        secondary: 'rgba(255,255,255,0.55)',
        tertiary: 'rgba(255,255,255,0.30)',
        // Brand & semantic
        brand: '#BF5AF2',
        'brand-glow': 'rgba(191,90,242,0.35)',
        like: '#30D158',
        'like-glow': 'rgba(48,209,88,0.30)',
        skip: '#FF453A',
        'skip-glow': 'rgba(255,69,58,0.30)',
        accent: '#0A84FF',
      },
      borderRadius: {
        xs: '8px',
        sm: '12px',
        md: '20px',
        lg: '28px',
        xl: '40px',
      },
      spacing: {
        'screen': '24px',
        'card': '24px',
        'section': '32px',
      },
    },
  },
  plugins: [],
};
