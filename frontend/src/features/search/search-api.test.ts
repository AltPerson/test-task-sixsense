import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSearchJob,
  createSearchSubmission,
  fetchEnumCatalog,
  fetchSearchResults,
  releaseSearchJob,
  SearchApiError,
  searchPollRetryDelay,
  shouldRetrySearchPoll,
} from "@/features/search/search-api";

const searchDefinition = {
  sensor_ids: ["sensor-1"],
  from: "2026-01-01T10:00:00.000Z",
  to: "2026-01-01T11:00:00.000Z",
  filter: { all: [] },
  sort: "-ts" as const,
};

function searchResponse(state: "queued" | "running" | "done" = "queued") {
  return Response.json(
    {
      id: "search-1",
      state,
      sensorIds: ["sensor-1"],
      createdAt: "2026-01-01T10:00:00.000Z",
      progress: {
        scannedSessions: state === "done" ? 10 : 0,
        totalSessionsEstimate: 10,
        matched: state === "done" ? 2 : 0,
        matchedIsEstimate: state !== "done",
        percent: state === "done" ? 100 : 0,
      },
      warnings: [],
    },
    { status: 202 },
  );
}

describe("fetchEnumCatalog", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for Retry-After and retries catalog warming exactly once", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "catalog_warming",
              message: "Catalog is warming.",
              retry_after_seconds: 2,
            },
          },
          { status: 503, headers: { "retry-after": "2" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          name: "country",
          values: [{ value: "US", label: "United States" }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchEnumCatalog("country");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toEqual({
      name: "country",
      values: [{ value: "US", label: "United States" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces an unavailable catalog after the bounded retry", async () => {
    vi.useFakeTimers();
    const warmingResponse = () =>
      Response.json(
        {
          error: {
            code: "catalog_warming",
            message: "Catalog is warming.",
            retry_after_seconds: 2,
          },
        },
        { status: 503, headers: { "retry-after": "2" } },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(warmingResponse())
      .mockResolvedValueOnce(warmingResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchEnumCatalog("country");
    const rejection = expect(request).rejects.toMatchObject({
      status: 503,
      code: "catalog_warming",
    });
    await vi.advanceTimersByTimeAsync(2_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])("does not retry HTTP %s", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { error: { code: "denied", message: "Denied." } },
        { status },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEnumCatalog("country")).rejects.toMatchObject({
      status,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("search job requests", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reuses one idempotency key after a post-commit 503", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "temporarily_unavailable",
              message: "Retry the committed request.",
              retry_after_seconds: 2,
            },
          },
          { status: 503, headers: { "retry-after": "2" } },
        ),
      )
      .mockResolvedValueOnce(searchResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createSearchJob(
        createSearchSubmission(searchDefinition, "submission-key-0001"),
        { sleep },
      ),
    ).resolves.toMatchObject({ id: "search-1", state: "queued" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
    for (const [, init] of fetchMock.mock.calls as Array<
      [string, RequestInit]
    >) {
      expect(new Headers(init.headers).get("idempotency-key")).toBe(
        "submission-key-0001",
      );
      expect(init.body).toBe(JSON.stringify(searchDefinition));
    }
  });

  it("reuses the key after an ambiguous network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection dropped"))
      .mockResolvedValueOnce(searchResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createSearchJob(
        createSearchSubmission(searchDefinition, "submission-key-0002"),
        { sleep: async () => undefined },
      ),
    ).resolves.toMatchObject({ id: "search-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map(([, init]) =>
        new Headers((init as RequestInit).headers).get("idempotency-key"),
      ),
    ).toEqual(["submission-key-0002", "submission-key-0002"]);
  });

  it("reuses the exact submission after two ambiguous failures and a manual retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection dropped"))
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "busy", message: "Outcome unknown." } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(searchResponse());
    vi.stubGlobal("fetch", fetchMock);
    const submission = createSearchSubmission(
      searchDefinition,
      "submission-key-manual-recovery",
    );

    await expect(
      createSearchJob(submission, { sleep: async () => undefined }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      createSearchJob(submission, { sleep: async () => undefined }),
    ).resolves.toMatchObject({ id: "search-1" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls as Array<
      [string, RequestInit]
    >) {
      expect(new Headers(init.headers).get("idempotency-key")).toBe(
        submission.idempotencyKey,
      );
      expect(init.body).toBe(submission.body);
    }
  });

  it("bounds a timed-out create to one safe retry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      )
      .mockResolvedValueOnce(searchResponse());
    vi.stubGlobal("fetch", fetchMock);

    const request = createSearchJob(
      createSearchSubmission(searchDefinition, "submission-key-0003"),
      { timeoutMs: 100, sleep: async () => undefined },
    );
    await vi.advanceTimersByTimeAsync(100);

    await expect(request).resolves.toMatchObject({ id: "search-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([403, 422, 429])("does not retry create HTTP %s", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { error: { code: "rejected", message: "Rejected." } },
        { status },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createSearchJob(
        createSearchSubmission(searchDefinition, "submission-key-0004"),
      ),
    ).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries idempotent cleanup once after a transient failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "busy", message: "Busy." } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      releaseSearchJob("search-1", { sleep: async () => undefined }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds polling retries and respects Retry-After", () => {
    const transient = new SearchApiError(503, "busy", "Busy.", 3);
    const rateLimited = new SearchApiError(429, "rate_limited", "Slow down.", 2);
    const expired = new SearchApiError(410, "search_expired", "Expired.");

    expect(shouldRetrySearchPoll(0, transient)).toBe(true);
    expect(shouldRetrySearchPoll(1, transient)).toBe(true);
    expect(shouldRetrySearchPoll(2, transient)).toBe(false);
    expect(shouldRetrySearchPoll(0, rateLimited)).toBe(true);
    expect(shouldRetrySearchPoll(0, expired)).toBe(false);
    expect(searchPollRetryDelay(0, transient)).toBe(3_000);
    expect(searchPollRetryDelay(0, rateLimited)).toBe(2_000);
    expect(searchPollRetryDelay(2, new Error("unknown"))).toBe(4_000);
  });

  it("surfaces a running-search sort conflict instead of returning empty results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "search_running",
            message: "Alternate sorting requires a finished search.",
          },
        },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSearchResults("search-1", null, "-risk"),
    ).rejects.toMatchObject({ status: 409, code: "search_running" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
