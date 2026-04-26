/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--color-bg-surface)",
        elevated: "var(--color-bg-elevated)",
        raised: "var(--color-bg-raised)",
        accent: {
          DEFAULT: "var(--color-accent-default)",
          glow: "var(--color-accent-glow)",
          active: "var(--color-accent-active)",
          soft: "var(--color-accent-soft)",
        },
        border: {
          DEFAULT: "var(--color-border-default)",
          subtle: "var(--color-border-subtle)",
          strong: "var(--color-border-strong)",
          accent: "var(--color-border-accent)",
          danger: "var(--color-border-danger)",
        },
        danger: {
          DEFAULT: "var(--color-danger-default)",
          hover: "var(--color-danger-hover)",
          soft: "var(--color-danger-soft)",
        },
        warning: {
          DEFAULT: "var(--color-warning-default)",
          soft: "var(--color-warning-soft)",
        },
        success: {
          DEFAULT: "var(--color-success-default)",
          soft: "var(--color-success-soft)",
        },
      },
      textColor: {
        primary: "var(--color-text-primary)",
        secondary: "var(--color-text-secondary)",
        muted: "var(--color-text-muted)",
        disabled: "var(--color-text-disabled)",
        "on-accent": "var(--color-text-on-accent)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        inset: "var(--shadow-inset)",
        "glow-accent": "var(--shadow-glow-accent)",
        "glow-directional": "var(--shadow-glow-directional)",
      },
    },
  },
  plugins: [],
};
