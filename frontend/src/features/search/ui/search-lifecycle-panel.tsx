"use client";

import type { SearchApiError } from "@/features/search/api/search-api";
import type { SearchJob } from "@/features/search/model/search-job";

type SearchLifecyclePanelProps = {
  phase: "idle" | "creating" | "active" | "releasing";
  job: SearchJob | null;
  createError: SearchApiError | null;
  releaseError: SearchApiError | null;
  progressError: SearchApiError | null;
  isPolling: boolean;
  hasActiveSearch: boolean;
  hasPendingSubmission: boolean;
  onAbandonPending: () => void;
  onRelease: () => void;
  onRetryPending: () => void;
  onRetryProgress: () => void;
};

const STATE_LABELS = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
} as const;

function ErrorDetails({ error }: { error: SearchApiError }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
      <p className="font-semibold">{error.message}</p>
      {error.status === 429 ? (
        <p className="mt-1">
          The backend allows three retained searches. Release an existing search
          slot, then retry this submission.
        </p>
      ) : null}
      {error.issues && error.issues.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {error.issues.map((issue) => (
            <li key={`${issue.location.join(".")}-${issue.code}`}>
              {issue.location.join(".")}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SearchLifecyclePanel({
  phase,
  job,
  createError,
  releaseError,
  progressError,
  isPolling,
  hasActiveSearch,
  hasPendingSubmission,
  onAbandonPending,
  onRelease,
  onRetryPending,
  onRetryProgress,
}: SearchLifecyclePanelProps) {
  if (phase === "creating") {
    return (
      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-6 shadow-sm" aria-live="polite">
        <h2 className="text-lg font-semibold text-sky-950">Starting search</h2>
        <p className="mt-1 text-sm text-sky-800">
          The request may be retried once with the same idempotency key if its
          outcome is ambiguous.
        </p>
        <button
          className="mt-4 rounded-lg border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-800"
          onClick={onRelease}
          type="button"
        >
          Cancel pending search
        </button>
      </section>
    );
  }

  if (createError) {
    return (
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ErrorDetails error={createError} />
        {hasPendingSubmission ? (
          <div className="text-sm text-slate-700">
            <p>
              The outcome is unresolved. Retry sends the exact original body
              with the same idempotency key. Current form edits are not used.
            </p>
            <p className="mt-1">
              Abandoning allows a new search, but cannot guarantee cleanup if
              the backend committed a job without returning its id.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white"
                onClick={onRetryPending}
                type="button"
              >
                Retry unresolved submission
              </button>
              <button
                className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700"
                onClick={onAbandonPending}
                type="button"
              >
                Abandon unresolved submission
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (!job && !progressError && !releaseError) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
            Search lifecycle
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {job ? STATE_LABELS[job.state] : "Progress unavailable"}
          </h2>
          {job ? (
            <p className="mt-1 font-mono text-xs text-slate-500">{job.id}</p>
          ) : null}
        </div>
        {isPolling ? (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
            Updating
          </span>
        ) : null}
      </div>

      {job ? (
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>{job.progress.scannedSessions.toLocaleString()} scanned</span>
            <span>{job.progress.percent.toFixed(1)}%</span>
          </div>
          <progress
            className="mt-2 h-2 w-full accent-sky-700"
            max={100}
            value={Math.min(100, Math.max(0, job.progress.percent))}
          />
          <p className="mt-2 text-sm text-slate-600">
            {job.progress.matchedIsEstimate ? "About " : ""}
            {job.progress.matched.toLocaleString()} matched of approximately{" "}
            {job.progress.totalSessionsEstimate.toLocaleString()} sessions.
          </p>
          {job.state === "failed" ? (
            <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">
              The backend could not finish this search. Release its slot, review
              the definition, and run it again.
            </p>
          ) : null}
        </div>
      ) : null}

      {job && job.warnings.length > 0 ? (
        <div className="mt-5 space-y-2">
          <h3 className="text-sm font-semibold text-amber-950">Capture warnings</h3>
          {job.warnings.map((warning, index) => (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              key={`${warning.code}-${warning.sensorId}-${index}`}
            >
              <p className="font-semibold">
                {warning.code === "capture_gap"
                  ? "Capture gap"
                  : warning.code === "sensor_lagging"
                    ? "Sensor lagging"
                    : warning.code}
                {warning.sensorId ? ` · ${warning.sensorId}` : ""}
              </p>
              <p className="mt-1">{warning.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {progressError ? (
        <div className="mt-5">
          <ErrorDetails error={progressError} />
          {progressError.status === 410 ? (
            <p className="mt-2 text-sm text-slate-700">
              This backend job expired. Clear it below, then run the search again
              from the definition preserved in this URL.
            </p>
          ) : (
            <button
              className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={onRetryProgress}
              type="button"
            >
              Retry progress check
            </button>
          )}
        </div>
      ) : null}

      {releaseError ? (
        <div className="mt-5">
          <ErrorDetails error={releaseError} />
        </div>
      ) : null}

      {hasActiveSearch ? (
        <button
          className="mt-5 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 disabled:cursor-wait disabled:opacity-60"
          disabled={phase === "releasing"}
          onClick={onRelease}
          type="button"
        >
          {phase === "releasing"
            ? "Releasing search slot…"
            : progressError?.status === 410
              ? "Clear expired search"
              : job?.state === "done"
                ? "Release completed search slot"
                : "Cancel and release search slot"}
        </button>
      ) : null}
    </section>
  );
}
