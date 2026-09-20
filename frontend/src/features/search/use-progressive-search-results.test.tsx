import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchResultsPage } from "@/features/search/search-results";
import type { SearchState } from "@/features/search/search-job";
import { useProgressiveSearchResults } from "@/features/search/use-progressive-search-results";

const searchApi = vi.hoisted(() => ({
  fetchSearchResults: vi.fn(),
}));

vi.mock("@/features/search/search-api", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/search/search-api")
  >();
  return { ...actual, ...searchApi };
});

function resultPage(
  ids: string[],
  nextCursor: string | null,
  complete: boolean,
): SearchResultsPage {
  return {
    items: ids.map((id) => ({ id })),
    nextCursor,
    complete,
    matchedSoFar: ids.length,
    malformedItems: 0,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Harness({
  jobState = "running",
  searchId,
}: {
  jobState?: SearchState;
  searchId: string;
}) {
  const results = useProgressiveSearchResults(searchId, jobState, "-ts");
  return (
    <div>
      <span data-testid="rows">
        {results.rows.map((row) => row.id).join(",")}
      </span>
      <span data-testid="complete">{String(results.complete)}</span>
      <span data-testid="terminal-checks">
        {results.terminalCaughtUpChecks}
      </span>
      <span data-testid="terminal-exhausted">
        {String(results.terminalTailExhausted)}
      </span>
      {results.terminalTailExhausted ? (
        <button onClick={() => void results.checkAgain()} type="button">
          Check results again
        </button>
      ) : null}
    </div>
  );
}

describe("useProgressiveSearchResults", () => {
  beforeEach(() => {
    searchApi.fetchSearchResults.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls the same caught-up cursor and merges later rows", async () => {
    vi.useFakeTimers();
    searchApi.fetchSearchResults
      .mockResolvedValueOnce(resultPage(["1"], null, false))
      .mockResolvedValueOnce(resultPage(["1", "2"], null, true));
    render(<Harness searchId="search-1" />, { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("rows")).toHaveTextContent("1");

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByTestId("rows")).toHaveTextContent("1,2");
    expect(screen.getByTestId("complete")).toHaveTextContent("true");
    expect(searchApi.fetchSearchResults.mock.calls).toEqual([
      ["search-1", null, "-ts", expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ["search-1", null, "-ts", expect.objectContaining({ signal: expect.any(AbortSignal) })],
    ]);
  });

  it("does not merge a stale response after the job changes", async () => {
    let resolveOld: ((page: SearchResultsPage) => void) | undefined;
    searchApi.fetchSearchResults.mockImplementation((searchId: string) => {
      if (searchId === "search-1") {
        return new Promise<SearchResultsPage>((resolve) => {
          resolveOld = resolve;
        });
      }
      return Promise.resolve(resultPage(["new-job-row"], null, true));
    });
    const view = render(<Harness searchId="search-1" />, { wrapper });

    view.rerender(<Harness searchId="search-2" />);
    expect(await screen.findByText("new-job-row")).toBeInTheDocument();
    resolveOld?.(resultPage(["stale-row"], null, true));
    await waitFor(() =>
      expect(screen.getByTestId("rows")).toHaveTextContent("new-job-row"),
    );
    expect(screen.getByTestId("rows")).not.toHaveTextContent("stale-row");
  });

  it("starts fresh bounded tail checks when a caught-up job becomes done", async () => {
    vi.useFakeTimers();
    searchApi.fetchSearchResults
      .mockResolvedValueOnce(resultPage(["1"], null, false))
      .mockResolvedValueOnce(resultPage(["1"], null, false))
      .mockResolvedValueOnce(resultPage(["1"], null, false))
      .mockResolvedValueOnce(resultPage(["1", "2"], null, true));
    const view = render(<Harness searchId="search-1" />, { wrapper });

    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(searchApi.fetchSearchResults).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("terminal-checks")).toHaveTextContent("0");

    view.rerender(<Harness jobState="done" searchId="search-1" />);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(searchApi.fetchSearchResults).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId("rows")).toHaveTextContent("1,2");
    expect(screen.getByTestId("complete")).toHaveTextContent("true");
  });

  it("exposes manual tail recovery and continues pagination without duplicates", async () => {
    vi.useFakeTimers();
    searchApi.fetchSearchResults
      .mockResolvedValueOnce(resultPage(["1"], null, false))
      .mockResolvedValueOnce(resultPage(["1"], null, false))
      .mockResolvedValueOnce(resultPage(["1"], null, false))
      .mockResolvedValueOnce(resultPage(["1", "2"], "cursor-1", false))
      .mockResolvedValueOnce(resultPage(["2", "3"], null, true));
    render(<Harness jobState="done" searchId="search-1" />, { wrapper });

    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(screen.getByTestId("terminal-exhausted")).toHaveTextContent("true");
    expect(screen.getByTestId("complete")).toHaveTextContent("false");
    screen.getByRole("button", { name: "Check results again" }).click();
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByTestId("rows")).toHaveTextContent("1,2,3");
    expect(screen.getByTestId("complete")).toHaveTextContent("true");
    expect(searchApi.fetchSearchResults.mock.calls.map((call) => call[1])).toEqual([
      null,
      null,
      null,
      null,
      "cursor-1",
    ]);
  });
});
