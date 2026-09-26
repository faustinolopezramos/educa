import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  // En desarrollo VITE_API_URL va vacía a propósito: las rutas relativas pasan
  // por el proxy de abajo. En un build no hay proxy, así que vacía significa que
  // el frontend se llama a sí mismo — en Vercel, un POST /auth/login que acaba
  // en 405 — y el fallo sólo se ve al intentar entrar. Mejor que no compile.
  if (command === "build") {
    const apiUrl = loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL?.trim();
    if (!apiUrl) {
      throw new Error(
        "VITE_API_URL no está definida. Sin ella el frontend llama a su propio " +
          "dominio en vez de al backend. Defínela en Vercel (Settings → " +
          "Environment Variables) o en frontend/.env.production.",
      );
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Los prefijos son los de `include_router` en backend/app/main.py. Los que
        // faltaban (makeups, payments, dashboard, grading) no llegaban a la API en
        // desarrollo: Vite los servía como index.html y la pantalla salía vacía.
        "^/(auth|users|catalog|holidays|location-proposals|enrollments|renewals|schedules|sessions|grades|grading|rooms|attendance|makeups|meetings|payments|dashboard|reports|notifications|push|audit|teachers|tenants|assignments)(/|$|\\?)":
          {
            target: "http://localhost:8000",
            changeOrigin: true,
          },
      },
    },
    define: {
      __VITE_API_URL__: JSON.stringify(process.env.VITE_API_URL),
    },
  };
});
