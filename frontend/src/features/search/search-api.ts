import {
  isEnumCatalog,
  isSearchMetadata,
  type EnumCatalog,
  type SearchMetadata,
} from "@/features/search/metadata";
import { readPublicApiError } from "@/lib/http";
import type { JsonGuard } from "@/lib/validation";

export class SearchApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SearchApiError";
  }
}

async function fetchJson<T>(url: string, guard: JsonGuard<T>): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new SearchApiError(
      0,
      undefined,
      "The application server is unavailable.",
    );
  }

  if (!response.ok) {
    const error = await readPublicApiError(
      response,
      "Search metadata could not be loaded.",
    );
    throw new SearchApiError(
      response.status,
      error.code,
      error.message,
      error.retryAfterSeconds,
    );
  }

  let value: unknown;

  try {
    value = await response.json();
  } catch {
    throw new SearchApiError(
      502,
      undefined,
      "The server returned an incomplete response.",
    );
  }

  if (!guard(value)) {
    throw new SearchApiError(
      502,
      undefined,
      "The server response did not match the metadata contract.",
    );
  }

  return value;
}

export function fetchSearchMetadata(): Promise<SearchMetadata> {
  return fetchJson("/api/search/metadata", isSearchMetadata);
}

export async function fetchEnumCatalog(name: string): Promise<EnumCatalog> {
  const url = `/api/search/enums/${encodeURIComponent(name)}`;

  try {
    return await fetchJson(url, isEnumCatalog);
  } catch (error) {
    if (
      !(error instanceof SearchApiError) ||
      error.status !== 503 ||
      error.code !== "catalog_warming"
    ) {
      throw error;
    }

    // The catalogue endpoint documents one warm-up failure. Preserve the
    // server's backoff and retry exactly once rather than enabling broad retries.
    await new Promise((resolve) =>
      setTimeout(resolve, (error.retryAfterSeconds ?? 0) * 1_000),
    );
    return fetchJson(url, isEnumCatalog);
  }
}
