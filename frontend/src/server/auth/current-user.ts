import "server-only";

import { getSessionId } from "@/server/auth/cookie";
import { sessionStore } from "@/server/auth/dependencies";
import type { UserProfile } from "@/server/auth/types";

export async function getCurrentUser(): Promise<UserProfile | null> {
  const sid = await getSessionId();

  if (!sid) {
    return null;
  }

  return (await sessionStore.get(sid))?.profile ?? null;
}
