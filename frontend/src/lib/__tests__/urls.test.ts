import { describe, expect, it } from "vitest";
import { safeUrl } from "../urls";

describe("safeUrl", () => {
  it("allows valid https and http URLs", () => {
    expect(safeUrl("https://zoom.us/j/123456789")).toBe("https://zoom.us/j/123456789");
    expect(safeUrl("http://meet.google.com/abc-def-ghi")).toBe("http://meet.google.com/abc-def-ghi");
    expect(safeUrl("  https://teams.microsoft.com/l/meetup-join  ")).toBe("https://teams.microsoft.com/l/meetup-join");
  });

  it("allows relative paths", () => {
    expect(safeUrl("/dashboard/classes")).toBe("/dashboard/classes");
  });

  it("blocks dangerous javascript: pseudo-protocol", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("JAVASCRIPT:alert('xss')")).toBeUndefined();
    expect(safeUrl("  javascript:void(0)  ")).toBeUndefined();
  });

  it("blocks data: and vbscript: URIs", () => {
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeUrl("vbscript:msgbox(1)")).toBeUndefined();
    expect(safeUrl("file:///etc/passwd")).toBeUndefined();
  });

  it("returns undefined for null, undefined or empty string", () => {
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
    expect(safeUrl("")).toBeUndefined();
    expect(safeUrl("   ")).toBeUndefined();
  });
});
