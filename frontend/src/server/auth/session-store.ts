import "server-only";

import { randomBytes } from "node:crypto";

import type { SessionRecord, TokenPair } from "@/server/auth/types";

export interface SessionStore {
  create(tokens: TokenPair): Promise<string>;
  get(sid: string): Promise<SessionRecord | null>;
  update(sid: string, record: SessionRecord): Promise<void>;
  delete(sid: string): Promise<void>;
  withRefreshLock(
    sid: string,
    refresh: () => Promise<SessionRecord>,
  ): Promise<SessionRecord>;
}

type Clock = () => number;

function toSessionRecord(tokens: TokenPair, now: number): SessionRecord {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: now + Math.max(0, tokens.access_expires_in) * 1_000,
    refreshExpiresAt: now + Math.max(0, tokens.refresh_expires_in) * 1_000,
    profile: tokens.user,
  };
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly refreshes = new Map<string, Promise<SessionRecord>>();

  constructor(private readonly now: Clock = Date.now) {}

  async create(tokens: TokenPair): Promise<string> {
    const sid = randomBytes(32).toString("base64url");
    this.sessions.set(sid, toSessionRecord(tokens, this.now()));
    return sid;
  }

  async get(sid: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(sid);

    if (!session) {
      return null;
    }

    if (session.refreshExpiresAt <= this.now()) {
      this.sessions.delete(sid);
      return null;
    }

    return session;
  }

  async update(sid: string, record: SessionRecord): Promise<void> {
    if (this.sessions.has(sid)) {
      this.sessions.set(sid, record);
    }
  }

  async delete(sid: string): Promise<void> {
    this.sessions.delete(sid);
  }

  async withRefreshLock(
    sid: string,
    refresh: () => Promise<SessionRecord>,
  ): Promise<SessionRecord> {
    const activeRefresh = this.refreshes.get(sid);

    if (activeRefresh) {
      return activeRefresh;
    }

    const refreshPromise = refresh().finally(() => {
      if (this.refreshes.get(sid) === refreshPromise) {
        this.refreshes.delete(sid);
      }
    });

    this.refreshes.set(sid, refreshPromise);
    return refreshPromise;
  }
}

export function sessionRecordFromTokens(
  tokens: TokenPair,
  now: number,
): SessionRecord {
  return toSessionRecord(tokens, now);
}
