import { NextResponse } from "next/server";

import {
  isSearchJobWire,
  normalizeSearchJob,
} from "@/features/search/model/search-job";
import { AppError } from "@/server/auth/errors";
import { backendClient } from "@/server/auth/dependencies";
import { withAuthenticatedSession } from "@/server/http/authenticated-route";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export async function POST(request: Request) {
  return withAuthenticatedSession(async (sid) => {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new AppError(
        400,
        "invalid_idempotency_key",
        "A valid Idempotency-Key is required for search creation.",
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new AppError(400, "invalid_json", "A JSON request body is required.");
    }

    const search = await backendClient.getAuthenticatedJson(
      sid,
      "/v1/searches",
      isSearchJobWire,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
      },
    );

    return NextResponse.json(normalizeSearchJob(search), { status: 202 });
  });
}
