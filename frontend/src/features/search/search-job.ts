import { isRecord, isStringArray } from "@/lib/validation";

export const SEARCH_STATES = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
] as const;

export type SearchState = (typeof SEARCH_STATES)[number];

export type SearchProgress = {
  scannedSessions: number;
  totalSessionsEstimate: number;
  matched: number;
  matchedIsEstimate: boolean;
  percent: number;
};

export type SearchWarning = {
  code: string;
  sensorId: string;
  from?: string;
  to?: string;
  detail: string;
};

export type SearchJob = {
  id: string;
  state: SearchState;
  sensorIds: string[];
  createdAt: string;
  finishedAt?: string;
  progress: SearchProgress;
  warnings: SearchWarning[];
};

type SearchJobWire = {
  id: string;
  state: SearchState;
  sensor_ids: string[];
  created_at: string;
  finished_at?: string;
  progress: {
    scanned_sessions: number;
    total_sessions_estimate: number;
    matched: number;
    matched_is_estimate: boolean;
    percent: number;
  };
  warnings: Array<{
    code: string;
    sensor_id: string;
    from?: string;
    to?: string;
    detail: string;
  }>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSearchState(value: unknown): value is SearchState {
  return SEARCH_STATES.some((state) => state === value);
}

function isWarning(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.sensor_id === "string" &&
    (value.from === undefined || typeof value.from === "string") &&
    (value.to === undefined || typeof value.to === "string") &&
    typeof value.detail === "string"
  );
}

export function isSearchJobWire(value: unknown): value is SearchJobWire {
  if (!isRecord(value) || !isRecord(value.progress)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isSearchState(value.state) &&
    isStringArray(value.sensor_ids) &&
    typeof value.created_at === "string" &&
    (value.finished_at === undefined || typeof value.finished_at === "string") &&
    isFiniteNumber(value.progress.scanned_sessions) &&
    isFiniteNumber(value.progress.total_sessions_estimate) &&
    isFiniteNumber(value.progress.matched) &&
    typeof value.progress.matched_is_estimate === "boolean" &&
    isFiniteNumber(value.progress.percent) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isWarning)
  );
}

export function normalizeSearchJob(search: SearchJobWire): SearchJob {
  return {
    id: search.id,
    state: search.state,
    sensorIds: search.sensor_ids,
    createdAt: search.created_at,
    ...(search.finished_at ? { finishedAt: search.finished_at } : {}),
    progress: {
      scannedSessions: search.progress.scanned_sessions,
      totalSessionsEstimate: search.progress.total_sessions_estimate,
      matched: search.progress.matched,
      matchedIsEstimate: search.progress.matched_is_estimate,
      percent: search.progress.percent,
    },
    warnings: search.warnings.map((warning) => ({
      code: warning.code,
      sensorId: warning.sensor_id,
      ...(warning.from ? { from: warning.from } : {}),
      ...(warning.to ? { to: warning.to } : {}),
      detail: warning.detail,
    })),
  };
}

export function isSearchJob(value: unknown): value is SearchJob {
  if (!isRecord(value) || !isRecord(value.progress)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isSearchState(value.state) &&
    isStringArray(value.sensorIds) &&
    typeof value.createdAt === "string" &&
    (value.finishedAt === undefined || typeof value.finishedAt === "string") &&
    isFiniteNumber(value.progress.scannedSessions) &&
    isFiniteNumber(value.progress.totalSessionsEstimate) &&
    isFiniteNumber(value.progress.matched) &&
    typeof value.progress.matchedIsEstimate === "boolean" &&
    isFiniteNumber(value.progress.percent) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(
      (warning) =>
        isRecord(warning) &&
        typeof warning.code === "string" &&
        typeof warning.sensorId === "string" &&
        (warning.from === undefined || typeof warning.from === "string") &&
        (warning.to === undefined || typeof warning.to === "string") &&
        typeof warning.detail === "string",
    )
  );
}

export function isTerminalSearchState(state: SearchState): boolean {
  return state === "done" || state === "failed" || state === "cancelled";
}
