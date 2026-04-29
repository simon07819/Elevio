import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./services/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 42px rgba(250, 204, 21, 0.22)",
        steel: "0 24px 80px rgba(0, 0, 0, 0.42)",
      },
      backgroundImage: {
        "industrial-grid":
          "linear-gradient(rgba(250,204,21,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(250,204,21,0.08) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
