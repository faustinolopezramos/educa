import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import * as supabase from "../../lib/supabase";
import { ProviderButtons } from "../ProviderButtons";

vi.mock("../../lib/supabase", () => ({
  OAUTH_PROVIDERS: ["google", "azure", "apple"],
  startProviderLogin: vi.fn(),
}));

describe("ProviderButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers every configured provider", () => {
    render(<ProviderButtons onError={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar con Microsoft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar con Apple" })).toBeInTheDocument();
  });

  it("leaves for the provider remembering the academy and where to return", async () => {
    vi.mocked(supabase.startProviderLogin).mockResolvedValue();
    render(<ProviderButtons tenantSlug="alfa" returnTo="/clase/7" onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar con Microsoft" }));
    expect(supabase.startProviderLogin).toHaveBeenCalledWith("azure", {
      tenantSlug: "alfa",
      returnTo: "/clase/7",
    });
    // Mientras sale, no se puede pulsar otro.
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeDisabled();
  });

  it("reports a provider that could not be opened", async () => {
    vi.mocked(supabase.startProviderLogin).mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    render(<ProviderButtons onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar con Google" }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  });

  it("passes login hint when provided", async () => {
    vi.mocked(supabase.startProviderLogin).mockResolvedValue();
    render(<ProviderButtons loginHint="test@example.com" onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(supabase.startProviderLogin).toHaveBeenCalledWith("google", {
      tenantSlug: undefined,
      returnTo: undefined,
      loginHint: "test@example.com",
    });
  });
});

