import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { RETURN_TO_HEADER } from "@/features/auth/model/return-to";
import { proxy } from "@/proxy";

describe("authentication navigation proxy", () => {
  it("preserves a fresh deep link when the opaque cookie is absent", () => {
    const response = proxy(
      new NextRequest(
        "http://app.test/sessions/9007199254740993?q=definition",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("returnTo")).toBe(
      "/sessions/9007199254740993?q=definition",
    );
  });

  it("preserves the destination for layout validation when sid is stale", () => {
    const response = proxy(
      new NextRequest("http://app.test/sessions/9007199254740993?q=definition", {
        headers: { cookie: "sid=opaque-value" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(
      response.headers.get(`x-middleware-request-${RETURN_TO_HEADER}`),
    ).toBe("/sessions/9007199254740993?q=definition");
  });
});
