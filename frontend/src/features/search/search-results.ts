import { isRecord } from "@/lib/validation";

export const MAX_ACCUMULATED_RESULTS = 25_000;

export type SearchResultRow = Record<string, unknown> & { id: string };

type SearchResultsWire = {
  items: unknown[];
  next_cursor: string | null;
  complete: boolean;
  matched_so_far: number;
};

export type SearchResultsPage = {
  items: SearchResultRow[];
  nextCursor: string | null;
  complete: boolean;
  matchedSoFar: number;
  malformedItems: number;
};

export type ResultsAccumulator = {
  rows: SearchResultRow[];
  requestCursor: string | null;
  caughtUp: boolean;
  caughtUpChecks: number;
  terminalCaughtUpChecks: number;
  complete: boolean;
  matchedSoFar: number;
  malformedItems: number;
  capped: boolean;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isResultRow(value: unknown): value is SearchResultRow {
  return isRecord(value) && typeof value.id === "string";
}

export function isSearchResultsWire(value: unknown): value is SearchResultsWire {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    (value.next_cursor === null || typeof value.next_cursor === "string") &&
    typeof value.complete === "boolean" &&
    isFiniteNumber(value.matched_so_far)
  );
}

export function normalizeSearchResults(
  page: SearchResultsWire,
): SearchResultsPage {
  const items = page.items.filter(isResultRow);

  return {
    items,
    nextCursor: page.next_cursor,
    complete: page.complete,
    matchedSoFar: page.matched_so_far,
    malformedItems: page.items.length - items.length,
  };
}

export function isSearchResultsPage(value: unknown): value is SearchResultsPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isResultRow) &&
    (value.nextCursor === null || typeof value.nextCursor === "string") &&
    typeof value.complete === "boolean" &&
    isFiniteNumber(value.matchedSoFar) &&
    isFiniteNumber(value.malformedItems)
  );
}

export function createResultsAccumulator(): ResultsAccumulator {
  return {
    rows: [],
    requestCursor: null,
    caughtUp: false,
    caughtUpChecks: 0,
    terminalCaughtUpChecks: 0,
    complete: false,
    matchedSoFar: 0,
    malformedItems: 0,
    capped: false,
  };
}

export function mergeResultsPage(
  accumulator: ResultsAccumulator,
  page: SearchResultsPage,
  requestCursor: string | null,
  limit = MAX_ACCUMULATED_RESULTS,
  terminal = false,
): ResultsAccumulator {
  const positions = new Map(
    accumulator.rows.map((row, index) => [row.id, index]),
  );
  const rows = [...accumulator.rows];
  let droppedForLimit = false;

  for (const row of page.items) {
    const existingIndex = positions.get(row.id);

    if (existingIndex !== undefined) {
      rows[existingIndex] = row;
    } else if (rows.length < limit) {
      positions.set(row.id, rows.length);
      rows.push(row);
    } else {
      droppedForLimit = true;
    }
  }

  const hasAdvancingCursor =
    page.nextCursor !== null && page.nextCursor !== requestCursor;
  const caughtUp = !page.complete && !hasAdvancingCursor;

  return {
    rows,
    requestCursor: hasAdvancingCursor ? page.nextCursor : requestCursor,
    caughtUp,
    caughtUpChecks: caughtUp ? accumulator.caughtUpChecks + 1 : 0,
    // Checks made while a job is active do not consume the bounded budget
    // used to confirm the final tail after the job becomes terminal.
    terminalCaughtUpChecks: caughtUp
      ? terminal
        ? accumulator.terminalCaughtUpChecks + 1
        : 0
      : 0,
    complete: page.complete,
    matchedSoFar: page.matchedSoFar,
    malformedItems: accumulator.malformedItems + page.malformedItems,
    capped: accumulator.capped || droppedForLimit,
  };
}

function redacted(value: unknown): boolean {
  return isRecord(value) && value.redacted === true;
}

function endpointValue(value: unknown): string {
  if (redacted(value)) {
    return "Redacted";
  }

  if (!isRecord(value)) {
    return formatResultValue(value);
  }

  const address =
    typeof value.host === "string"
      ? value.host
      : typeof value.ip === "string"
        ? value.ip
        : "Unknown";
  return typeof value.port === "number" || typeof value.port === "string"
    ? `${address}:${value.port}`
    : address;
}

function directionalCount(value: unknown): string {
  if (redacted(value)) {
    return "Redacted";
  }

  if (!isRecord(value)) {
    return formatResultValue(value);
  }

  const up = typeof value.up === "number" ? value.up : null;
  const down = typeof value.down === "number" ? value.down : null;

  if (up === null && down === null) {
    return formatResultValue(value);
  }

  return `${(up ?? 0) + (down ?? 0)} (↑${up ?? "—"} ↓${down ?? "—"})`;
}

export function resultColumnValue(
  row: SearchResultRow,
  columnKey: string,
): unknown {
  switch (columnKey) {
    case "sensor":
      return row.sensor_id;
    case "duration":
      return row.duration_ms;
    case "files":
      return row.files_count;
    case "dst_country":
      return isRecord(row.dst) ? row.dst.country : undefined;
    default:
      return row[columnKey];
  }
}

export function formatResultCell(
  row: SearchResultRow,
  columnKey: string,
  columnType: string,
): string {
  const value = resultColumnValue(row, columnKey);

  if (columnType === "ip_port") {
    return endpointValue(value);
  }

  if (columnType === "bytes" || columnKey === "packets") {
    return directionalCount(value);
  }

  if (columnType === "risk" && isRecord(value)) {
    const score = value.score;
    const band = value.band;
    return [score, band]
      .filter((part) => typeof part === "string" || typeof part === "number")
      .join(" · ") || "—";
  }

  if (columnType === "duration" && typeof value === "number") {
    return `${value.toLocaleString()} ms`;
  }

  if (columnType === "ts" && typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString();
  }

  return formatResultValue(value);
}

export function formatResultValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (redacted(value)) {
    return "Redacted";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Unreadable value";
  }
}

export function resultEndpointIp(
  row: SearchResultRow,
  direction: "src" | "dst",
): string | null {
  const endpoint = row[direction];
  return isRecord(endpoint) &&
    !redacted(endpoint) &&
    typeof endpoint.ip === "string"
    ? endpoint.ip
    : null;
}
