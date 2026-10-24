import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

// Dos clases de regla:
//  * ERROR — lo que es un bug seguro (reglas de los hooks). Rompe `npm run lint` y el CI.
//  * WARN — deuda conocida que se paga por tandas (accesibilidad, `any`, deps de
//    efectos). Se ve en cada ejecución sin bloquear; al limpiar un tipo de aviso se
//    sube a error para que no vuelva.
export default tseslint.config(
  { ignores: ["dist", "node_modules", "public"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Las reglas de a11y de jsx-a11y vienen como error; aquí pasan a aviso
    // hasta limpiar las existentes (ver arriba).
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules).map((r) => [r, "warn"]),
      ),
      // Obsoleta: la sustituye `label-has-associated-control` y duplicaba cada aviso.
      "jsx-a11y/label-has-for": "off",
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
