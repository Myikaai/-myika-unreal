/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        accent: "var(--accent)",
        border: "var(--border)",
      },
      textColor: {
        primary: "var(--text-primary)",
        muted: "var(--text-muted)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
