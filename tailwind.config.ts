import type { Config } from "tailwindcss";

// Phase 4 dashboard palette — matched to the approved dashboard mockup:
// warm off-white canvas, white cards, gold brand mark, and semantic
// green/red/amber for buy/sell/risk. Numbers render tabular.
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F6F2", // app canvas (warm off-white)
        surface: "#FFFFFF", // cards, sidebar
        ink: "#1C1B19", // primary text
        muted: "#8A8678", // labels, captions
        line: "#ECEAE3", // borders, dividers
        brand: "#B8924A", // gold mark ("PERSONAL", sparkle, IQ accent)
        // semantic — market direction + risk
        buy: "#1E9E6A",
        "buy-soft": "#E7F4EE",
        sell: "#C0392B",
        "sell-soft": "#FBEAE8",
        warn: "#C2882E",
        "warn-soft": "#FAF1E1",
        info: "#2D6CDF",
        "info-soft": "#E9F0FC",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: { card: "12px" },
      boxShadow: {
        card: "0 1px 2px rgba(28,27,25,0.04), 0 1px 1px rgba(28,27,25,0.03)",
      },
    },
  },
  plugins: [],
};

export default config;
