import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "^/(auth|users|catalog|certificates|holidays|location-proposals|enrollments|schedules|sessions|grades|rooms|attendance|meetings|reports|notifications|audit|teachers)(/|$|\\?)":
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
