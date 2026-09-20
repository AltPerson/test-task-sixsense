import { describe, expect, it } from "vitest";

import {
  loginPathForReturnTo,
  safeReturnTo,
} from "@/features/auth/model/return-to";

describe("safeReturnTo", () => {
  it("preserves a string-ID session evidence link with its query", () => {
    const target =
      "/sessions/18446744073709551615?q=%7B%22version%22%3A1%7D";
    expect(safeReturnTo(target)).toBe(target);
  });

  it("preserves a search-definition permalink", () => {
    const target = "/?q=%7B%22version%22%3A1%2C%22sort%22%3A%22-ts%22%7D";
    expect(safeReturnTo(target)).toBe(target);
  });

  it.each([
    "/login",
    "/login?returnTo=/login",
    "/logout",
    "/api/me",
    "/_next/static/chunk.js",
    "https://attacker.test",
    "//attacker.test/path",
    "%2F%2Fattacker.test",
    "%252F%252Fattacker.test",
    "%5C%5Cattacker.test",
    "%255C%255Cattacker.test",
    "/%2F%2Fattacker.test",
    "/%252F%252Fattacker.test",
    "/%5C%5Cattacker.test",
    "/%255C%255Cattacker.test",
    "/\\attacker.test/path",
    "/sessions/not-a-decimal-id",
    "/sessions/123?next=/login",
    "/sessions/123?%",
    "/sessions/123#fragment",
    "/sessions/123\nLocation: https://attacker.test",
    "",
    undefined,
    ["/sessions/123"],
  ])("rejects unsafe or non-page return target %j", (value) => {
    expect(safeReturnTo(value)).toBe("/");
    expect(loginPathForReturnTo(value)).toBe("/login?returnTo=%2F");
  });

  it("encodes an accepted destination for the login redirect", () => {
    expect(loginPathForReturnTo("/sessions/123?q=definition")).toBe(
      "/login?returnTo=%2Fsessions%2F123%3Fq%3Ddefinition",
    );
  });
});
