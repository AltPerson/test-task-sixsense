import "server-only";

import {
  AppError,
  errorFromBackendResponse,
  networkError,
} from "@/server/auth/errors";
import { sessionRecordFromTokens } from "@/server/auth/session-store";
import type { SessionStore } from "@/server/auth/session-store";
import {
  isTokenPair,
  isUserProfile,
  type LoginCredentials,
  type SessionRecord,
  type TokenPair,
  type UserProfile,
} from "@/server/auth/types";
import type { JsonGuard } from "@/lib/validation";

export type BackendFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type BackendClientOptions = {
  baseUrl: string;
  fetch?: BackendFetch;
  now?: () => number;
  accessExpirySkewMs?: number;
};

const JSON_HEADERS = {
  "content-type": "application/json",
} as const;

export class BackendClient {
  private readonly baseUrl: URL;
  private readonly fetchBackend: BackendFetch;
  private readonly now: () => number;
  private readonly accessExpirySkewMs: number;

  constructor(
    private readonly sessions: SessionStore,
    options: BackendClientOptions,
  ) {
    this.baseUrl = new URL(options.baseUrl);
    this.fetchBackend = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.accessExpirySkewMs = options.accessExpirySkewMs ?? 5_000;
  }

  async login(credentials: LoginCredentials): Promise<TokenPair> {
    const response = await this.request("/v1/auth/login", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(credentials),
    });

    return this.readJson(response, isTokenPair);
  }

  async getProfile(sid: string): Promise<UserProfile> {
    const profile = await this.getAuthenticatedJson(
      sid,
      "/v1/me",
      isUserProfile,
    );
    const current = await this.sessions.get(sid);

    if (current) {
      await this.sessions.update(sid, { ...current, profile });
    }

    return profile;
  }

  async getAuthenticatedJson<T>(
    sid: string,
    path: string,
    guard: JsonGuard<T>,
  ): Promise<T> {
    let session = await this.requireSession(sid);

    // Refresh slightly early so a token does not expire while a request is in flight.
    if (this.isAccessExpiring(session)) {
      session = await this.refreshSession(sid, session.accessToken);
    }

    let response = await this.authorizedRequest(path, session.accessToken);

    if (response.status === 401) {
      // A protected request gets one reactive refresh and one retry, never a loop.
      session = await this.refreshSession(sid, session.accessToken);
      response = await this.authorizedRequest(path, session.accessToken);

      if (response.status === 401) {
        await this.sessions.delete(sid);
      }
    }

    if (!response.ok) {
      throw await errorFromBackendResponse(response);
    }

    return this.readJson(response, guard);
  }

  async logout(sid: string): Promise<void> {
    const session = await this.sessions.get(sid);

    if (!session) {
      return;
    }

    const response = await this.request("/v1/auth/logout", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    if (response.status !== 204) {
      throw new AppError(
        502,
        "invalid_backend_response",
        "The backend returned an unexpected logout response.",
      );
    }
  }

  private async authorizedRequest(
    path: string,
    accessToken: string,
  ): Promise<Response> {
    return this.send(path, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
  }

  private async refreshSession(
    sid: string,
    observedAccessToken: string,
  ): Promise<SessionRecord> {
    return this.sessions.withRefreshLock(sid, async () => {
      const current = await this.requireSession(sid);

      // Another request may have rotated the single-use refresh token while this
      // caller waited for the lock. Reuse its result instead of rotating again.
      if (current.accessToken !== observedAccessToken) {
        return current;
      }

      let response: Response;

      try {
        response = await this.request("/v1/auth/refresh", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ refresh_token: current.refreshToken }),
        });
      } catch (error) {
        if (error instanceof AppError && error.status === 401) {
          // Refresh authentication failures mean the backend token family can no
          // longer be trusted, so the opaque application session must also end.
          await this.sessions.delete(sid);
        }

        throw error;
      }

      const tokens = await this.readJson(response, isTokenPair);
      const refreshed = sessionRecordFromTokens(tokens, this.now());
      await this.sessions.update(sid, refreshed);
      return refreshed;
    });
  }

  private async requireSession(sid: string): Promise<SessionRecord> {
    const session = await this.sessions.get(sid);

    if (!session) {
      throw new AppError(401, "session_expired", "Sign in again to continue.");
    }

    return session;
  }

  private isAccessExpiring(session: SessionRecord): boolean {
    return session.accessExpiresAt <= this.now() + this.accessExpirySkewMs;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await this.send(path, init);

    if (!response.ok) {
      throw await errorFromBackendResponse(response);
    }

    return response;
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    let response: Response;

    try {
      response = await this.fetchBackend(new URL(path, this.baseUrl), {
        ...init,
        cache: "no-store",
      });
    } catch {
      throw networkError();
    }

    return response;
  }

  private async readJson<T>(
    response: Response,
    guard: JsonGuard<T>,
  ): Promise<T> {
    let value: unknown;

    try {
      value = await response.json();
    } catch {
      throw new AppError(
        502,
        "invalid_backend_response",
        "The backend returned an incomplete response.",
      );
    }

    if (!guard(value)) {
      throw new AppError(
        502,
        "invalid_backend_response",
        "The backend response did not match the expected contract.",
      );
    }

    return value;
  }
}
