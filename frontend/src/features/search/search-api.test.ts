import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchEnumCatalog } from "@/features/search/search-api";

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
