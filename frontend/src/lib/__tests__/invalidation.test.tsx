import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { useCreateAttendance } from "../queries/attendance";
import { useCreateGrade, useUpdateGrade } from "../queries/grades";
import { useCancelSession, useRescheduleSession } from "../queries/sessions";

/**
 * Qué se vuelve a pedir cuando algo cambia.
 *
 * Estas mutaciones escriben datos de los que el servidor *deriva* otras vistas:
 * la nota final sale de las notas, el reporte y la bandeja de pendientes salen
 * de la asistencia. Nada de eso se invalidaba, así que la pantalla seguía
 * mostrando la respuesta anterior a un cálculo que ya había cambiado — y en el
 * caso de la nota final, esa cifra obsoleta es con la que se decide graduar
 * al alumno.
 *
 * Se prueba sobre las claves y no sobre la interfaz porque la clave es el
 * contrato: cualquier pantalla que lea `["final-grade", id]` queda cubierta,
 * hoy y cuando alguien añada la siguiente.
 */

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

let qc: QueryClient;
let invalidated: string[];

beforeEach(() => {
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  invalidated = [];
  // Registrar la clave pedida es más honesto que espiar el resultado: react-query
  // hace coincidencia por prefijo, así que `["sessions"]` cubre a sus tres hijas
  // y la prueba tiene que poder decir cuál de las dos cosas ocurrió.
  vi.spyOn(qc, "invalidateQueries").mockImplementation((filters?: any) => {
    invalidated.push(JSON.stringify(filters?.queryKey ?? []));
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** True si se invalidó esa clave exacta o un prefijo suyo. */
function wasInvalidated(key: string): boolean {
  return invalidated.some((raw) => {
    const parsed = JSON.parse(raw) as unknown[];
    const target = JSON.parse(key) as unknown[];
    return parsed.every((part, i) => part === target[i]);
  });
}

describe("al calificar", () => {
  beforeEach(() => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: 1 } } as never);
    vi.spyOn(api, "patch").mockResolvedValue({ data: { id: 1 } } as never);
  });

  it("vuelve a pedir la nota final, que el servidor recalcula", async () => {
    const { result } = renderHook(() => useCreateGrade(), { wrapper: wrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({
        enrollment_id: 7,
        evaluation_name: "Examen final",
        score: 9,
      });
    });

    await waitFor(() => expect(wasInvalidated('["final-grade"]')).toBe(true));
  });

  it("también arrastra el reporte y la bandeja", async () => {
    const { result } = renderHook(() => useCreateGrade(), { wrapper: wrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({
        enrollment_id: 7,
        evaluation_name: "Parcial",
        score: 8,
      });
    });

    await waitFor(() => {
      expect(wasInvalidated('["report"]')).toBe(true);
      expect(wasInvalidated('["dashboard"]')).toBe(true);
    });
  });

  it("hace lo mismo al corregir una nota ya puesta", async () => {
    const { result } = renderHook(() => useUpdateGrade(), { wrapper: wrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ id: 3, score: 10 });
    });

    await waitFor(() => expect(wasInvalidated('["final-grade"]')).toBe(true));
  });
});

describe("al pasar lista", () => {
  beforeEach(() => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: 1 } } as never);
  });

  it("refresca el reporte y los pendientes, no sólo la asistencia", async () => {
    const { result } = renderHook(() => useCreateAttendance(), {
      wrapper: wrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({
        enrollment_id: 7,
        session_id: 4,
        status: "present",
      });
    });

    await waitFor(() => {
      expect(wasInvalidated('["attendance"]')).toBe(true);
      expect(wasInvalidated('["report"]')).toBe(true);
      expect(wasInvalidated('["dashboard"]')).toBe(true);
      // Marcar a alguien es la única señal de que la sesión se dio.
      expect(wasInvalidated('["sessions"]')).toBe(true);
    });
  });
});

describe("al cancelar o reprogramar una clase", () => {
  beforeEach(() => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { id: 1 } } as never);
  });

  // Invalidaban `["sessions","all"]`, que ninguna query usa, y dejaban intacta
  // `["sessions", scheduleId]`, que es la lista que el profesor está mirando.
  it("invalida el prefijo, que cubre las tres formas en que se cachean", async () => {
    const { result } = renderHook(() => useCancelSession(), { wrapper: wrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ id: 4, reason: "Incapacidad" });
    });

    expect(invalidated).toContain('["sessions"]');
    expect(invalidated).not.toContain('["sessions","all"]');
  });

  it("avisa también al reporte y a la campana del alumno", async () => {
    const { result } = renderHook(() => useRescheduleSession(), {
      wrapper: wrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 4, new_date: "2026-09-01" });
    });

    await waitFor(() => {
      expect(wasInvalidated('["report"]')).toBe(true);
      expect(wasInvalidated('["notifications"]')).toBe(true);
    });
  });
});
