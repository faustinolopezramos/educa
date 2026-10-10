import { useEffect, useState } from "react";

const STORAGE_KEY = "educa:projector-mode";

/**
 * Hook para alternar el modo Proyector / Alto Contraste.
 * Diseñado para aulas iluminadas o proyectores con bajo contraste.
 * Persiste la preferencia en localStorage y aplica la clase CSS `.projector-mode`
 * al elemento raíz `<html>`.
 */
export function useProjectorMode() {
  const [isProjector, setIsProjector] = useState(() => {
    try {
      if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(isProjector));
      }
      if (typeof document !== "undefined") {
        if (isProjector) {
          document.documentElement.classList.add("projector-mode");
        } else {
          document.documentElement.classList.remove("projector-mode");
        }
      }
    } catch {
      // Ignorar fallos de acceso a localStorage o DOM
    }
  }, [isProjector]);

  function toggle() {
    setIsProjector((prev) => !prev);
  }

  return { isProjector, toggle };
}
