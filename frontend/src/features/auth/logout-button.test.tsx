import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "@/features/auth/logout-button";

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function renderLogoutButton() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <LogoutButton />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("LogoutButton", () => {
  beforeEach(() => {
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns to sign in after the BFF clears the local session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { error: { code: "backend_unavailable", message: "Unavailable." } },
        { status: 502 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderLogoutButton();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/login"),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    });
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("stays on the page and offers retry when the BFF cannot be reached", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network failure"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    renderLogoutButton();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out could not be confirmed. Check your connection and retry.",
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry sign out" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry sign out" }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/login"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
