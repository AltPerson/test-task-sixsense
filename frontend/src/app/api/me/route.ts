import { NextResponse } from "next/server";

import { AppError } from "@/server/auth/errors";
import {
  clearSessionCookie,
  getSessionId,
} from "@/server/auth/cookie";
import { backendClient } from "@/server/auth/dependencies";
import { errorResponse } from "@/server/http/errors";

export async function GET() {
  const sid = await getSessionId();

  if (!sid) {
    return errorResponse(
      new AppError(401, "session_required", "Sign in to continue."),
    );
  }

  try {
    const profile = await backendClient.getProfile(sid);
    return NextResponse.json({ user: profile });
  } catch (error) {
    const response = errorResponse(error);

    if (error instanceof AppError && error.status === 401) {
      clearSessionCookie(response);
    }

    return response;
  }
}
