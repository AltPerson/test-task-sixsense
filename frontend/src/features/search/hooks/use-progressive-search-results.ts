"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchSearchResults,
  searchPollRetryDelay,
  shouldRetrySearchPoll,
} from "@/features/search/api/search-api";
import type { SearchState } from "@/features/search/model/search-job";
import {
  createResultsAccumulator,
  mergeResultsPage,
  type ResultsAccumulator,
} from "@/features/search/model/search-results";
import type { components } from "@/generated/api";

const TAIL_POLL_INTERVAL_MS = 1_000;
const TERMINAL_TAIL_CHECK_LIMIT = 3;

type AccumulatorState = {
  key: string;
  value: ResultsAccumulator;
};

export function useProgressiveSearchResults(
  searchId: string | null,
  jobState: SearchState | null,
  sort: components["schemas"]["SortKey"],
) {
  const key = `${searchId ?? "none"}\u0000${sort}`;
  const activeKeyRef = useRef(key);
  const [state, setState] = useState<AccumulatorState>(() => ({
    key,
    value: createResultsAccumulator(),
  }));
  const accumulator = useMemo(
    () => (state.key === key ? state.value : createResultsAccumulator()),
    [key, state],
  );

  useEffect(() => {
    activeKeyRef.current = key;
  }, [key]);

  const terminal =
    jobState === "done" || jobState === "failed" || jobState === "cancelled";
  const resultPhase = terminal ? jobState : "active";
  const terminalTailExhausted =
    terminal &&
    accumulator.caughtUp &&
    accumulator.terminalCaughtUpChecks >= TERMINAL_TAIL_CHECK_LIMIT;
  const canFetch =
    Boolean(searchId) &&
    !accumulator.complete &&
    !accumulator.capped &&
    !terminalTailExhausted;
  const requestCursor = accumulator.requestCursor;

  const pageQuery = useQuery({
    // A terminal phase gets a distinct query identity so completion always
    // checks the current tail, even after many caught-up checks while running.
    queryKey: ["search-results", searchId, sort, requestCursor, resultPhase],
    enabled: canFetch,
    queryFn: async ({ signal }) => {
      const page = await fetchSearchResults(
        searchId ?? "",
        requestCursor,
        sort,
        { signal },
      );

      // A response may finish after navigation or a replacement job. Its query
      // cache remains isolated, but it must not enter the visible accumulator.
      if (activeKeyRef.current === key) {
        setState((current) => ({
          key,
          value: mergeResultsPage(
            current.key === key
              ? current.value
              : createResultsAccumulator(),
            page,
            requestCursor,
            undefined,
            terminal,
          ),
        }));
      }

      return page;
    },
    retry: shouldRetrySearchPoll,
    retryDelay: searchPollRetryDelay,
    refetchInterval: (query) =>
      query.state.data?.complete ||
      !accumulator.caughtUp ||
      terminalTailExhausted
        ? false
        : TAIL_POLL_INTERVAL_MS,
  });

  return {
    ...accumulator,
    error: pageQuery.error,
    isFetching: pageQuery.isFetching,
    isInitialLoading:
      accumulator.rows.length === 0 && pageQuery.isPending && canFetch,
    terminalTailExhausted,
    checkAgain: pageQuery.refetch,
    retry: pageQuery.refetch,
  };
}
