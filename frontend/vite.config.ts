import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Los prefijos son los de `include_router` en backend/app/main.py. Los que
      // faltaban (makeups, payments, dashboard, grading) no llegaban a la API en
      // desarrollo: Vite los servía como index.html y la pantalla salía vacía.
      "^/(auth|users|catalog|holidays|location-proposals|enrollments|schedules|sessions|grades|grading|rooms|attendance|makeups|meetings|payments|dashboard|reports|notifications|audit|teachers|tenants|assignments)(/|$|\\?)":
        {
          target: "http://localhost:8000",
          changeOrigin: true,
        },
    },
  },
  define: {
    __VITE_API_URL__: JSON.stringify(process.env.VITE_API_URL),
  },
});
