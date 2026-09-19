import { describe, expect, it } from "vitest";

import {
  BackendClient,
  type BackendFetch,
} from "@/server/auth/backend-client";
import { InMemorySessionStore } from "@/server/auth/session-store";
import type { TokenPair, UserProfile } from "@/server/auth/types";

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);

const profile: UserProfile = {
  id: "user-1",
  email: "analyst@example.test",
  display_name: "Test Analyst",
  role: "analyst",
  permissions: ["sessions:read"],
  sensor_ids: ["sensor-1"],
};

function tokenPair(overrides: Partial<TokenPair> = {}): TokenPair {
  return {
    access_token: "expired-access-token",
    token_type: "bearer",
    access_expires_in: 0,
    refresh_token: "single-use-refresh-token",
    refresh_expires_in: 3_600,
    user: profile,
    ...overrides,
  };
}

describe("BackendClient", () => {
  it("shares one refresh across concurrent requests", async () => {
    const sessions = new InMemorySessionStore(() => NOW);
    const sid = await sessions.create(tokenPair());
    let refreshCalls = 0;
    let profileCalls = 0;

    const fetchBackend: BackendFetch = async (input, init) => {
      const url = new URL(input);

      if (url.pathname === "/v1/auth/refresh") {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return Response.json(
          tokenPair({
            access_token: "fresh-access-token",
            access_expires_in: 90,
            refresh_token: "rotated-refresh-token",
          }),
        );
      }

      if (url.pathname === "/v1/me") {
        profileCalls += 1;
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer fresh-access-token",
        );
        return Response.json(profile);
      }

      throw new Error(`Unexpected backend request: ${url.pathname}`);
    };

    const client = new BackendClient(sessions, {
      baseUrl: "http://backend.test",
      fetch: fetchBackend,
      now: () => NOW,
    });

    const profiles = await Promise.all(
      Array.from({ length: 8 }, () => client.getProfile(sid)),
    );

    expect(profiles).toEqual(Array.from({ length: 8 }, () => profile));
    expect(refreshCalls).toBe(1);
    expect(profileCalls).toBe(8);
  });

  it("refreshes and retries once after a protected request returns 401", async () => {
    const sessions = new InMemorySessionStore(() => NOW);
    const sid = await sessions.create(
      tokenPair({
        access_token: "current-access-token",
        access_expires_in: 90,
      }),
    );
    let refreshCalls = 0;
    const profileAuthorizationHeaders: Array<string | null> = [];

    const fetchBackend: BackendFetch = async (input, init) => {
      const url = new URL(input);

      if (url.pathname === "/v1/auth/refresh") {
        refreshCalls += 1;
        return Response.json(
          tokenPair({
            access_token: "rotated-access-token",
            access_expires_in: 90,
            refresh_token: "rotated-refresh-token",
          }),
        );
      }

      if (url.pathname === "/v1/me") {
        const authorization = new Headers(init?.headers).get("authorization");
        profileAuthorizationHeaders.push(authorization);

        if (authorization === "Bearer current-access-token") {
          return Response.json(
            { detail: "Access token expired.", code: "access_expired" },
            { status: 401 },
          );
        }

        if (authorization === "Bearer rotated-access-token") {
          return Response.json(profile);
        }
      }

      throw new Error(`Unexpected backend request: ${url.pathname}`);
    };

    const client = new BackendClient(sessions, {
      baseUrl: "http://backend.test",
      fetch: fetchBackend,
      now: () => NOW,
    });

    await expect(client.getProfile(sid)).resolves.toEqual(profile);
    expect(refreshCalls).toBe(1);
    expect(profileAuthorizationHeaders).toEqual([
      "Bearer current-access-token",
      "Bearer rotated-access-token",
    ]);
  });

  it("destroys the local session when refresh authentication fails", async () => {
    const sessions = new InMemorySessionStore(() => NOW);
    const sid = await sessions.create(tokenPair());
    const fetchBackend: BackendFetch = async () =>
      Response.json(
        { detail: "Refresh token is invalid.", code: "invalid_refresh" },
        { status: 401 },
      );
    const client = new BackendClient(sessions, {
      baseUrl: "http://backend.test",
      fetch: fetchBackend,
      now: () => NOW,
    });

    await expect(client.getProfile(sid)).rejects.toMatchObject({
      status: 401,
      code: "invalid_refresh",
    });
    await expect(sessions.get(sid)).resolves.toBeNull();
  });
});
