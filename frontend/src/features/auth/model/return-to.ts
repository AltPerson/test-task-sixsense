export const RETURN_TO_HEADER = "x-traffic-analysis-return-to";

const SESSION_PATH = /^\/sessions\/[0-9]+$/u;

export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return "/";
  }

  const queryStart = value.indexOf("?");
  const path = queryStart === -1 ? value : value.slice(0, queryStart);

  // Application page paths never need encoding. Reject it before URL parsing so
  // encoded and double-encoded separators cannot change routing semantics later.
  if (path !== "/" && !SESSION_PATH.test(path)) {
    return "/";
  }

  try {
    const url = new URL(value, "http://app.local");
    const keys = [...url.searchParams.keys()];
    const hasOnlyOptionalQuery =
      keys.length === 0 || (keys.length === 1 && keys[0] === "q");

    return url.origin === "http://app.local" &&
      url.hash === "" &&
      url.pathname === path &&
      hasOnlyOptionalQuery
      ? `${url.pathname}${url.search}`
      : "/";
  } catch {
    return "/";
  }
}

export function loginPathForReturnTo(value: unknown): string {
  return `/login?${new URLSearchParams({ returnTo: safeReturnTo(value) })}`;
}
