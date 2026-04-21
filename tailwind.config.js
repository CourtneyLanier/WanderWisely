/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F5EDD6',
        forest: '#2D3D1E',
        sage: '#5C7A3E',
        gold: '#D4943A',
        terracotta: '#8B4A35',
        'deep-teal': '#2D5A3D',
        'white-warm': '#FDF9F3',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
