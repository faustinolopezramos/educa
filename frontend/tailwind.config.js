/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Archivo", "system-ui", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
        mono: ["'Space Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        // Primario "pino" — reemplaza el índigo. Mantiene el nombre `brand`
        // para que todas las clases existentes (brand-600, etc.) se reestilen.
        brand: {
          50: "#E0EFEC",
          100: "#C4E1DB",
          500: "#159183",
          600: "#0F6E62",
          700: "#0B564C",
        },
        // Neutros cálidos "papel/tinta" — sobrescriben la escala slate fría.
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
        // Verde "aprobado / bien" — más apagado que el green por defecto.
        green: {
          50: "#E7F0E8",
          100: "#D2E5D5",
          500: "#4C9169",
          600: "#3B7A57",
          700: "#2F6146",
          800: "#264E39",
        },
        // Ámbar "pendiente / atención".
        amber: {
          50: "#F7EDD9",
          100: "#F1E2C4",
          500: "#C9902F",
          600: "#B77A2B",
          700: "#8A5A1C",
        },
        // Ladrillo "riesgo / destructivo" — reemplaza el rojo.
        red: {
          50: "#F6E7E1",
          100: "#F1D9CF",
          500: "#C0523A",
          600: "#A8412C",
          700: "#8A3524",
        },
        // Índigo remapeado a pino para reutilizar usos antiguos.
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
