import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  // Disable Tailwind's CSS reset so it never fights the retained Oxygen CSS.
  // Tailwind is only for new wrapper/chrome we add ourselves.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        // Oxygen global palette (betterconnected.me)
        brand: {
          cyan: '#009ec8', // color1 — primary
          amber: '#f7b60d', // color2
          blue: '#005ea1', // color3 — default text / headings
        },
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'Poppins', 'sans-serif'],
      },
      maxWidth: { site: '1300px' },
      screens: {
        // Oxygen breakpoints
        'oxy-lg': '992px',
        'oxy-md': '768px',
        'oxy-sm': '480px',
      },
    },
  },
  plugins: [],
}

export default config
