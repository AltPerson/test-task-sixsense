import "server-only";

import { NextResponse } from "next/server";

import { AppError } from "@/server/auth/errors";

type PublicErrorBody = {
  error: {
    code: string;
    message: string;
    retry_after_seconds?: number;
    issues?: AppError["issues"];
  };
};

export function errorResponse(error: unknown): NextResponse<PublicErrorBody> {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(
          500,
          "internal_error",
          "The application could not complete the request.",
        );
  const headers = new Headers();

  if (appError.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(appError.retryAfterSeconds));
  }

  return NextResponse.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.retryAfterSeconds !== undefined
          ? { retry_after_seconds: appError.retryAfterSeconds }
          : {}),
        ...(appError.issues ? { issues: appError.issues } : {}),
      },
    },
    { status: appError.status, headers },
  );
}
