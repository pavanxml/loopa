import type { Config } from "tailwindcss";

// LOOPA design system tokens. Kept centralized here so `src/app/globals.css`
// and every component reference the same scale — no ad hoc magic numbers.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Loop" violet-to-teal brand gradient — distinct from any existing
        // platform's palette (no Instagram magenta/orange, no Discord blurple).
        loop: {
          50: "#f2f4ff",
          100: "#e6e9ff",
          200: "#c3c9ff",
          300: "#9ea6ff",
          400: "#7a7fff",
          500: "#6659ff",
          600: "#5440e6",
          700: "#4230b8",
          800: "#332690",
          900: "#241a66",
        },
        teal: {
          400: "#38e0c4",
          500: "#1fc9ac",
        },
        surface: {
          DEFAULT: "#ffffff",
          subtle: "#f7f7fb",
          dark: "#121218",
          "dark-subtle": "#1a1a22",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
        card: "1rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,16,24,0.04), 0 8px 24px -8px rgba(16,16,24,0.08)",
        popover: "0 4px 12px rgba(16,16,24,0.12), 0 16px 40px -12px rgba(16,16,24,0.18)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "scale-in": "scale-in 150ms ease-out",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
