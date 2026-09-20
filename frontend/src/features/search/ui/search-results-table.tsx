"use client";

import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SearchApiError } from "@/features/search/api/search-api";
import {
  createHostPivotDefinition,
  decodeSearchDefinition,
  encodeSearchDefinition,
  SUPPORTED_SORTS,
  type SearchDefinition,
} from "@/features/search/model/search-definition";
import type { SearchJob } from "@/features/search/model/search-job";
import type {
  ColumnMetadata,
  SearchMetadata,
} from "@/features/search/model/metadata";
import {
  formatResultCell,
  resultEndpointIp,
  type SearchResultRow,
} from "@/features/search/model/search-results";
import { useProgressiveSearchResults } from "@/features/search/hooks/use-progressive-search-results";
import type { components } from "@/generated/api";

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, SearchResultRow>();
type SortKey = components["schemas"]["SortKey"];

const SORT_BY_COLUMN: Record<string, [SortKey, SortKey]> = {
  start: ["-ts", "ts"],
  bytes: ["-bytes", "bytes"],
  risk: ["-risk", "risk"],
};

function supportedSort(value: string | undefined): SortKey {
  return SUPPORTED_SORTS.find((sort) => sort === value) ?? "-ts";
}

function pivotUrl(
  pathname: string,
  definition: SearchDefinition | null,
  metadata: SearchMetadata,
  direction: "src" | "dst",
  ip: string | null,
): string | null {
  if (!definition || !ip) {
    return null;
  }

  const pivot = createHostPivotDefinition(definition, metadata, direction, ip);
  if (!pivot) {
    return null;
  }

  const parameters = new URLSearchParams({ q: encodeSearchDefinition(pivot) });
  return `${pathname}?${parameters.toString()}`;
}

function sessionUrl(
  sessionId: string,
  definition: SearchDefinition | null,
): string {
  const path = `/sessions/${encodeURIComponent(sessionId)}`;
  return definition
    ? `${path}?${new URLSearchParams({ q: encodeSearchDefinition(definition) })}`
    : path;
}

function sortLabel(sort: SortKey): string {
  return {
    "-ts": "Newest first",
    ts: "Oldest first",
    "-bytes": "Largest first",
    bytes: "Smallest first",
    "-risk": "Highest risk first",
    risk: "Lowest risk first",
  }[sort];
}

function ResultError({
  error,
  onRetry,
  onResetSort,
}: {
  error: unknown;
  onRetry: () => void;
  onResetSort: () => void;
}) {
  const apiError =
    error instanceof SearchApiError
      ? error
      : new SearchApiError(0, "unexpected_error", "Results could not be loaded.");

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
      <p className="font-semibold">{apiError.message}</p>
      {apiError.status === 409 ? (
        <p className="mt-1">
          Alternate server sorting is available only after the search finishes.
        </p>
      ) : apiError.status === 410 ? (
        <p className="mt-1">
          This result job expired. Run the definition preserved in the URL again.
        </p>
      ) : null}
      <div className="mt-3 flex gap-3">
        {apiError.status === 409 ? (
          <button className="rounded-lg border border-rose-300 px-3 py-2 font-semibold" onClick={onResetSort} type="button">
            Use newest first
          </button>
        ) : null}
        <button className="rounded-lg border border-rose-300 px-3 py-2 font-semibold" onClick={onRetry} type="button">
          Retry results
        </button>
      </div>
    </div>
  );
}

export function SearchResultsTable({
  job,
  metadata,
  searchId,
  submissionQuery,
}: {
  job: SearchJob | null;
  metadata: SearchMetadata;
  searchId: string | null;
  submissionQuery: string | null;
}) {
  const pathname = usePathname();
  const decoded = submissionQuery
    ? decodeSearchDefinition(submissionQuery)
    : null;
  const submittedDefinition = decoded?.ok ? decoded.value : null;
  const requestedSort = supportedSort(submittedDefinition?.sort);
  const [serverSort, setServerSort] = useState<SortKey>("-ts");
  const sortedJobRef = useRef<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () =>
      new Set(
        metadata.columns
          .filter((column) => column.defaultVisible)
          .map((column) => column.key),
      ),
  );

  useEffect(() => {
    setServerSort("-ts");
    sortedJobRef.current = null;
  }, [searchId]);

  useEffect(() => {
    if (searchId && job?.state === "done" && sortedJobRef.current !== searchId) {
      sortedJobRef.current = searchId;
      setServerSort(requestedSort);
    }
  }, [job?.state, requestedSort, searchId]);

  const results = useProgressiveSearchResults(
    searchId,
    job?.state ?? null,
    serverSort,
  );

  const columns = useMemo(() => {
    const selected = metadata.columns.filter((column) =>
      visibleColumns.has(column.key),
    );

    return columnHelper.columns([
      ...selected.map((column) =>
        columnHelper.accessor(
          (row) => formatResultCell(row, column.key, column.type),
          {
            id: column.key,
            header: column.label,
            cell: (context) => {
              const row = context.row.original;
              const value = context.getValue();
              const direction =
                column.key === "src"
                  ? "src"
                  : column.key === "dst"
                    ? "dst"
                    : null;
              const hostPivot = direction
                ? pivotUrl(
                    pathname,
                    submittedDefinition,
                    metadata,
                    direction,
                    resultEndpointIp(row, direction),
                  )
                : null;

              return (
                <div className="min-w-0">
                  <span className="block truncate" title={value}>
                    {value}
                  </span>
                  {hostPivot ? (
                    <Link className="mt-0.5 inline-block text-xs font-semibold text-sky-700 hover:underline" href={hostPivot}>
                      Pivot on {direction === "src" ? "source" : "destination"} IP
                    </Link>
                  ) : null}
                </div>
              );
            },
            meta: column,
          },
        ),
      ),
      columnHelper.display({
        id: "actions",
        header: "Session",
        cell: (context) => (
          <div className="text-xs text-slate-600">
            <Link
              className="block font-semibold text-sky-700 hover:underline"
              href={sessionUrl(context.row.original.id, submittedDefinition)}
              rel="noreferrer"
              target="_blank"
            >
              Open session
              <span className="sr-only"> in a new tab</span>
            </Link>
            <span className="block truncate font-mono" title={context.row.original.id}>
              ID {context.row.original.id}
            </span>
          </div>
        ),
        meta: {
          key: "actions",
          label: "Session",
          type: "text",
          defaultVisible: true,
          sortable: false,
          widthHint: 210,
        } satisfies ColumnMetadata,
      }),
    ]);
  }, [metadata, pathname, submittedDefinition, visibleColumns]);

  const table = useTable({
    features,
    columns,
    data: results.rows,
    getRowId: (row) => row.id,
  });
  const tableRows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual intentionally exposes imperative measurement functions;
  // React Compiler safely leaves this component un-memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 8,
  });

  if (!searchId || !job) {
    return null;
  }

  function toggleSort(column: ColumnMetadata) {
    if (job?.state !== "done") {
      return;
    }

    const pair = SORT_BY_COLUMN[column.key];
    if (!pair) {
      return;
    }

    setServerSort((current) => (current === pair[0] ? pair[1] : pair[0]));
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="search-results-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
            Progressive results
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950" id="search-results-title">
            Network sessions
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {results.rows.length.toLocaleString()} loaded · {results.matchedSoFar.toLocaleString()} matched so far
          </p>
        </div>
        <div className="text-right text-sm text-slate-600">
          <p>Server order: {sortLabel(serverSort)}</p>
          {job.state !== "done" ? <p>Alternate sorting unlocks when the search is done.</p> : null}
        </div>
      </div>

      <details className="mt-5 rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Choose columns
        </summary>
        <div className="mt-3 flex flex-wrap gap-3">
          {metadata.columns.map((column) => (
            <label className="flex items-center gap-2 text-sm text-slate-700" key={column.key}>
              <input
                checked={visibleColumns.has(column.key)}
                onChange={(event) =>
                  setVisibleColumns((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(column.key);
                    else next.delete(column.key);
                    return next;
                  })
                }
                type="checkbox"
              />
              {column.label}
            </label>
          ))}
        </div>
      </details>

      {results.error ? (
        <div className="mt-5">
          <ResultError
            error={results.error}
            onResetSort={() => setServerSort("-ts")}
            onRetry={() => void results.retry()}
          />
        </div>
      ) : null}

      {results.malformedItems > 0 ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {results.malformedItems} malformed result {results.malformedItems === 1 ? "row was" : "rows were"} skipped.
        </p>
      ) : null}
      {results.capped ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          The local 25,000-row safety limit was reached. Refine the search to inspect additional sessions.
        </p>
      ) : null}
      {job.state === "failed" ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">
          The search failed. Any rows already returned remain available as partial results.
        </p>
      ) : null}
      {results.terminalTailExhausted && !results.complete ? (
        <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-950" role="status">
          <p className="font-semibold">Results may be incomplete.</p>
          <p className="mt-1">
            The backend did not confirm the final end of results after bounded checks.
          </p>
          <button
            className="mt-3 rounded-lg border border-amber-400 px-3 py-2 font-semibold disabled:cursor-wait disabled:opacity-60"
            disabled={results.isFetching}
            onClick={() => void results.checkAgain()}
            type="button"
          >
            {results.isFetching ? "Checking results…" : "Check results again"}
          </button>
        </div>
      ) : null}

      {results.isInitialLoading ? (
        <p className="mt-5 text-sm text-slate-600">Loading the first result page…</p>
      ) : results.rows.length === 0 && results.complete ? (
        <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
          Search complete with no matching sessions.
        </p>
      ) : results.rows.length === 0 &&
        results.caughtUp &&
        !results.terminalTailExhausted ? (
        <p className="mt-5 rounded-lg bg-sky-50 p-4 text-sm text-sky-900">
          Caught up for now. The search is still being checked for new sessions.
        </p>
      ) : null}

      {results.rows.length > 0 ? (
        <div
          aria-label="Scrollable network session results"
          className="mt-5 max-h-[34rem] overflow-auto rounded-xl border border-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          ref={scrollRef}
          role="region"
          tabIndex={0}
        >
          <table className="grid min-w-max text-left text-sm">
            <thead className="sticky top-0 z-10 grid bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              {table.getHeaderGroups().map((group) => (
                <tr className="flex" key={group.id}>
                  {group.headers.map((header) => {
                    const metadataColumn = header.column.columnDef.meta as ColumnMetadata | undefined;
                    const sortable = metadataColumn?.sortable && SORT_BY_COLUMN[metadataColumn.key];
                    return (
                      <th className="shrink-0 px-3 py-3" key={header.id} style={{ width: metadataColumn?.widthHint ?? 140 }}>
                        {sortable ? (
                          <button
                            className="font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={job.state !== "done"}
                            onClick={() => toggleSort(metadataColumn)}
                            type="button"
                          >
                            {metadataColumn.label}
                            {SORT_BY_COLUMN[metadataColumn.key]?.includes(serverSort) ? (serverSort.startsWith("-") ? " ↓" : " ↑") : ""}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="relative grid" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualRows.map((virtualRow) => {
                const row = tableRows[virtualRow.index];
                return (
                  <tr
                    className="absolute left-0 flex border-t border-slate-100 bg-white hover:bg-sky-50"
                    data-index={virtualRow.index}
                    key={row.id}
                    ref={virtualizer.measureElement}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {row.getAllCells().map((cell) => {
                      const metadataColumn = cell.column.columnDef.meta as ColumnMetadata | undefined;
                      return (
                        <td className="shrink-0 overflow-hidden px-3 py-2.5 text-slate-700" key={cell.id} style={{ width: metadataColumn?.widthHint ?? 140 }}>
                          <table.FlexRender cell={cell} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {results.rows.length > 0 ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          {results.complete
            ? "All available results are loaded."
            : results.terminalTailExhausted
              ? "The final end of results has not been confirmed."
              : results.caughtUp
                ? "Caught up for now; checking the tail for new sessions."
                : "Loading the next result page."}
          {results.isFetching ? " Updating…" : ""}
        </p>
      ) : null}
    </section>
  );
}
