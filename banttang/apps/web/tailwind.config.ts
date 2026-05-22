import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn/ui 도입 시 CSS variable로 확장
        brand: {
          DEFAULT: "#7FB069",
          foreground: "#ffffff",
          50: "#F1F7EA",
          100: "#DDEBC9",
          200: "#BDDA9F",
          dark: "#6B9F5A",
        },
      },
      fontFamily: {
        sans: ["var(--font-pretendard)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
