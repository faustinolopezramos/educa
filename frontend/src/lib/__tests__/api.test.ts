import { describe, it, expect, vi, beforeEach } from "vitest";
import { getToken, setToken, apiErrorMessage } from "../api";

describe("Token Management", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getToken", () => {
    it("should return stored token", () => {
      localStorage.setItem("educa_token", "test_token_123");
      expect(getToken()).toBe("test_token_123");
    });

    it("should return null when no token stored", () => {
      expect(getToken()).toBeNull();
    });
  });

  describe("setToken", () => {
    it("should store token in localStorage", () => {
      setToken("new_token");
      expect(localStorage.getItem("educa_token")).toBe("new_token");
    });

    it("should remove token when null is passed", () => {
      localStorage.setItem("educa_token", "existing_token");
      setToken(null);
      expect(localStorage.getItem("educa_token")).toBeNull();
    });

    it("should not store when passed null directly", () => {
      setToken(null);
      expect(localStorage.getItem("educa_token")).toBeNull();
    });
  });
});

describe("apiErrorMessage", () => {
  it("should extract error detail as string", () => {
    const error = {
      response: {
        data: {
          detail: "Invalid request",
        },
      },
    };
    expect(apiErrorMessage(error)).toBe("Invalid request");
  });

  it("should extract error message from detail object", () => {
    const error = {
      response: {
        data: {
          detail: {
            message: "Field required",
          },
        },
      },
    };
    expect(apiErrorMessage(error)).toBe("Field required");
  });

  it("should return fallback for unknown error format", () => {
    const error = { response: { data: {} } };
    expect(apiErrorMessage(error)).toBe("Ocurrió un error");
  });

  it("should use custom fallback message", () => {
    const error = { response: { data: {} } };
    expect(apiErrorMessage(error, "Custom fallback")).toBe("Custom fallback");
  });

  it("should handle error without response", () => {
    const error = new Error("Network error");
    expect(apiErrorMessage(error)).toBe("Ocurrió un error");
  });
});
