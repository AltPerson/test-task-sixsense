import {
  isProtocolSchema,
  isSessionDetail,
  isSessionId,
  type ProtocolSchema,
  type SessionDetail,
} from "@/features/session/model/session-detail";
import { readPublicApiError } from "@/lib/http";
import type { JsonGuard } from "@/lib/validation";

export class SessionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SessionApiError";
  }
}

const SESSION_REQUEST_TIMEOUT_MS = 12_000;

type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

async function requestJson<T>(
  url: string,
  guard: JsonGuard<T>,
  fallbackMessage: string,
  options: RequestOptions,
): Promise<T> {
  let response: Response;
  const timeoutSignal = AbortSignal.timeout(
    options.timeoutMs ?? SESSION_REQUEST_TIMEOUT_MS,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal,
    });
  } catch {
    if (options.signal?.aborted) {
      throw new SessionApiError(0, "request_cancelled", "The request was cancelled.");
    }
    if (timeoutSignal.aborted) {
      throw new SessionApiError(
        0,
        "request_timeout",
        "The session request timed out.",
      );
    }
    throw new SessionApiError(
      0,
      "network_error",
      "The application server is unavailable.",
    );
  }

  if (!response.ok) {
    const error = await readPublicApiError(response, fallbackMessage);
    throw new SessionApiError(
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
    throw new SessionApiError(
      502,
      "invalid_response",
      "The server returned an incomplete response.",
    );
  }

  if (!guard(value)) {
    throw new SessionApiError(
      502,
      "invalid_response",
      "The server response did not match the session contract.",
    );
  }

  return value;
}

export function sessionDetailQueryKey(sessionId: string) {
  return ["session-detail", sessionId] as const;
}

export function protocolSchemaQueryKey(protocol: string) {
  return ["protocol-schema", protocol] as const;
}

export function shouldRetrySessionGet(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 2 &&
    error instanceof SessionApiError &&
    error.code !== "request_cancelled" &&
    [0, 429, 502, 503].includes(error.status)
  );
}

export function sessionGetRetryDelay(
  failureCount: number,
  error: unknown,
): number {
  if (
    error instanceof SessionApiError &&
    error.retryAfterSeconds !== undefined
  ) {
    return error.retryAfterSeconds * 1_000;
  }

  return Math.min(1_000 * 2 ** failureCount, 4_000);
}

export function fetchSessionDetail(
  sessionId: string,
  options: RequestOptions = {},
): Promise<SessionDetail> {
  if (!isSessionId(sessionId)) {
    return Promise.reject(
      new SessionApiError(404, "session_not_found", "Session was not found."),
    );
  }

  return requestJson(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    isSessionDetail,
    "Session details could not be loaded.",
    options,
  );
}

export function fetchProtocolSchema(
  protocol: string,
  options: RequestOptions = {},
): Promise<ProtocolSchema> {
  return requestJson(
    `/api/session-schema/${encodeURIComponent(protocol)}`,
    isProtocolSchema,
    "The protocol schema could not be loaded.",
    options,
  );
}
