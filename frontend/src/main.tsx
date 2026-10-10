// Las fuentes se sirven desde el propio sitio, no desde Google Fonts: así
// ningún tercero recibe la IP de quien visita (ver la Política de Cookies).
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght-italic.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import "./index.css";
import { registerServiceWorker } from "./lib/push";
import { queryClient } from "./lib/queryClient";
import { router } from "./router";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
