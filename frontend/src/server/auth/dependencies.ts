import "server-only";

import { BackendClient } from "@/server/auth/backend-client";
import { getBackendBaseUrl } from "@/server/auth/environment";
import { InMemorySessionStore } from "@/server/auth/session-store";

const globalSessions = globalThis as typeof globalThis & {
  trafficAnalysisSessionStore?: InMemorySessionStore;
};

// Route modules can be evaluated independently, so one process-global store keeps
// their opaque session IDs coherent. Horizontal deployments still require Redis
// or another shared store because globalThis is isolated per Node.js process.
export const sessionStore =
  (globalSessions.trafficAnalysisSessionStore ??= new InMemorySessionStore());

export const backendClient = new BackendClient(sessionStore, {
  baseUrl: getBackendBaseUrl(),
});
