"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ConditionEditor } from "@/features/search/condition-editor";
import { fetchSearchMetadata } from "@/features/search/search-api";
import type { SearchMetadata } from "@/features/search/metadata";
import {
  buildSearchCreate,
  createCaptureAwareSearchDefinition,
  decodeSearchDefinition,
  encodeSearchDefinition,
  fromDateTimeLocal,
  SUPPORTED_SORTS,
  toDateTimeLocal,
  type SearchConditionDefinition,
  type SearchDefinition,
} from "@/features/search/search-definition";

const SORT_LABELS: Record<(typeof SUPPORTED_SORTS)[number], string> = {
  "-ts": "Newest first",
  ts: "Oldest first",
  "-bytes": "Largest first",
  bytes: "Smallest first",
  "-risk": "Highest risk first",
  risk: "Lowest risk first",
};

function initialCondition(
  field: { name: string; operators: string[] },
): SearchConditionDefinition {
  const operator = field.operators[0] ?? "";
  return {
    field: field.name,
    operator,
    values:
      operator === "exists" ? [] : operator === "between" ? ["", ""] : [""],
  };
}

export function SearchBuilder() {
  const metadataQuery = useQuery({
    queryKey: ["search-metadata"],
    queryFn: fetchSearchMetadata,
    retry: false,
  });

  if (metadataQuery.isPending) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-600">Loading search metadata…</p>
      </div>
    );
  }

  if (metadataQuery.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-rose-950">
          Search metadata is unavailable
        </h2>
        <p className="mt-2 text-sm text-rose-800">
          {metadataQuery.error.message}
        </p>
        <button
          className="mt-4 rounded-lg bg-rose-800 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => void metadataQuery.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  return <SearchBuilderFromUrl metadata={metadataQuery.data} />;
}

type PreparedLink = { query: string; url: string };

function SearchBuilderFromUrl({ metadata }: { metadata: SearchMetadata }) {
  const searchParams = useSearchParams();
  const sharedValue = searchParams.get("q");
  const [preparedLink, setPreparedLink] = useState<PreparedLink | null>(null);

  // URL navigation remounts the draft, while rerenders under the same URL
  // preserve unsaved edits.
  return (
    <SearchBuilderForm
      key={sharedValue ?? "new-search"}
      metadata={metadata}
      onInvalidateLink={() => setPreparedLink(null)}
      onPrepareLink={(query, url) => setPreparedLink({ query, url })}
      shareUrl={preparedLink?.query === sharedValue ? preparedLink.url : ""}
      sharedValue={sharedValue}
    />
  );
}

type SearchBuilderFormProps = {
  metadata: SearchMetadata;
  onInvalidateLink: () => void;
  onPrepareLink: (query: string, url: string) => void;
  shareUrl: string;
  sharedValue: string | null;
};

function SearchBuilderForm({
  metadata,
  onInvalidateLink,
  onPrepareLink,
  shareUrl,
  sharedValue,
}: SearchBuilderFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const decoded = sharedValue ? decodeSearchDefinition(sharedValue) : null;
  const [definition, setDefinition] = useState<SearchDefinition>(() => {
    if (decoded?.ok) {
      return decoded.value;
    }

    const readable = new Set(metadata.profile.sensor_ids);
    return {
      ...createCaptureAwareSearchDefinition(metadata),
      sensorIds: metadata.sensors
        .filter((sensor) => readable.has(sensor.id))
        .map((sensor) => sensor.id),
    };
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState("");

  const readableSensorIds = new Set(metadata.profile.sensor_ids);

  function editDefinition(
    update: (current: SearchDefinition) => SearchDefinition,
  ) {
    setDefinition(update);
    setValidationErrors([]);
    setCopyStatus("");
    onInvalidateLink();
  }

  function updateCondition(
    index: number,
    condition: SearchConditionDefinition,
  ) {
    editDefinition((current) => ({
      ...current,
      conditions: current.conditions.map((existing, conditionIndex) =>
        conditionIndex === index ? condition : existing,
      ),
    }));
  }

  function removeCondition(index: number) {
    editDefinition((current) => ({
      ...current,
      conditions: current.conditions.filter(
        (_, conditionIndex) => conditionIndex !== index,
      ),
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCopyStatus("");
    const result = buildSearchCreate(definition, metadata);

    if (!result.ok) {
      setValidationErrors(result.errors);
      onInvalidateLink();
      return;
    }

    setValidationErrors([]);
    const parameters = new URLSearchParams();
    const encoded = encodeSearchDefinition(definition);
    parameters.set("q", encoded);
    const relativeUrl = `${pathname}?${parameters.toString()}`;
    onPrepareLink(
      encoded,
      new URL(relativeUrl, window.location.origin).toString(),
    );
    router.push(relativeUrl, { scroll: false });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus("Search link copied.");
    } catch {
      setCopyStatus("Copy failed. Select the link manually.");
    }
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      {!decoded?.ok && sharedValue ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {decoded?.error} A new search definition has been loaded instead.
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
              Investigation workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Traffic search
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Build a reproducible query from backend-provided fields and
              sensors. Search execution is added in the next milestone.
            </p>
          </div>
          <p className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {metadata.fields.length} fields · {metadata.columns.length} result
            columns
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            From
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
              onChange={(event) =>
                editDefinition((current) => ({
                  ...current,
                  from: fromDateTimeLocal(event.target.value),
                }))
              }
              type="datetime-local"
              value={toDateTimeLocal(definition.from)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            To
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-950"
              onChange={(event) =>
                editDefinition((current) => ({
                  ...current,
                  to: fromDateTimeLocal(event.target.value),
                }))
              }
              type="datetime-local"
              value={toDateTimeLocal(definition.to)}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Sensors</h2>
        <p className="mt-1 text-sm text-slate-600">
          Locked sensors remain visible but cannot be selected.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {metadata.sensors.map((sensor) => {
            const readable = readableSensorIds.has(sensor.id);
            return (
              <label
                className={`flex gap-3 rounded-xl border p-4 ${
                  readable
                    ? "border-slate-200 bg-white"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
                key={sensor.id}
              >
                <input
                  checked={definition.sensorIds.includes(sensor.id)}
                  className="mt-1 size-4 accent-sky-700"
                  disabled={!readable}
                  onChange={(event) =>
                    editDefinition((current) => ({
                      ...current,
                      sensorIds: event.target.checked
                        ? [...current.sensorIds, sensor.id]
                        : current.sensorIds.filter((id) => id !== sensor.id),
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    {sensor.name}
                  </span>
                  <span className="mt-1 block text-xs">
                    {sensor.site} · {sensor.kind} · {sensor.status}
                    {!readable ? " · Locked" : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Conditions</h2>
            <p className="mt-1 text-sm text-slate-600">
              Conditions are combined with AND.
            </p>
          </div>
          <button
            className="rounded-lg border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={metadata.fields.length === 0}
            onClick={() => {
              const firstField = metadata.fields[0];
              if (firstField) {
                editDefinition((current) => ({
                  ...current,
                  conditions: [
                    ...current.conditions,
                    initialCondition(firstField),
                  ],
                }));
              }
            }}
            type="button"
          >
            Add condition
          </button>
        </div>

        {metadata.fields.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            No searchable fields were supplied by the backend.
          </p>
        ) : definition.conditions.length === 0 ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            No conditions. The selected sensors and time range will be used.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {definition.conditions.map((condition, index) => (
              <ConditionEditor
                condition={condition}
                fields={metadata.fields}
                key={`${index}-${condition.field}`}
                onChange={(next) => updateCondition(index, next)}
                onRemove={() => removeCondition(index)}
                readableSensorIds={readableSensorIds}
                sensors={metadata.sensors}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block max-w-sm text-sm font-medium text-slate-700">
          Sort order
          <select
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950"
            onChange={(event) =>
              editDefinition((current) => ({
                ...current,
                sort: event.target.value,
              }))
            }
            value={definition.sort}
          >
            {SUPPORTED_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>

        {validationErrors.length > 0 ? (
          <div
            className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
            role="alert"
          >
            <p className="font-semibold">Fix the search definition:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
            type="submit"
          >
            Prepare search link
          </button>
          {shareUrl ? (
            <button
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              onClick={() => void copyLink()}
              type="button"
            >
              Copy search link
            </button>
          ) : null}
          {copyStatus ? (
            <span className="text-sm text-slate-600" role="status">
              {copyStatus}
            </span>
          ) : null}
        </div>

        {shareUrl ? (
          <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Search definition ready</p>
            <p className="mt-1 break-all">{shareUrl}</p>
          </div>
        ) : null}
      </section>
    </form>
  );
}
