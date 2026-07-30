/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Una sola familia tipográfica en toda la plataforma. `serif` es un
        // alias histórico que apunta a la misma fuente: la jerarquía se
        // construye con tamaño y peso, no mezclando familias.
        sans: ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["'Space Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
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
          50: "#E8F2F0",
          100: "#C4E1DB",
          200: "#9CCDC4",
          300: "#6DB3A7",
          400: "#3E9C8D",
          500: "#159183",
          600: "#0F6E62",
          700: "#0B564C",
          800: "#08423A",
          900: "#062F29",
        },
        slate: {
          50: "#F7F5EF",
          100: "#EFEADD",
          200: "#E2DBCA",
          300: "#CFC6B0",
          400: "#9C9484",
          500: "#6B6456",
          600: "#57503F",
          700: "#3E3728",
          800: "#2A2416",
          900: "#191510",
        },
        // `emerald` se reasigna a la misma familia verde cálida del sistema.
        // Antes convivían el emerald por defecto de Tailwind (#10b981, un menta
        // frío) y esta paleta cálida en la misma pantalla, y el choque se veía.
        emerald: {
          50: "#E9F1EA",
          100: "#D2E5D5",
          200: "#B3D2B9",
          300: "#8CBA97",
          400: "#68A47C",
          500: "#4C9169",
          600: "#3B7A57",
          700: "#2F6146",
          800: "#264E39",
          900: "#1C3A2B",
        },
        green: {
          50: "#E9F1EA",
          100: "#D2E5D5",
          500: "#4C9169",
          600: "#3B7A57",
          700: "#2F6146",
          800: "#264E39",
        },
        amber: {
          50: "#F9F1E1",
          100: "#F1E2C4",
          200: "#E5CD9C",
          500: "#C9902F",
          600: "#B77A2B",
          700: "#8A5A1C",
          800: "#6B4615",
          900: "#4A3010",
        },
        red: {
          50: "#F8EBE6",
          100: "#F1D9CF",
          200: "#E4BCAC",
          500: "#C0523A",
          600: "#A8412C",
          700: "#8A3524",
          800: "#6B2A1D",
          900: "#4A1D14",
        },
        indigo: {
          50: "#E8F2F0",
          100: "#C4E1DB",
          200: "#9CCDC4",
          600: "#0F6E62",
          700: "#0B564C",
        },
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        md: "0.625rem",
        lg: "0.75rem",
        xl: "0.875rem",
        "2xl": "1rem",
      },
      // Escala de elevación explícita y corta. `2xs`/`xs` no existen en
      // Tailwind v3, y el código los usaba en ~100 sitios creyendo que hacían
      // algo: no generaban CSS. Ahora son reales y deliberadamente sutiles.
      boxShadow: {
        "2xs": "0 1px 1px rgba(25,21,16,0.03)",
        xs: "0 1px 2px rgba(25,21,16,0.04)",
        sm: "0 1px 2px rgba(25,21,16,0.06)",
        md: "0 2px 8px -2px rgba(25,21,16,0.08)",
        lg: "0 8px 24px -8px rgba(25,21,16,0.14)",
        xl: "0 16px 40px -16px rgba(25,21,16,0.20)",
      },
      backdropBlur: {
        xs: "2px",
      },
      scale: {
        98: "0.98",
      },
    },
  },
  plugins: [],
};
