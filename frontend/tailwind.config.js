/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#171515", 900: "#211e1c", 800: "#302b28", 700: "#494039" },
        signal: { coral: "#ed987f", cyan: "#8ed8d0" },
        beat: {
          200: "#edf9b6",
          300: "#dff58a",
          400: "#d1ed62",
          500: "#c9e94e",
          600: "#b4d33b",
        },
      },
      fontFamily: {
        display: ["Unbounded", "Arial Black", "Arial", "sans-serif"],
        sans: [
          "Arial",
          "Helvetica Neue",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
