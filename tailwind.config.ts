import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        pacelab: {
          navy: "#0B1020",
          card: "#131A2E",
          border: "#1E2942",
          lime: {
            DEFAULT: "#B7F34A",
            hover: "#A3E332",
            active: "#8FCE20",
            subtle: "rgba(183, 243, 74, 0.15)",
          },
          white: "#FFFFFF",
          muted: "#8E9BB0",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
