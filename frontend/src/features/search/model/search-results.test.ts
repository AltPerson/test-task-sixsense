import { describe, expect, it } from "vitest";

import {
  createResultsAccumulator,
  formatResultCell,
  mergeResultsPage,
  normalizeSearchResults,
  resultEndpointIp,
  type SearchResultRow,
  type SearchResultsPage,
} from "@/features/search/model/search-results";

function row(id: string, extra: Record<string, unknown> = {}): SearchResultRow {
  return { id, ...extra };
}

function page(
  items: SearchResultRow[],
  nextCursor: string | null,
  complete: boolean,
): SearchResultsPage {
  return {
    items,
    nextCursor,
    complete,
    matchedSoFar: items.length,
    malformedItems: 0,
  };
}

describe("progressive result accumulator", () => {
  it("rechecks a caught-up tail, deduplicates string IDs, and continues", () => {
    const largeId = "18446744073709551615";
    const first = mergeResultsPage(
      createResultsAccumulator(),
      page([row(largeId)], "cursor-1", false),
      null,
    );
    const caughtUp = mergeResultsPage(
      first,
      page([row(largeId, { summary: "updated" })], null, false),
      "cursor-1",
    );
    const continued = mergeResultsPage(
      caughtUp,
      page(
        [row(largeId, { summary: "updated" }), row("9007199254740993")],
        "cursor-2",
        false,
      ),
      "cursor-1",
    );
    const complete = mergeResultsPage(
      continued,
      page([row("42")], null, true),
      "cursor-2",
    );

    expect(first.requestCursor).toBe("cursor-1");
    expect(caughtUp).toMatchObject({
      requestCursor: "cursor-1",
      caughtUp: true,
      caughtUpChecks: 1,
    });
    expect(continued.rows.map((item) => item.id)).toEqual([
      largeId,
      "9007199254740993",
    ]);
    expect(continued.rows[0]?.summary).toBe("updated");
    expect(continued.requestCursor).toBe("cursor-2");
    expect(continued.caughtUp).toBe(false);
    expect(complete.complete).toBe(true);
    expect(complete.rows.map((item) => item.id)).toEqual([
      largeId,
      "9007199254740993",
      "42",
    ]);
  });

  it("bounds retained rows without converting or reordering their IDs", () => {
    const accumulated = mergeResultsPage(
      createResultsAccumulator(),
      page([row("9007199254740993"), row("2")], null, false),
      null,
      1,
    );

    expect(accumulated.rows.map((item) => item.id)).toEqual([
      "9007199254740993",
    ]);
    expect(accumulated.capped).toBe(true);
  });
});

describe("result normalization and formatting", () => {
  it("skips rows without string IDs and reports malformed input", () => {
    expect(
      normalizeSearchResults({
        items: [{ id: "9007199254740993" }, { id: 4 }, null],
        next_cursor: null,
        complete: true,
        matched_so_far: 3,
      }),
    ).toMatchObject({
      items: [{ id: "9007199254740993" }],
      malformedItems: 2,
    });
  });

  it("renders redacted, nullable, legacy, and unknown values safely", () => {
    const result = row("1", {
      src: { redacted: true },
      summary: null,
      legacy: ["one", { nested: true }],
    });

    expect(formatResultCell(result, "src", "ip_port")).toBe("Redacted");
    expect(formatResultCell(result, "summary", "text")).toBe("—");
    expect(formatResultCell(result, "legacy", "future_type")).toBe(
      '["one",{"nested":true}]',
    );
  });

  it("never exposes an IP from a redacted endpoint", () => {
    const result = row("1", {
      src: { redacted: true, ip: "192.0.2.99", port: 443 },
      dst: { ip: "198.51.100.8" },
    });

    expect(formatResultCell(result, "src", "ip_port")).toBe("Redacted");
    expect(resultEndpointIp(result, "src")).toBeNull();
    expect(resultEndpointIp(result, "dst")).toBe("198.51.100.8");
  });
});
