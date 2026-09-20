import { describe, expect, it } from "vitest";

import {
  errorFromBackendResponse,
  parseRetryAfter,
} from "@/server/auth/errors";
import { errorResponse } from "@/server/http/errors";
import { readPublicApiError } from "@/lib/http";

describe("parseRetryAfter", () => {
  it("parses seconds and HTTP dates", () => {
    const now = Date.UTC(2026, 8, 19, 12, 0, 0);

    expect(parseRetryAfter("12", now)).toBe(12);
    expect(
      parseRetryAfter(new Date(now + 5_000).toUTCString(), now),
    ).toBe(5);
    expect(parseRetryAfter("not-a-date", now)).toBeUndefined();
  });
});

describe("errorFromBackendResponse", () => {
  it("normalizes domain and validation error shapes", async () => {
    const domainError = await errorFromBackendResponse(
      Response.json(
        { detail: "Too many attempts.", code: "login_rate_limited" },
        { status: 429, headers: { "retry-after": "9" } },
      ),
    );
    const validationError = await errorFromBackendResponse(
      Response.json(
        {
          detail: [
            {
              loc: ["body", "email"],
              msg: "Invalid email",
              type: "value_error",
              input: "not-an-email",
            },
          ],
        },
        { status: 422 },
      ),
    );

    expect(domainError).toMatchObject({
      status: 429,
      code: "login_rate_limited",
      retryAfterSeconds: 9,
    });
    expect(validationError).toMatchObject({
      status: 422,
      code: "validation_error",
      issues: [
        {
          location: ["body", "email"],
          message: "Invalid email",
          code: "value_error",
        },
      ],
    });
  });

  it("preserves transient retry timing across the BFF boundary", async () => {
    const backendError = await errorFromBackendResponse(
      Response.json(
        { detail: "Catalog is warming.", code: "catalog_warming" },
        { status: 503, headers: { "retry-after": "2" } },
      ),
    );
    const response = errorResponse(backendError);

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("2");
    await expect(
      readPublicApiError(response, "Unavailable."),
    ).resolves.toEqual({
      code: "catalog_warming",
      message: "Catalog is warming.",
      retryAfterSeconds: 2,
    });
  });
});
