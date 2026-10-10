import { describe, expect, it, vi } from "vitest";
import { triggerHaptic } from "../haptics";

describe("triggerHaptic", () => {
  it("calls navigator.vibrate when available", () => {
    const vibrateMock = vi.fn();
    vi.stubGlobal("navigator", { vibrate: vibrateMock });

    triggerHaptic(25);
    expect(vibrateMock).toHaveBeenCalledWith(25);

    triggerHaptic([20, 40, 20]);
    expect(vibrateMock).toHaveBeenCalledWith([20, 40, 20]);

    vi.unstubAllGlobals();
  });

  it("handles missing navigator.vibrate gracefully without throwing", () => {
    vi.stubGlobal("navigator", {});
    expect(() => triggerHaptic(25)).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("catches exceptions from navigator.vibrate quietly", () => {
    const brokenVibrate = vi.fn().mockImplementation(() => {
      throw new Error("Permissions policy violation");
    });
    vi.stubGlobal("navigator", { vibrate: brokenVibrate });

    expect(() => triggerHaptic(50)).not.toThrow();
    vi.unstubAllGlobals();
  });
});
