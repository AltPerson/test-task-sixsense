import {
  isUserProfile,
  type UserProfile,
} from "@/features/auth/auth-contracts";
import { isRecord, isStringArray } from "@/lib/validation";

export type SensorMetadata = {
  id: string;
  name: string;
  site: string;
  kind: string;
  status: string;
  lastPacketAt?: string;
};

export type FieldMetadata = {
  name: string;
  label: string;
  type: string;
  operators: string[];
  enum?: string[];
  enumName?: string;
  pattern?: string;
  example: string;
};

export type ColumnMetadata = {
  key: string;
  label: string;
  type: string;
  defaultVisible: boolean;
  sortable: boolean;
  widthHint: number;
};

export type EnumOption = {
  value: string;
  label: string;
};

export type SearchMetadata = {
  profile: UserProfile;
  sensors: SensorMetadata[];
  fields: FieldMetadata[];
  columns: ColumnMetadata[];
};

type ItemList<T> = { items: T[] };
export type EnumCatalog = { name: string; values: EnumOption[] };
type FieldWire = Omit<FieldMetadata, "enumName"> & { enum_name?: string };
type SensorWire = Omit<SensorMetadata, "lastPacketAt"> & {
  last_packet_at?: unknown;
};

function isSensorWire(value: unknown): value is SensorWire {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.site === "string" &&
    typeof value.kind === "string" &&
    typeof value.status === "string"
  );
}

function isSensorMetadata(value: unknown): value is SensorMetadata {
  const lastPacketAt = isRecord(value) ? value.lastPacketAt : undefined;

  return (
    isSensorWire(value) &&
    (lastPacketAt === undefined || typeof lastPacketAt === "string")
  );
}

function isField(value: unknown): value is FieldWire {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.label === "string" &&
    typeof value.type === "string" &&
    isStringArray(value.operators) &&
    (value.enum === undefined || isStringArray(value.enum)) &&
    (value.enum_name === undefined || typeof value.enum_name === "string") &&
    (value.pattern === undefined || typeof value.pattern === "string") &&
    typeof value.example === "string"
  );
}

function isColumn(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    typeof value.type === "string" &&
    typeof value.default_visible === "boolean" &&
    typeof value.sortable === "boolean" &&
    typeof value.width_hint === "number"
  );
}

function isItemList<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is ItemList<T> {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isItem)
  );
}

export function isSensorList(value: unknown): value is ItemList<SensorWire> {
  return isItemList(value, isSensorWire);
}

export function isFieldList(value: unknown): value is ItemList<FieldWire> {
  return isItemList(value, isField);
}

export function isColumnList(
  value: unknown,
): value is { items: Array<Record<string, unknown>> } {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isColumn)
  );
}

export function normalizeFields(items: FieldWire[]): FieldMetadata[] {
  return items.map(({ enum_name: enumName, ...field }) => ({
    ...field,
    enumName,
  }));
}

export function normalizeSensors(items: SensorWire[]): SensorMetadata[] {
  return items.map(({ last_packet_at: lastPacketAt, ...sensor }) => ({
    ...sensor,
    ...(typeof lastPacketAt === "string" ? { lastPacketAt } : {}),
  }));
}

export function normalizeColumns(
  items: Array<Record<string, unknown>>,
): ColumnMetadata[] {
  return items.map((column) => ({
    key: String(column.key),
    label: String(column.label),
    type: String(column.type),
    defaultVisible: Boolean(column.default_visible),
    sortable: Boolean(column.sortable),
    widthHint: Number(column.width_hint),
  }));
}

export function isEnumCatalog(value: unknown): value is EnumCatalog {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    Array.isArray(value.values) &&
    value.values.every(
      (item) =>
        isRecord(item) &&
        typeof item.value === "string" &&
        typeof item.label === "string",
    )
  );
}

export function isSearchMetadata(value: unknown): value is SearchMetadata {
  return (
    isRecord(value) &&
    isUserProfile(value.profile) &&
    Array.isArray(value.sensors) &&
    value.sensors.every(isSensorMetadata) &&
    Array.isArray(value.fields) &&
    value.fields.every(
      (field) =>
        isRecord(field) &&
        typeof field.name === "string" &&
        typeof field.label === "string" &&
        typeof field.type === "string" &&
        isStringArray(field.operators) &&
        (field.enum === undefined || isStringArray(field.enum)) &&
        (field.enumName === undefined || typeof field.enumName === "string") &&
        (field.pattern === undefined || typeof field.pattern === "string") &&
        typeof field.example === "string",
    ) &&
    Array.isArray(value.columns) &&
    value.columns.every(
      (column) =>
        isRecord(column) &&
        typeof column.key === "string" &&
        typeof column.label === "string" &&
        typeof column.type === "string" &&
        typeof column.defaultVisible === "boolean" &&
        typeof column.sortable === "boolean" &&
        typeof column.widthHint === "number",
    )
  );
}
