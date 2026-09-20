import "server-only";

import { type NextResponse } from "next/server";

import { AppError } from "@/server/auth/errors";
import {
  clearSessionCookie,
  getSessionId,
} from "@/server/auth/cookie";
import { errorResponse } from "@/server/http/errors";

type AuthenticatedRouteAction = (sid: string) => Promise<NextResponse>;

export async function withAuthenticatedSession(
  action: AuthenticatedRouteAction,
): Promise<NextResponse> {
  const sid = await getSessionId();

  if (!sid) {
    return errorResponse(
      new AppError(401, "session_required", "Sign in to continue."),
    );
  }

  try {
    return await action(sid);
  } catch (error) {
    const response = errorResponse(error);

    if (error instanceof AppError && error.status === 401) {
      clearSessionCookie(response);
    }

    return response;
  }
}
