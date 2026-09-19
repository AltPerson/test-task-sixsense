import { NextResponse } from "next/server";

import { AppError } from "@/server/auth/errors";
import { setSessionCookie } from "@/server/auth/cookie";
import { backendClient, sessionStore } from "@/server/auth/dependencies";
import { isLoginCredentials } from "@/server/auth/types";
import { errorResponse } from "@/server/http/errors";

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new AppError(400, "invalid_json", "A JSON request body is required.");
    }

    if (!isLoginCredentials(body)) {
      throw new AppError(
        422,
        "validation_error",
        "Email and password must both be strings.",
      );
    }

    const tokens = await backendClient.login(body);
    const sid = await sessionStore.create(tokens);
    const response = NextResponse.json({ user: tokens.user });
    setSessionCookie(response, sid);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
