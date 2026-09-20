import type { SearchDefinition } from "@/features/search/model/search-definition";
import { SEARCH_DEFINITION_VERSION } from "@/features/search/model/search-definition";
import { isRecord, isStringArray } from "@/lib/validation";

export const SESSION_ID_PATTERN = /^[0-9]{1,20}$/;

export type SessionDetail = Record<string, unknown> & {
  id: string;
  protocol: string;
  decoded: Record<string, unknown>;
};

export type ProtocolField = {
  path: string;
  title: string;
  type: string;
  unit?: string;
  sensitive?: boolean;
};

export type ProtocolSchema = {
  protocol: string;
  decoder_versions: string[];
  fields: ProtocolField[];
};

export type DecodedField = {
  path: string;
  value: unknown;
};

export function isSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}

export function isSessionDetail(value: unknown): value is SessionDetail {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isSessionId(value.id) &&
    typeof value.protocol === "string" &&
    value.protocol.length > 0 &&
    isRecord(value.decoded)
  );
}

const SESSION_FIELDS = [
  "id",
  "sensor_id",
  "start",
  "end",
  "duration_ms",
  "protocol",
  "transport",
  "src",
  "dst",
  "bytes",
  "packets",
  "risk",
  "intel",
  "summary",
  "decoder",
  "files_count",
  "pcap_available",
  "decoded",
  "detections",
  "files",
  "pcap",
] as const;

function sanitizeRedactedValue(value: unknown): unknown {
  if (isRedacted(value)) return { redacted: true };
  if (Array.isArray(value)) return value.map(sanitizeRedactedValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      sanitizeRedactedValue(nested),
    ]),
  );
}

export function normalizeSessionDetail(session: SessionDetail): SessionDetail {
  const normalized: Record<string, unknown> = {};

  for (const field of SESSION_FIELDS) {
    if (field in session) {
      normalized[field] = sanitizeRedactedValue(session[field]);
    }
  }

  if (!isSessionDetail(normalized)) {
    throw new Error("Session normalization removed required fields.");
  }
  return normalized;
}

function isProtocolField(value: unknown): value is ProtocolField {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    typeof value.title === "string" &&
    typeof value.type === "string" &&
    (value.unit === undefined || typeof value.unit === "string") &&
    (value.sensitive === undefined || typeof value.sensitive === "boolean")
  );
}

export function isProtocolSchema(value: unknown): value is ProtocolSchema {
  return (
    isRecord(value) &&
    typeof value.protocol === "string" &&
    isStringArray(value.decoder_versions) &&
    Array.isArray(value.fields) &&
    value.fields.every(isProtocolField)
  );
}

export function isRedacted(value: unknown): boolean {
  return isRecord(value) && value.redacted === true;
}

export function detailValueState(
  value: unknown,
): "missing" | "redacted" | "present" {
  if (value === null || value === undefined || value === "") {
    return "missing";
  }

  return isRedacted(value) ? "redacted" : "present";
}

export function formatDetailValue(value: unknown, depth = 0): string {
  const state = detailValueState(value);
  if (state === "missing") return "Missing";
  if (state === "redacted") return "Redacted";

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? "Empty"
      : value.map((item) => formatDetailValue(item, depth + 1)).join(", ");
  }
  if (isRecord(value)) {
    if (depth >= 3) return "Nested value";
    const entries = Object.entries(value).slice(0, 50);
    if (entries.length === 0) return "Empty";
    return entries
      .map(([key, item]) => `${key}: ${formatDetailValue(item, depth + 1)}`)
      .join(" · ");
  }

  return "Unsupported value";
}

export function valueAtPath(
  source: Record<string, unknown>,
  path: string,
): unknown {
  let current: unknown = source;

  for (const segment of path.split(".")) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

export function findUndeclaredFields(
  decoded: Record<string, unknown>,
  declaredPaths: string[],
): DecodedField[] {
  const declared = new Set(declaredPaths);
  const fields: DecodedField[] = [];

  function visit(value: unknown, path: string, depth: number) {
    if (fields.length >= 500) return;

    const covered = [...declared].some(
      (declaredPath) =>
        path === declaredPath || path.startsWith(`${declaredPath}.`),
    );
    if (covered) return;

    if (
      isRecord(value) &&
      !isRedacted(value) &&
      Object.keys(value).length > 0 &&
      depth < 8
    ) {
      for (const [key, nested] of Object.entries(value)) {
        visit(nested, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }

    if (path) fields.push({ path, value });
  }

  visit(decoded, "", 0);
  return fields;
}

export function endpointIp(value: unknown): string | null {
  return isRecord(value) &&
    !isRedacted(value) &&
    typeof value.ip === "string"
    ? value.ip
    : null;
}

export function formatEndpoint(value: unknown): string {
  if (isRedacted(value)) return "Redacted";
  if (!isRecord(value)) return formatDetailValue(value);

  const address =
    typeof value.host === "string"
      ? value.host
      : typeof value.ip === "string"
        ? value.ip
        : null;
  if (!address) return "Missing";

  const port =
    typeof value.port === "string" || typeof value.port === "number"
      ? `:${value.port}`
      : "";
  const country = typeof value.country === "string" ? ` · ${value.country}` : "";
  return `${address}${port}${country}`;
}

export function createSessionSearchDefinition(
  session: SessionDetail,
): SearchDefinition | null {
  const start = typeof session.start === "string" ? Date.parse(session.start) : NaN;
  const end = typeof session.end === "string" ? Date.parse(session.end) : NaN;
  const sensorId =
    typeof session.sensor_id === "string" ? session.sensor_id : null;

  if (!Number.isFinite(start) || !Number.isFinite(end) || !sensorId) {
    return null;
  }

  return {
    version: SEARCH_DEFINITION_VERSION,
    from: new Date(start - 15 * 60 * 1_000).toISOString(),
    to: new Date(end + 15 * 60 * 1_000).toISOString(),
    sensorIds: [sensorId],
    conditions: [],
    sort: "-ts",
  };
}
