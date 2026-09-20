import { readPublicApiError } from "@/lib/http";

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

async function normalizeSignInError(response: Response): Promise<SignInError> {
  const error = await readPublicApiError(
    response,
    "Sign-in could not be completed. Try again.",
  );

  if (response.status === 401) {
    return { message: "Email or password is incorrect." };
  }

  if (response.status === 429) {
    return {
      message: "Too many sign-in attempts.",
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }

  return {
    message: error.message,
    retryAfterSeconds: error.retryAfterSeconds,
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
