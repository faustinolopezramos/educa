import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useProjectorMode } from "../useProjectorMode";

describe("useProjectorMode", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("projector-mode");
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("projector-mode");
  });

  it("defaults to false when localStorage is empty", () => {
    const { result } = renderHook(() => useProjectorMode());
    expect(result.current.isProjector).toBe(false);
    expect(document.documentElement.classList.contains("projector-mode")).toBe(false);
  });

  it("toggles projector mode and persists in localStorage and html class", () => {
    const { result } = renderHook(() => useProjectorMode());

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isProjector).toBe(true);
    expect(localStorage.getItem("educa:projector-mode")).toBe("true");
    expect(document.documentElement.classList.contains("projector-mode")).toBe(true);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isProjector).toBe(false);
    expect(localStorage.getItem("educa:projector-mode")).toBe("false");
    expect(document.documentElement.classList.contains("projector-mode")).toBe(false);
  });

  it("initializes from stored localStorage value", () => {
    localStorage.setItem("educa:projector-mode", "true");
    const { result } = renderHook(() => useProjectorMode());
    expect(result.current.isProjector).toBe(true);
    expect(document.documentElement.classList.contains("projector-mode")).toBe(true);
  });
});
