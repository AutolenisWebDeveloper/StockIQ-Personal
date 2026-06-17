import type { Config } from "tailwindcss";

// Tokens derived from StockIQ-Frontend-Design-Direction.md §7.
// Color is reserved for two semantic axes only: market direction (up/down)
// and the system/you (accent). Everything else is ink on paper.
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F6F7",
        surface: "#FFFFFF",
        ink: "#16191D",
        slate: "#5B636C",
        rule: "#E2E5E8",
        up: "#0E7C66",
        down: "#B23A2E",
        accent: "#1B43C8",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        sans: ['"IBM Plex Sans"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        prov: ["11px", { lineHeight: "14px" }],
        eyebrow: ["11px", { letterSpacing: "0.08em" }],
        data: ["13px", "18px"],
        verdict: ["44px", "46px"],
        metric: ["28px", "30px"],
      },
    },
  },
  plugins: [],
};

export default config;
