import { describe, expect, it, vi } from "vitest";

import AuthenticatedLayout from "@/app/(app)/layout";
import { RETURN_TO_HEADER } from "@/features/auth/model/return-to";

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/server/auth/current-user", () => auth);
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      [RETURN_TO_HEADER]: "/sessions/18446744073709551615?q=definition",
    }),
}));
vi.mock("next/navigation", () => navigation);
vi.mock("@/features/auth/ui/logout-button", () => ({
  LogoutButton: () => null,
}));

describe("AuthenticatedLayout", () => {
  it("preserves an evidence link when the opaque sid is stale", async () => {
    auth.getCurrentUser.mockResolvedValue(null);

    await expect(AuthenticatedLayout({ children: null })).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(navigation.redirect).toHaveBeenCalledWith(
      "/login?returnTo=%2Fsessions%2F18446744073709551615%3Fq%3Ddefinition",
    );
  });
});
