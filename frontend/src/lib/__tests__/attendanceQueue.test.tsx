import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import {
  isTransientError,
  loadPending,
  savePending,
  useAttendanceQueue,
  withoutSent,
} from "../attendanceQueue";
import * as toast from "../toast";

/**
 * La cola de marcas del modo clase: lo que el profesor toca en el aula no se
 * pierde por una wifi que se cae, y lo que el servidor rechaza no se reintenta
 * para siempre.
 */

const networkError = () => Object.assign(new Error("Network Error"), { response: undefined });
const httpError = (status: number, detail: unknown) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail } } });

describe("piezas puras", () => {
  it("distingue fallos de red de rechazos del servidor", () => {
    expect(isTransientError(networkError())).toBe(true);
    expect(isTransientError(httpError(503, "x"))).toBe(true);
    expect(isTransientError(httpError(429, "x"))).toBe(true);
    expect(isTransientError(httpError(409, "x"))).toBe(false);
    expect(isTransientError(httpError(403, "x"))).toBe(false);
  });

  it("no quita lo que se volvió a tocar mientras se enviaba", () => {
    expect(withoutSent({ 1: "absent", 2: "present" }, { 1: "present", 2: "present" })).toEqual({
      1: "absent",
    });
  });

  it("guarda en el teléfono y descarta una cola de otra jornada", () => {
    savePending(7, { 3: "late" }, 1_000);
    expect(loadPending(7, 2_000)).toEqual({ 3: "late" });
    expect(loadPending(7, 1_000 + 13 * 60 * 60 * 1000)).toEqual({});
    expect(localStorage.getItem("educa:attendance-queue:7")).toBeNull();
  });
});

describe("useAttendanceQueue", () => {
  let qc: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    qc = new QueryClient();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("agrupa los toques seguidos en un solo envío", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useAttendanceQueue(1), { wrapper });

    act(() => {
      result.current.mark(10, "absent");
      result.current.mark(11, "absent");
    });
    expect(result.current.count).toBe(2);
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toEqual({
      items: [
        { enrollment_id: 10, status: "absent" },
        { enrollment_id: 11, status: "absent" },
      ],
    });
    expect(result.current.count).toBe(0);
  });

  it("sin red guarda las marcas y las reintenta hasta que llegan", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useAttendanceQueue(2), { wrapper });

    act(() => result.current.mark(10, "present"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(result.current.offline).toBe(true);
    expect(result.current.count).toBe(1);
    expect(loadPending(2)).toEqual({ 10: "present" });

    await act(() => vi.advanceTimersByTimeAsync(2_100));
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.current.offline).toBe(false);
    expect(result.current.count).toBe(0);
    expect(loadPending(2)).toEqual({});
  });

  it("al volver la conexión envía sin esperar al reintento", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useAttendanceQueue(3), { wrapper });

    act(() => result.current.mark(10, "late"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(result.current.offline).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.current.count).toBe(0);
  });

  it("un rechazo del servidor no se reintenta: se descarta y se explica", async () => {
    const post = vi.spyOn(api, "post").mockRejectedValue(
      httpError(409, { reason: "register_closed", message: "La lista de esta clase ya está cerrada" }),
    );
    const notify = vi.spyOn(toast, "notify").mockImplementation(() => {});
    const { result } = renderHook(() => useAttendanceQueue(4), { wrapper });

    act(() => result.current.mark(10, "absent"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(0);
    expect(notify).toHaveBeenCalledWith("La lista de esta clase ya está cerrada", "error");
  });

  it("recupera lo que quedó guardado al volver a abrir la clase", async () => {
    savePending(5, { 10: "excused" });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderHook(() => useAttendanceQueue(5), { wrapper });

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(post.mock.calls[0][1]).toEqual({ items: [{ enrollment_id: 10, status: "excused" }] });
  });
});
