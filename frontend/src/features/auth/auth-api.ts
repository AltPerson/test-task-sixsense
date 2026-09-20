import { isRecord } from "@/lib/validation";

export type SignInCredentials = {
  email: string;
  password: string;
};

export type SignInError = {
  message: string;
  retryAfterSeconds?: number;
};

export type SignInResult =
  | { ok: true }
  | { ok: false; error: SignInError };

type PublicErrorPayload = {
  error?: {
    message?: unknown;
    retry_after_seconds?: unknown;
  };
};

function toPublicErrorPayload(value: unknown): PublicErrorPayload {
  if (!isRecord(value) || !isRecord(value.error)) {
    return {};
  }

  return {
    error: {
      message: value.error.message,
      retry_after_seconds: value.error.retry_after_seconds,
    },
  };
}

async function normalizeSignInError(response: Response): Promise<SignInError> {
  let payload: PublicErrorPayload = {};

  try {
    payload = toPublicErrorPayload(await response.json());
  } catch {
    // Status-specific fallbacks keep malformed error responses actionable.
  }

  const retryAfter = payload.error?.retry_after_seconds;
  const retryAfterSeconds =
    typeof retryAfter === "number" && Number.isFinite(retryAfter)
      ? Math.max(0, Math.ceil(retryAfter))
      : undefined;

  if (response.status === 401) {
    return { message: "Email or password is incorrect." };
  }

  if (response.status === 429) {
    return {
      message: "Too many sign-in attempts.",
      retryAfterSeconds,
    };
  }

  return {
    message:
      typeof payload.error?.message === "string"
        ? payload.error.message
        : "Sign-in could not be completed. Try again.",
    retryAfterSeconds,
  };
}

export async function signIn(
  credentials: SignInCredentials,
): Promise<SignInResult> {
  let response: Response;

  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
  } catch {
    return {
      ok: false,
      error: {
        message: "The sign-in service is unavailable. Check your connection.",
      },
    };
  }

  return response.ok
    ? { ok: true }
    : { ok: false, error: await normalizeSignInError(response) };
}

export async function requestLogout(): Promise<void> {
  // Any BFF response confirms its finally block ran and cleared the local session.
  await fetch("/api/auth/logout", { method: "POST" });
}
