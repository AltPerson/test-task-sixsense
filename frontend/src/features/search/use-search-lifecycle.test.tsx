import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SearchApiError } from "@/features/search/search-api";
import type { SearchJob } from "@/features/search/search-job";
import { useSearchLifecycle } from "@/features/search/use-search-lifecycle";

const searchApi = vi.hoisted(() => ({
  createSearchIdempotencyKey: vi.fn(),
  createSearchJob: vi.fn(),
  fetchSearchJob: vi.fn(),
  releaseSearchJob: vi.fn(),
}));

vi.mock("@/features/search/search-api", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/search/search-api")
  >();

  return {
    ...actual,
    ...searchApi,
  };
});

const definition = {
  sensor_ids: ["sensor-1"],
  from: "2026-01-01T10:00:00.000Z",
  to: "2026-01-01T11:00:00.000Z",
  filter: { all: [] },
  sort: "-ts" as const,
};

const replacementDefinition = {
  ...definition,
  to: "2026-01-01T12:00:00.000Z",
};

function job(state: SearchJob["state"], id = "search-1"): SearchJob {
  return {
    id,
    state,
    sensorIds: ["sensor-1"],
    createdAt: "2026-01-01T10:00:00.000Z",
    progress: {
      scannedSessions: state === "done" ? 10 : 1,
      totalSessionsEstimate: 10,
      matched: state === "done" ? 2 : 0,
      matchedIsEstimate: state !== "done",
      percent: state === "done" ? 100 : 10,
    },
    warnings: [],
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Harness() {
  const lifecycle = useSearchLifecycle();

  return (
    <div>
      <button
        onClick={() => void lifecycle.start(definition, "encoded-definition")}
        type="button"
      >
        Start
      </button>
      <button
        onClick={() =>
          void lifecycle.start(replacementDefinition, "replacement-definition")
        }
        type="button"
      >
        Start replacement
      </button>
      <button onClick={() => void lifecycle.release()} type="button">
        Release
      </button>
      <button onClick={() => void lifecycle.retryPending()} type="button">
        Retry pending
      </button>
      <button onClick={lifecycle.abandonPending} type="button">
        Abandon pending
      </button>
      <span data-testid="phase">{lifecycle.phase}</span>
      <span data-testid="state">{lifecycle.job?.state ?? "none"}</span>
      <span data-testid="progress-error">
        {lifecycle.progressError?.code ?? "none"}
      </span>
      <span data-testid="pending">
        {lifecycle.hasPendingSubmission ? "pending" : "none"}
      </span>
    </div>
  );
}

describe("useSearchLifecycle", () => {
  beforeEach(() => {
    searchApi.createSearchIdempotencyKey
      .mockReset()
      .mockReturnValueOnce("submission-key-1")
      .mockReturnValueOnce("submission-key-2");
    searchApi.createSearchJob.mockReset();
    searchApi.fetchSearchJob.mockReset();
    searchApi.releaseSearchJob.mockReset().mockResolvedValue(undefined);
  });

  it("prevents overlapping creates and stops polling at done", async () => {
    let resolveCreate: ((value: SearchJob) => void) | undefined;
    searchApi.createSearchJob.mockReturnValue(
      new Promise<SearchJob>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    searchApi.fetchSearchJob.mockResolvedValue(job("done"));
    render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(searchApi.createSearchJob).toHaveBeenCalledOnce();
    resolveCreate?.(job("queued"));

    expect(await screen.findByText("done")).toBeInTheDocument();
    expect(searchApi.fetchSearchJob).toHaveBeenCalledOnce();
  });

  it("releases a late create result after pending cancellation", async () => {
    let resolveCreate: ((value: SearchJob) => void) | undefined;
    searchApi.createSearchJob.mockReturnValue(
      new Promise<SearchJob>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("creating")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Release" }));
    expect(await screen.findByText("idle")).toBeInTheDocument();
    resolveCreate?.(job("queued"));

    await waitFor(() =>
      expect(searchApi.releaseSearchJob).toHaveBeenCalledWith("search-1"),
    );
    expect(screen.getByTestId("state")).toHaveTextContent("none");
  });

  it("does not let a failed late cleanup corrupt a replacement search", async () => {
    let resolveFirstCreate: ((value: SearchJob) => void) | undefined;
    searchApi.createSearchJob
      .mockReturnValueOnce(
        new Promise<SearchJob>((resolve) => {
          resolveFirstCreate = resolve;
        }),
      )
      .mockResolvedValueOnce(job("done", "search-2"));
    searchApi.fetchSearchJob.mockResolvedValue(job("done", "search-2"));
    searchApi.releaseSearchJob.mockRejectedValue(
      new SearchApiError(0, "network_error", "Unavailable."),
    );
    render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("creating")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Release" }));
    fireEvent.click(screen.getByRole("button", { name: "Start replacement" }));
    expect(await screen.findByText("done")).toBeInTheDocument();

    resolveFirstCreate?.(job("queued", "search-1"));
    await waitFor(() =>
      expect(searchApi.releaseSearchJob).toHaveBeenCalledWith("search-1"),
    );
    expect(screen.getByTestId("state")).toHaveTextContent("done");
    expect(screen.getByTestId("phase")).toHaveTextContent("active");
  });

  it("releases a retained job when navigation unmounts the workspace", async () => {
    searchApi.createSearchJob.mockResolvedValue(job("done"));
    searchApi.fetchSearchJob.mockResolvedValue(job("done"));
    const view = render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("done")).toBeInTheDocument();
    view.unmount();

    await waitFor(() =>
      expect(searchApi.releaseSearchJob).toHaveBeenCalledWith("search-1"),
    );
  });

  it("swallows a rejected best-effort cleanup when navigation unmounts", async () => {
    searchApi.createSearchJob.mockResolvedValue(job("done"));
    searchApi.fetchSearchJob.mockResolvedValue(job("done"));
    searchApi.releaseSearchJob.mockRejectedValue(
      new SearchApiError(0, "network_error", "Unavailable."),
    );
    const view = render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("done")).toBeInTheDocument();
    view.unmount();

    await waitFor(() =>
      expect(searchApi.releaseSearchJob).toHaveBeenCalledWith("search-1"),
    );
    await Promise.resolve();
  });

  it("retries an unresolved submission with the same key and exact body", async () => {
    searchApi.createSearchJob
      .mockRejectedValueOnce(
        new SearchApiError(503, "temporarily_unavailable", "Unknown outcome."),
      )
      .mockResolvedValueOnce(job("done"));
    searchApi.fetchSearchJob.mockResolvedValue(job("done"));
    render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("pending")).toBeInTheDocument();
    const firstSubmission = searchApi.createSearchJob.mock.calls[0]?.[0];

    fireEvent.click(screen.getByRole("button", { name: "Retry pending" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry pending" }));
    expect(await screen.findByText("done")).toBeInTheDocument();

    expect(searchApi.createSearchJob).toHaveBeenCalledTimes(2);
    expect(searchApi.createSearchJob.mock.calls[1]?.[0]).toBe(firstSubmission);
    expect(firstSubmission).toMatchObject({
      idempotencyKey: "submission-key-1",
      definition,
      body: JSON.stringify(definition),
    });
    expect(searchApi.createSearchIdempotencyKey).toHaveBeenCalledOnce();
  });

  it("blocks replacement until an unresolved submission is abandoned", async () => {
    searchApi.createSearchJob
      .mockRejectedValueOnce(
        new SearchApiError(0, "network_error", "Unknown outcome."),
      )
      .mockResolvedValueOnce(job("done"));
    searchApi.fetchSearchJob.mockResolvedValue(job("done"));
    render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("pending")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start replacement" }));
    expect(searchApi.createSearchJob).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Abandon pending" }));
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("button", { name: "Start replacement" }));
    expect(await screen.findByText("done")).toBeInTheDocument();

    expect(searchApi.createSearchJob.mock.calls[1]?.[0]).toMatchObject({
      idempotencyKey: "submission-key-2",
      definition: replacementDefinition,
      body: JSON.stringify(replacementDefinition),
    });
  });

  it("stops scheduled polling after a terminal progress error", async () => {
    searchApi.createSearchJob.mockResolvedValue(job("running"));
    searchApi.fetchSearchJob.mockRejectedValue(
      new SearchApiError(410, "search_expired", "Expired."),
    );
    render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("search_expired")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(searchApi.fetchSearchJob).toHaveBeenCalledOnce();
  });
});
