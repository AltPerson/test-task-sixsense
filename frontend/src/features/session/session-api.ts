import {
  isProtocolSchema,
  isSessionDetail,
  isSessionId,
  type ProtocolSchema,
  type SessionDetail,
} from "@/features/session/session-detail";
import { readPublicApiError } from "@/lib/http";
import type { JsonGuard } from "@/lib/validation";

export class SessionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "SessionApiError";
  }
}

type RequestOptions = { signal?: AbortSignal };

async function requestJson<T>(
  url: string,
  guard: JsonGuard<T>,
  fallbackMessage: string,
  options: RequestOptions,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    if (options.signal?.aborted) {
      throw new SessionApiError(0, "request_cancelled", "The request was cancelled.");
    }
    throw new SessionApiError(
      0,
      "network_error",
      "The application server is unavailable.",
    );
  }

  if (!response.ok) {
    const error = await readPublicApiError(response, fallbackMessage);
    throw new SessionApiError(response.status, error.code, error.message);
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
