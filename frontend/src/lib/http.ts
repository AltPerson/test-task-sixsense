import { isRecord } from "@/lib/validation";

export type PublicApiError = {
  code?: string;
  message: string;
  retryAfterSeconds?: number;
  issues?: PublicValidationIssue[];
};

export type PublicValidationIssue = {
  location: Array<string | number>;
  message: string;
  code: string;
};

function normalizeRetryAfter(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.ceil(value))
    : undefined;
}

function retryAfterHeader(response: Response): number | undefined {
  const value = response.headers.get("retry-after");

  if (!value || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

function validationIssues(value: unknown): PublicValidationIssue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const issues: PublicValidationIssue[] = [];

  for (const issue of value) {
    if (
      !isRecord(issue) ||
      !Array.isArray(issue.location) ||
      !issue.location.every(
        (part) => typeof part === "string" || typeof part === "number",
      ) ||
      typeof issue.message !== "string" ||
      typeof issue.code !== "string"
    ) {
      return undefined;
    }

    issues.push({
      location: issue.location,
      message: issue.message,
      code: issue.code,
    });
  }

  return issues;
}

export async function readPublicApiError(
  response: Response,
  fallbackMessage: string,
): Promise<PublicApiError> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return {
      message: fallbackMessage,
      retryAfterSeconds: retryAfterHeader(response),
    };
  }

  if (!isRecord(body) || !isRecord(body.error)) {
    return {
      message: fallbackMessage,
      retryAfterSeconds: retryAfterHeader(response),
    };
  }

  return {
    code: typeof body.error.code === "string" ? body.error.code : undefined,
    message:
      typeof body.error.message === "string"
        ? body.error.message
        : fallbackMessage,
    retryAfterSeconds:
      normalizeRetryAfter(body.error.retry_after_seconds) ??
      retryAfterHeader(response),
    issues: validationIssues(body.error.issues),
  };
}
