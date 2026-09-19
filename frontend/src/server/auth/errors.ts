import "server-only";

export type ValidationIssue = {
  location: Array<string | number>;
  message: string;
  code: string;
};

type AppErrorOptions = {
  retryAfterSeconds?: number;
  issues?: ValidationIssue[];
};

export class AppError extends Error {
  readonly retryAfterSeconds?: number;
  readonly issues?: ValidationIssue[];

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message);
    this.name = "AppError";
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.issues = options.issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeValidationIssues(value: unknown): ValidationIssue[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const issues: ValidationIssue[] = [];

  for (const item of value) {
    if (
      !isRecord(item) ||
      !Array.isArray(item.loc) ||
      !item.loc.every(
        (part) => typeof part === "string" || typeof part === "number",
      ) ||
      typeof item.msg !== "string" ||
      typeof item.type !== "string"
    ) {
      return null;
    }

    issues.push({
      location: item.loc,
      message: item.msg,
      code: item.type,
    });
  }

  return issues;
}

export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  const retryAt = Date.parse(trimmed);

  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAt - now) / 1_000));
}

export async function errorFromBackendResponse(
  response: Response,
): Promise<AppError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return new AppError(
      response.status,
      "backend_error",
      `The backend returned HTTP ${response.status}.`,
      { retryAfterSeconds },
    );
  }

  if (isRecord(body) && typeof body.detail === "string") {
    return new AppError(
      response.status,
      typeof body.code === "string" ? body.code : "backend_error",
      body.detail,
      { retryAfterSeconds },
    );
  }

  const issues = isRecord(body)
    ? normalizeValidationIssues(body.detail)
    : null;

  if (issues) {
    return new AppError(
      response.status,
      "validation_error",
      "The request did not pass backend validation.",
      { issues, retryAfterSeconds },
    );
  }

  return new AppError(
    response.status,
    "backend_error",
    `The backend returned HTTP ${response.status}.`,
    { retryAfterSeconds },
  );
}

export function networkError(): AppError {
  return new AppError(
    502,
    "backend_unavailable",
    "The backend is temporarily unavailable.",
  );
}
