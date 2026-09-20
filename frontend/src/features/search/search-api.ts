import {
  isEnumCatalog,
  isSearchMetadata,
  type EnumCatalog,
  type SearchMetadata,
} from "@/features/search/metadata";
import { isSearchJob, type SearchJob } from "@/features/search/search-job";
import type { components } from "@/generated/api";
import {
  readPublicApiError,
  type PublicValidationIssue,
} from "@/lib/http";
import type { JsonGuard } from "@/lib/validation";

export class SearchApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly retryAfterSeconds?: number,
    readonly issues?: PublicValidationIssue[],
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
      error.issues,
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

const SEARCH_REQUEST_TIMEOUT_MS = 12_000;
const SEARCH_RETRY_LIMIT = 1;

type SearchRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type SearchSubmission = {
  idempotencyKey: string;
  definition: components["schemas"]["SearchCreate"];
  body: string;
};

async function requestWithTimeout(
  url: string,
  init: RequestInit,
  options: SearchRequestOptions,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  let timedOut = false;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  }
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? SEARCH_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    if (externalSignal?.aborted) {
      throw new SearchApiError(0, "request_cancelled", "The request was cancelled.");
    }

    if (timedOut) {
      throw new SearchApiError(
        0,
        "request_timeout",
        "The search request timed out. It can be retried safely.",
      );
    }

    throw new SearchApiError(
      0,
      "network_error",
      "The application server is unavailable.",
    );
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function requestSearchJson<T>(
  url: string,
  guard: JsonGuard<T>,
  fallbackMessage: string,
  init: RequestInit,
  options: SearchRequestOptions,
): Promise<T> {
  const response = await requestWithTimeout(url, init, options);

  if (!response.ok) {
    const error = await readPublicApiError(response, fallbackMessage);
    throw new SearchApiError(
      response.status,
      error.code,
      error.message,
      error.retryAfterSeconds,
      error.issues,
    );
  }

  let value: unknown;

  try {
    value = await response.json();
  } catch {
    throw new SearchApiError(
      502,
      "invalid_response",
      "The server returned an incomplete search response.",
    );
  }

  if (!guard(value)) {
    throw new SearchApiError(
      502,
      "invalid_response",
      "The server response did not match the search contract.",
    );
  }

  return value;
}

export function isAmbiguousSearchError(
  error: unknown,
): error is SearchApiError {
  return (
    error instanceof SearchApiError &&
    error.code !== "request_cancelled" &&
    (error.status === 0 || error.status === 502 || error.status === 503)
  );
}

async function waitForRetry(
  error: SearchApiError,
  options: SearchRequestOptions,
): Promise<void> {
  const milliseconds = (error.retryAfterSeconds ?? 0) * 1_000;
  await (options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay))))(
    milliseconds,
  );
}

export function createSearchIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function createSearchSubmission(
  definition: components["schemas"]["SearchCreate"],
  idempotencyKey: string,
): SearchSubmission {
  const body = JSON.stringify(definition);

  return {
    idempotencyKey,
    // Keep a detached snapshot alongside the exact wire body so later form
    // edits cannot change an unresolved logical submission.
    definition: JSON.parse(body) as components["schemas"]["SearchCreate"],
    body,
  };
}

export async function createSearchJob(
  submission: SearchSubmission,
  options: SearchRequestOptions = {},
): Promise<SearchJob> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestSearchJson(
        "/api/searches",
        isSearchJob,
        "The search could not be started.",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": submission.idempotencyKey,
          },
          body: submission.body,
        },
        options,
      );
    } catch (error) {
      if (attempt >= SEARCH_RETRY_LIMIT || !isAmbiguousSearchError(error)) {
        throw error;
      }

      await waitForRetry(error, options);
    }
  }
}

export function fetchSearchJob(
  searchId: string,
  options: SearchRequestOptions = {},
): Promise<SearchJob> {
  return requestSearchJson(
    `/api/searches/${encodeURIComponent(searchId)}`,
    isSearchJob,
    "Search progress could not be loaded.",
    { method: "GET" },
    options,
  );
}

export async function releaseSearchJob(
  searchId: string,
  options: SearchRequestOptions = {},
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await requestWithTimeout(
        `/api/searches/${encodeURIComponent(searchId)}`,
        { method: "DELETE" },
        options,
      );

      if (response.ok) {
        return;
      }

      const error = await readPublicApiError(
        response,
        "The search slot could not be released.",
      );
      throw new SearchApiError(
        response.status,
        error.code,
        error.message,
        error.retryAfterSeconds,
        error.issues,
      );
    } catch (error) {
      if (attempt >= SEARCH_RETRY_LIMIT || !isAmbiguousSearchError(error)) {
        throw error;
      }

      await waitForRetry(error, options);
    }
  }
}

export function shouldRetrySearchPoll(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 2 &&
    (isAmbiguousSearchError(error) ||
      (error instanceof SearchApiError && error.status === 429))
  );
}

export function searchPollRetryDelay(
  failureCount: number,
  error: unknown,
): number {
  if (error instanceof SearchApiError && error.retryAfterSeconds !== undefined) {
    return error.retryAfterSeconds * 1_000;
  }

  return Math.min(1_000 * 2 ** failureCount, 4_000);
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
