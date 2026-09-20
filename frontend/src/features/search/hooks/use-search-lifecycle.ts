"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSearchIdempotencyKey,
  createSearchJob,
  createSearchSubmission,
  fetchSearchJob,
  isAmbiguousSearchError,
  releaseSearchJob,
  SearchApiError,
  type SearchSubmission,
  searchPollRetryDelay,
  shouldRetrySearchPoll,
} from "@/features/search/api/search-api";
import {
  isTerminalSearchState,
  type SearchJob,
} from "@/features/search/model/search-job";
import type { components } from "@/generated/api";

type LifecyclePhase = "idle" | "creating" | "active" | "releasing";

type PendingSearchSubmission = {
  request: SearchSubmission;
  encodedDefinition: string;
};

function lifecycleError(error: unknown): SearchApiError {
  return error instanceof SearchApiError
    ? error
    : new SearchApiError(
        0,
        "unexpected_error",
        "The search operation could not be completed.",
      );
}

export function useSearchLifecycle() {
  const queryClient = useQueryClient();
  const [phase, setPhaseState] = useState<LifecyclePhase>("idle");
  const [searchId, setSearchId] = useState<string | null>(null);
  const [lastJob, setLastJob] = useState<SearchJob | null>(null);
  const [submissionQuery, setSubmissionQuery] = useState<string | null>(null);
  const [createError, setCreateError] = useState<SearchApiError | null>(null);
  const [releaseError, setReleaseError] = useState<SearchApiError | null>(null);
  const [hasPendingSubmission, setHasPendingSubmission] = useState(false);
  const phaseRef = useRef<LifecyclePhase>("idle");
  const activeSearchIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const disposedRef = useRef(false);
  const pendingSubmissionRef = useRef<PendingSearchSubmission | null>(null);

  const setPhase = useCallback((next: LifecyclePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  useEffect(() => {
    disposedRef.current = false;

    return () => {
      disposedRef.current = true;
      generationRef.current += 1;
      const activeSearchId = activeSearchIdRef.current;

      if (activeSearchId) {
        // Explicit release is authoritative. Navigation cleanup is best effort
        // and intentionally cannot update state after this workspace is gone.
        void releaseSearchJob(activeSearchId).catch(() => undefined);
      }
    };
  }, []);

  const progressQuery = useQuery({
    queryKey: ["search-job", searchId],
    enabled: Boolean(searchId) && phase === "active",
    queryFn: ({ signal }) =>
      fetchSearchJob(searchId ?? "", { signal }),
    refetchInterval: (query) => {
      if (query.state.error) {
        return false;
      }

      const job = query.state.data;
      return job && !isTerminalSearchState(job.state) ? 750 : false;
    },
    retry: shouldRetrySearchPoll,
    retryDelay: searchPollRetryDelay,
  });

  const submit = useCallback(
    async (pending: PendingSearchSubmission) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setCreateError(null);
      setReleaseError(null);
      setLastJob(null);
      setSubmissionQuery(pending.encodedDefinition);
      setPhase("creating");

      try {
        const job = await createSearchJob(pending.request);

        if (disposedRef.current || generation !== generationRef.current) {
          await releaseSearchJob(job.id).catch(() => undefined);
          return;
        }

        if (pendingSubmissionRef.current === pending) {
          pendingSubmissionRef.current = null;
          setHasPendingSubmission(false);
        }
        queryClient.setQueryData(["search-job", job.id], job);
        activeSearchIdRef.current = job.id;
        setSearchId(job.id);
        setLastJob(job);
        setPhase("active");
      } catch (error) {
        if (disposedRef.current || generation !== generationRef.current) {
          return;
        }

        if (!isAmbiguousSearchError(error)) {
          pendingSubmissionRef.current = null;
          setHasPendingSubmission(false);
          setSubmissionQuery(null);
        }
        setCreateError(lifecycleError(error));
        setPhase("idle");
      }
    },
    [queryClient, setPhase],
  );

  const start = useCallback(
    async (
      definition: components["schemas"]["SearchCreate"],
      encodedDefinition: string,
    ) => {
      if (
        phaseRef.current !== "idle" ||
        activeSearchIdRef.current ||
        pendingSubmissionRef.current
      ) {
        return;
      }

      const pending = {
        request: createSearchSubmission(
          definition,
          createSearchIdempotencyKey(),
        ),
        encodedDefinition,
      };
      pendingSubmissionRef.current = pending;
      setHasPendingSubmission(true);
      await submit(pending);
    },
    [submit],
  );

  const retryPending = useCallback(async () => {
    const pending = pendingSubmissionRef.current;

    if (!pending || phaseRef.current !== "idle" || activeSearchIdRef.current) {
      return;
    }

    await submit(pending);
  }, [submit]);

  const abandonPending = useCallback(() => {
    if (!pendingSubmissionRef.current || activeSearchIdRef.current) {
      return;
    }

    generationRef.current += 1;
    pendingSubmissionRef.current = null;
    setHasPendingSubmission(false);
    setCreateError(null);
    setSubmissionQuery(null);
    setPhase("idle");
  }, [setPhase]);

  const release = useCallback(async () => {
    if (phaseRef.current === "creating") {
      // A late successful create is released by start() after this generation is
      // invalidated, so cancelling the local wait cannot leak a known job.
      generationRef.current += 1;
      pendingSubmissionRef.current = null;
      setHasPendingSubmission(false);
      setCreateError(null);
      setSubmissionQuery(null);
      setPhase("idle");
      return;
    }

    const activeSearchId = activeSearchIdRef.current;

    if (!activeSearchId || phaseRef.current === "releasing") {
      return;
    }

    setReleaseError(null);
    setPhase("releasing");
    await Promise.all([
      queryClient.cancelQueries({
        queryKey: ["search-job", activeSearchId],
      }),
      queryClient.cancelQueries({
        queryKey: ["search-results", activeSearchId],
      }),
    ]);

    try {
      await releaseSearchJob(activeSearchId);
      const current = queryClient.getQueryData<SearchJob>([
        "search-job",
        activeSearchId,
      ]);
      setLastJob(current ? { ...current, state: "cancelled" } : null);
      activeSearchIdRef.current = null;
      setSearchId(null);
      setSubmissionQuery(null);
      setPhase("idle");
    } catch (error) {
      setReleaseError(lifecycleError(error));
      setPhase("active");
    }
  }, [queryClient, setPhase]);

  const job = progressQuery.data ?? lastJob;

  return {
    phase,
    job,
    searchId,
    submissionQuery,
    createError,
    releaseError,
    progressError: progressQuery.error
      ? lifecycleError(progressQuery.error)
      : null,
    isPolling: progressQuery.isFetching,
    retryProgress: progressQuery.refetch,
    start,
    release,
    retryPending,
    abandonPending,
    hasActiveSearch: searchId !== null,
    hasPendingSubmission,
    isLocked: phase !== "idle" || searchId !== null || hasPendingSubmission,
  };
}
