import "server-only";

import { BackendClient } from "@/server/auth/backend-client";
import { getBackendBaseUrl } from "@/server/auth/environment";
import { InMemorySessionStore } from "@/server/auth/session-store";

const globalSessions = globalThis as typeof globalThis & {
  trafficAnalysisSessionStore?: InMemorySessionStore;
};

// This is process-global only; multi-instance deployments require a shared store.
export const sessionStore =
  (globalSessions.trafficAnalysisSessionStore ??= new InMemorySessionStore());

export const backendClient = new BackendClient(sessionStore, {
  baseUrl: getBackendBaseUrl(),
});
