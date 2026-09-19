import "server-only";

const DEFAULT_BACKEND_BASE_URL = "http://localhost:8700";

export function getBackendBaseUrl(): string {
  const configured = process.env.BACKEND_BASE_URL ?? DEFAULT_BACKEND_BASE_URL;
  const url = new URL(configured);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BACKEND_BASE_URL must use HTTP or HTTPS.");
  }

  return url.toString();
}
