/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  // Dark mode dinonaktifkan: varian `dark:` hanya aktif jika class `dark`
  // dipasang manual, dan aplikasi tidak pernah memasangnya.
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}