/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        hand: ['Kalam', 'cursive'],
      },
      colors: {
        ink: { DEFAULT: '#0b2e3a', 900: '#071f28', 800: '#0b2e3a', 700: '#11414f', 600: '#1a5566' },
        brand: { DEFAULT: '#e8505b', soft: '#fde8e9' },
        duty: { off: '#64748b', sb: '#6366f1', d: '#0d9488', on: '#f59e0b' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(7,31,40,.06), 0 4px 16px -4px rgba(7,31,40,.08)',
      },
    },
  },
  plugins: [],
}
