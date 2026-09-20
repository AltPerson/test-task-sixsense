import { NextResponse } from "next/server";

import {
  isSessionDetail,
  isSessionId,
  normalizeSessionDetail,
} from "@/features/session/session-detail";
import { AppError } from "@/server/auth/errors";
import { backendClient } from "@/server/auth/dependencies";
import { withAuthenticatedSession } from "@/server/http/authenticated-route";

type SessionRouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, context: SessionRouteContext) {
  return withAuthenticatedSession(async (sid) => {
    const { sessionId } = await context.params;

    // Match the backend's deliberate 404 semantics for malformed opaque IDs.
    if (!isSessionId(sessionId)) {
      throw new AppError(404, "session_not_found", "Session was not found.");
    }

    const session = await backendClient.getAuthenticatedJson(
      sid,
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
      isSessionDetail,
    );

    if (session.id !== sessionId) {
      throw new AppError(
        502,
        "invalid_backend_response",
        "The backend returned an unexpected session.",
      );
    }

    return NextResponse.json(normalizeSessionDetail(session));
  });
}
