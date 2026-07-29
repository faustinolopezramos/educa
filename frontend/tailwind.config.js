/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Una sola fuente tipográfica unificada para toda la plataforma
        sans: ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["'Space Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Ajuste fluido de tamaños según la pantalla/escenario
        "2xs": ["0.6875rem", { lineHeight: "0.875rem" }],
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
      },
      colors: {
        brand: {
          50: "#E0EFEC",
          100: "#C4E1DB",
          500: "#159183",
          600: "#0F6E62",
          700: "#0B564C",
        },
        slate: {
          50: "#F5F2EA",
          100: "#EFEADD",
          200: "#E6DFD0",
          300: "#D6CDB8",
          400: "#9C9484",
          500: "#6B6456",
          600: "#57503F",
          700: "#3E3728",
          800: "#2A2416",
          900: "#191510",
        },
        green: {
          50: "#E7F0E8",
          100: "#D2E5D5",
          500: "#4C9169",
          600: "#3B7A57",
          700: "#2F6146",
          800: "#264E39",
        },
        amber: {
          50: "#F7EDD9",
          100: "#F1E2C4",
          500: "#C9902F",
          600: "#B77A2B",
          700: "#8A5A1C",
        },
        red: {
          50: "#F6E7E1",
          100: "#F1D9CF",
          500: "#C0523A",
          600: "#A8412C",
          700: "#8A3524",
        },
        indigo: {
          50: "#E0EFEC",
          100: "#C4E1DB",
          600: "#0F6E62",
          700: "#0B564C",
        },
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        md: "0.625rem",
        lg: "0.875rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(25,21,16,0.05)",
        lg: "0 20px 45px -25px rgba(25,21,16,0.35)",
      },
    },
  },
  plugins: [],
};
