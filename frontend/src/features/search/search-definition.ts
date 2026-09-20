import type { components } from "@/generated/api";
import { isRecord, isStringArray } from "@/lib/validation";
import type { FieldMetadata, SearchMetadata } from "@/features/search/metadata";

export const SEARCH_DEFINITION_VERSION = 1 as const;

export const SUPPORTED_SORTS = [
  "-ts",
  "ts",
  "-bytes",
  "bytes",
  "-risk",
  "risk",
] as const satisfies ReadonlyArray<components["schemas"]["SortKey"]>;

const FILTER_OPERATORS = [
  "eq",
  "in",
  "cidr",
  "glob",
  "gte",
  "lte",
  "between",
  "exists",
] as const satisfies ReadonlyArray<components["schemas"]["FilterOp"]>;

const NUMERIC_FIELD_TYPES = new Set([
  "port",
  "number",
  "bytes",
  "duration_ms",
]);

export type SearchConditionDefinition = {
  field: string;
  operator: string;
  values: string[];
};

export type SearchDefinition = {
  version: typeof SEARCH_DEFINITION_VERSION;
  from: string;
  to: string;
  sensorIds: string[];
  conditions: SearchConditionDefinition[];
  sort: string;
};

export type SearchDefinitionResult =
  | { ok: true; value: SearchDefinition }
  | { ok: false; error: string };

export type SearchCreateResult =
  | { ok: true; value: components["schemas"]["SearchCreate"] }
  | { ok: false; errors: string[] };

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isCondition(value: unknown): value is SearchConditionDefinition {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    value.field.length > 0 &&
    typeof value.operator === "string" &&
    value.operator.length > 0 &&
    isStringArray(value.values) &&
    value.values.length <= 50
  );
}

function isSupportedSort(
  value: string,
): value is components["schemas"]["SortKey"] {
  return SUPPORTED_SORTS.some((sort) => sort === value);
}

function isFilterOperator(
  value: string,
): value is components["schemas"]["FilterOp"] {
  return FILTER_OPERATORS.some((operator) => operator === value);
}

export function createDefaultSearchDefinition(
  now: number = Date.now(),
): SearchDefinition {
  return {
    version: SEARCH_DEFINITION_VERSION,
    from: new Date(now - 60 * 60 * 1_000).toISOString(),
    to: new Date(now).toISOString(),
    sensorIds: [],
    conditions: [],
    sort: "-ts",
  };
}

export function createCaptureAwareSearchDefinition(
  metadata: SearchMetadata,
  now: number = Date.now(),
): SearchDefinition {
  const readableSensorIds = new Set(metadata.profile.sensor_ids);
  const captureTimes = metadata.sensors
    .filter((sensor) => readableSensorIds.has(sensor.id))
    .map((sensor) => Date.parse(sensor.lastPacketAt ?? ""))
    .filter(Number.isFinite);

  // Captures may be historical or have partial metadata. Anchor to the newest
  // valid readable-sensor timestamp and fall back to wall-clock time otherwise.
  return createDefaultSearchDefinition(
    captureTimes.length > 0 ? Math.max(...captureTimes) : now,
  );
}

export function encodeSearchDefinition(definition: SearchDefinition): string {
  // Sorting set-like sensor IDs makes equivalent searches produce one stable URL.
  return JSON.stringify({
    version: SEARCH_DEFINITION_VERSION,
    from: definition.from,
    to: definition.to,
    sensorIds: [...new Set(definition.sensorIds)].sort(),
    conditions: definition.conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      values: [...condition.values],
    })),
    sort: definition.sort,
  });
}

export function decodeSearchDefinition(value: string): SearchDefinitionResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, error: "The shared search link is not valid JSON." };
  }

  if (
    !isRecord(parsed) ||
    parsed.version !== SEARCH_DEFINITION_VERSION ||
    !isIsoDate(parsed.from) ||
    !isIsoDate(parsed.to) ||
    !isStringArray(parsed.sensorIds) ||
    !Array.isArray(parsed.conditions) ||
    !parsed.conditions.every(isCondition) ||
    typeof parsed.sort !== "string" ||
    !isSupportedSort(parsed.sort)
  ) {
    return {
      ok: false,
      error: "The shared search link uses malformed or unsupported state.",
    };
  }

  return {
    ok: true,
    value: {
      version: SEARCH_DEFINITION_VERSION,
      from: new Date(parsed.from).toISOString(),
      to: new Date(parsed.to).toISOString(),
      sensorIds: [...new Set(parsed.sensorIds)].sort(),
      conditions: parsed.conditions.map((condition) => ({
        field: condition.field,
        operator: condition.operator,
        values: [...condition.values],
      })),
      sort: parsed.sort,
    },
  };
}

function convertScalar(field: FieldMetadata, value: string): string | number {
  if (NUMERIC_FIELD_TYPES.has(field.type)) {
    return Number(value);
  }

  return value;
}

function validatePattern(field: FieldMetadata, value: string): boolean {
  if (!field.pattern) {
    return true;
  }

  try {
    return new RegExp(field.pattern).test(value);
  } catch {
    // Invalid server metadata must not crash the builder; backend validation is
    // still authoritative when the search is created in T4.
    return true;
  }
}

export function buildSearchCreate(
  definition: SearchDefinition,
  metadata: SearchMetadata,
): SearchCreateResult {
  const errors: string[] = [];
  const readableSensors = new Set(metadata.profile.sensor_ids);
  const knownSensors = new Set(metadata.sensors.map((sensor) => sensor.id));
  const fields = new Map(metadata.fields.map((field) => [field.name, field]));

  if (definition.sensorIds.length === 0) {
    errors.push("Select at least one readable sensor.");
  }

  for (const sensorId of definition.sensorIds) {
    if (!knownSensors.has(sensorId) || !readableSensors.has(sensorId)) {
      errors.push(`Sensor ${sensorId} is unavailable for this account.`);
    }
  }

  const from = Date.parse(definition.from);
  const to = Date.parse(definition.to);

  if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
    errors.push("The start time must be earlier than the end time.");
  }

  if (!isSupportedSort(definition.sort)) {
    errors.push("The selected sort order is not supported.");
  }

  const filters: components["schemas"]["FilterNode"][] = [];

  definition.conditions.forEach((condition, index) => {
    const field = fields.get(condition.field);
    const prefix = `Condition ${index + 1}`;

    if (!field) {
      errors.push(`${prefix} uses an unknown field.`);
      return;
    }

    if (
      !isFilterOperator(condition.operator) ||
      !field.operators.includes(condition.operator)
    ) {
      errors.push(`${prefix} uses an unsupported operator.`);
      return;
    }

    const values = condition.values.map((value) => value.trim());
    const nonEmptyValues = values.filter((value) => value.length > 0);

    if (condition.operator === "exists") {
      if (nonEmptyValues.length > 0) {
        errors.push(`${prefix} must not include a value for exists.`);
        return;
      }

      filters.push({ field: field.name, op: condition.operator });
      return;
    }

    if (condition.operator === "between" && nonEmptyValues.length !== 2) {
      errors.push(`${prefix} requires exactly two values.`);
      return;
    }

    if (condition.operator === "in" && nonEmptyValues.length === 0) {
      errors.push(`${prefix} requires at least one value.`);
      return;
    }

    if (
      condition.operator !== "between" &&
      condition.operator !== "in" &&
      nonEmptyValues.length !== 1
    ) {
      errors.push(`${prefix} requires exactly one value.`);
      return;
    }

    if (
      NUMERIC_FIELD_TYPES.has(field.type) &&
      nonEmptyValues.some((value) => !Number.isFinite(Number(value)))
    ) {
      errors.push(`${prefix} requires numeric values.`);
      return;
    }

    if (nonEmptyValues.some((value) => !validatePattern(field, value))) {
      errors.push(`${prefix} does not match the expected format.`);
      return;
    }

    const converted = nonEmptyValues.map((value) =>
      convertScalar(field, value),
    );

    if (condition.operator === "between" || condition.operator === "in") {
      filters.push({
        field: field.name,
        op: condition.operator,
        values: converted,
      });
    } else {
      filters.push({
        field: field.name,
        op: condition.operator,
        value: converted[0],
      });
    }
  });

  if (errors.length > 0 || !isSupportedSort(definition.sort)) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      sensor_ids: [...new Set(definition.sensorIds)].sort(),
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      filter: { all: filters },
      sort: definition.sort,
    },
  };
}

export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
