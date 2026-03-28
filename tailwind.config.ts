import type { Config } from "tailwindcss";
import containerQueries from "@tailwindcss/container-queries";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: "#09090b",
        background: "#09090b",
        foreground: "#f8deca",
        primary: "#ffb688",
        "primary-container": "#ff7f00",
        "on-primary": "#512400",
        secondary: "#ffb780",
        "text-muted": "#dfc0af",
        outline: "#8f6b54",
        "outline-variant": "#584235",
        "surface-container": "#1d1106",
        "surface-container-low": "#170c03",
        "surface-container-lowest": "#100802",
        "surface-container-high": "#26160a",
        "surface-container-highest": "#332015",
      },
      fontFamily: {
        headline: ["var(--font-headline)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        label: ["var(--font-headline)", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        full: "9999px",
      },
    },
  },
  plugins: [forms, containerQueries],
};

export default config;
