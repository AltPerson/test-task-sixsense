"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchEnumCatalog } from "@/features/search/search-api";
import type {
  EnumOption,
  FieldMetadata,
  SensorMetadata,
} from "@/features/search/metadata";
import type { SearchConditionDefinition } from "@/features/search/search-definition";

type ConditionEditorProps = {
  condition: SearchConditionDefinition;
  fields: FieldMetadata[];
  readableSensorIds: Set<string>;
  sensors: SensorMetadata[];
  onChange: (condition: SearchConditionDefinition) => void;
  onRemove: () => void;
};

const NUMERIC_FIELD_TYPES = new Set([
  "port",
  "number",
  "bytes",
  "duration_ms",
]);

function valuesForField(
  field: FieldMetadata,
  sensors: SensorMetadata[],
  readableSensorIds: Set<string>,
  enumOptions: EnumOption[],
): EnumOption[] {
  if (field.type === "sensor") {
    return sensors
      .filter((sensor) => readableSensorIds.has(sensor.id))
      .map((sensor) => ({ value: sensor.id, label: sensor.name }));
  }

  if (enumOptions.length > 0) {
    return enumOptions;
  }

  return (field.enum ?? []).map((value) => ({ value, label: value }));
}

type SingleValueInputProps = {
  field: FieldMetadata;
  label: string;
  options: EnumOption[];
  value: string;
  onChange: (value: string) => void;
};

function SingleValueInput({
  field,
  label,
  options,
  value,
  onChange,
}: SingleValueInputProps) {
  if (options.length > 0) {
    return (
      <label className="block text-sm font-medium text-slate-700">
        {label}
        <select
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">Select a value</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 placeholder:text-slate-400"
        inputMode={NUMERIC_FIELD_TYPES.has(field.type) ? "decimal" : "text"}
        onChange={(event) => onChange(event.target.value)}
        pattern={field.pattern}
        placeholder={field.example}
        type={NUMERIC_FIELD_TYPES.has(field.type) ? "number" : "text"}
        value={value}
      />
    </label>
  );
}

export function ConditionEditor({
  condition,
  fields,
  readableSensorIds,
  sensors,
  onChange,
  onRemove,
}: ConditionEditorProps) {
  const field = fields.find((candidate) => candidate.name === condition.field);
  const enumQuery = useQuery({
    queryKey: ["search-enum", field?.enumName],
    queryFn: () => fetchEnumCatalog(field?.enumName ?? ""),
    enabled: Boolean(field?.enumName),
    retry: false,
  });

  if (!field) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm text-rose-800">
          This condition references an unavailable field.
        </p>
        <button
          className="mt-3 text-sm font-semibold text-rose-800 underline"
          onClick={onRemove}
          type="button"
        >
          Remove condition
        </button>
      </div>
    );
  }

  const options = valuesForField(
    field,
    sensors,
    readableSensorIds,
    enumQuery.data?.values ?? [],
  );

  function changeField(fieldName: string) {
    const nextField = fields.find((candidate) => candidate.name === fieldName);
    onChange({
      field: fieldName,
      operator: nextField?.operators[0] ?? "",
      values: [],
    });
  }

  function changeOperator(operator: string) {
    onChange({
      ...condition,
      operator,
      values:
        operator === "exists" ? [] : operator === "between" ? ["", ""] : [""],
    });
  }

  function setValue(index: number, value: string) {
    const values = [...condition.values];
    values[index] = value;
    onChange({ ...condition, values });
  }

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto]">
        <label className="block text-sm font-medium text-slate-700">
          Field
          <select
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950"
            onChange={(event) => changeField(event.target.value)}
            value={condition.field}
          >
            {fields.map((candidate) => (
              <option key={candidate.name} value={candidate.name}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Operator
          <select
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950"
            onChange={(event) => changeOperator(event.target.value)}
            value={condition.operator}
          >
            {field.operators.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        </label>

        <button
          className="self-end rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:border-rose-300 hover:text-rose-700"
          onClick={onRemove}
          type="button"
        >
          Remove
        </button>
      </div>

      {enumQuery.isError ? (
        <p className="mt-3 text-sm text-amber-700">
          Enum labels remain unavailable. A plain value can still be entered.
        </p>
      ) : null}

      {condition.operator === "exists" ? null : condition.operator ===
        "between" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SingleValueInput
            field={field}
            label="Minimum value"
            onChange={(value) => setValue(0, value)}
            options={options}
            value={condition.values[0] ?? ""}
          />
          <SingleValueInput
            field={field}
            label="Maximum value"
            onChange={(value) => setValue(1, value)}
            options={options}
            value={condition.values[1] ?? ""}
          />
        </div>
      ) : condition.operator === "in" && options.length > 0 ? (
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Values
          <select
            className="mt-1.5 block min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950"
            multiple
            onChange={(event) =>
              onChange({
                ...condition,
                values: Array.from(
                  event.currentTarget.selectedOptions,
                  (option) => option.value,
                ),
              })
            }
            value={condition.values}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : condition.operator === "in" ? (
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Values, comma-separated
          <input
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950"
            onChange={(event) =>
              onChange({
                ...condition,
                values: event.target.value.split(",").map((value) => value.trim()),
              })
            }
            placeholder={field.example}
            type="text"
            value={condition.values.join(", ")}
          />
        </label>
      ) : (
        <div className="mt-4">
          <SingleValueInput
            field={field}
            label="Value"
            onChange={(value) => setValue(0, value)}
            options={options}
            value={condition.values[0] ?? ""}
          />
        </div>
      )}
    </fieldset>
  );
}
