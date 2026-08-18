import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#7A5C0A",
        accent: "#B8860B",
        electric: "#D4AF37",
        violet: "#9C7A1A",
        success: "#1FAE7A",
        warning: "#C98A2C",
        danger: "#C0392B",
      },
      backgroundImage: {
        "grad-navy": "linear-gradient(135deg, #3D2E05 0%, #9C7A1A 55%, #D4AF37 130%)",
        "grad-violet": "linear-gradient(135deg, #9C7A1A 0%, #B8860B 100%)",
        "grad-success": "linear-gradient(135deg, #1FAE7A 0%, #D4AF37 120%)",
        "grid-tech": "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(212,175,55,.18), 0 8px 24px -8px rgba(122,92,10,.35)",
        "glow-lg": "0 0 40px -8px rgba(212,175,55,.35), 0 12px 32px -12px rgba(61,46,5,.45)",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(212,175,55,.5)" },
          "50%": { opacity: ".85", boxShadow: "0 0 0 6px rgba(212,175,55,0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        floatUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        "float-up": "floatUp .35s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
