import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#C8102E",
        // Restrained gold accent — premium touches (dividers, focus rings,
        // hero highlights) only, never a competing CTA color against
        // primary red.
        accent: "#C6A15B",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        base: "rgb(var(--color-base) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        success: "#2E7D32",
        warning: "#ED7D31",
        danger: "#C00000",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Consolas", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
