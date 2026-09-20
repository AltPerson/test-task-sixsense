import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeSearchDefinition } from "@/features/search/model/search-definition";
import { SearchApiError } from "@/features/search/api/search-api";
import type { SearchJob } from "@/features/search/model/search-job";
import type { SearchMetadata } from "@/features/search/model/metadata";
import { SearchResultsTable } from "@/features/search/ui/search-results-table";

const resultsHook = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/features/search/hooks/use-progressive-search-results", () => ({
  useProgressiveSearchResults: resultsHook,
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 52,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 2) }, (_, index) => ({
        index,
        key: index,
        start: index * 52,
      })),
    measureElement: () => undefined,
  }),
}));

const metadata: SearchMetadata = {
  profile: {
    id: "user-1",
    email: "analyst@example.test",
    display_name: "Analyst",
    role: "analyst",
    permissions: [],
    sensor_ids: ["sensor-1"],
  },
  sensors: [
    {
      id: "sensor-1",
      name: "Sensor",
      site: "HQ",
      kind: "tap",
      status: "online",
    },
  ],
  fields: [
    {
      name: "src.ip",
      label: "Source IP",
      type: "ip",
      operators: ["eq"],
      example: "192.0.2.1",
    },
  ],
  columns: [
    {
      key: "start",
      label: "Start",
      type: "ts",
      defaultVisible: true,
      sortable: true,
      widthHint: 190,
    },
    {
      key: "src",
      label: "Source",
      type: "ip_port",
      defaultVisible: true,
      sortable: false,
      widthHint: 190,
    },
  ],
};

const definition = {
  version: 1 as const,
  from: "2025-10-27T08:00:00.000Z",
  to: "2025-10-27T09:00:00.000Z",
  sensorIds: ["sensor-1"],
  conditions: [],
  sort: "-ts",
};

function job(state: SearchJob["state"]): SearchJob {
  return {
    id: "search-1",
    state,
    sensorIds: ["sensor-1"],
    createdAt: definition.from,
    progress: {
      scannedSessions: 1,
      totalSessionsEstimate: 2,
      matched: 1,
      matchedIsEstimate: state !== "done",
      percent: state === "done" ? 100 : 50,
    },
    warnings: [],
  };
}

const resultState = {
  rows: [
    {
      id: "9007199254740993",
      start: "2025-10-27T08:30:00.000Z",
      src: { ip: "192.0.2.44", port: 443 },
    },
  ],
  requestCursor: null,
  caughtUp: true,
  caughtUpChecks: 1,
  terminalCaughtUpChecks: 0,
  complete: false,
  matchedSoFar: 1,
  malformedItems: 0,
  capped: false,
  error: null,
  isFetching: false,
  isInitialLoading: false,
  terminalTailExhausted: false,
  checkAgain: vi.fn(),
  retry: vi.fn(),
};

describe("SearchResultsTable", () => {
  beforeEach(() => {
    resultsHook.mockReset().mockReturnValue(resultState);
  });

  it("keeps alternate sorting disabled while running and builds a host pivot", () => {
    render(
      <SearchResultsTable
        job={job("running")}
        metadata={metadata}
        searchId="search-1"
        submissionQuery={encodeSearchDefinition(definition)}
      />,
    );

    expect(screen.getByRole("button", { name: /^Start/ })).toBeDisabled();
    const pivot = screen.getByRole("link", { name: "Pivot on source IP" });
    const query = new URL(pivot.getAttribute("href") ?? "", "http://app.test")
      .searchParams.get("q");
    expect(query ? JSON.parse(query) : null).toMatchObject({
      from: definition.from,
      to: definition.to,
      sensorIds: ["sensor-1"],
      conditions: [
        { field: "src.ip", operator: "eq", values: ["192.0.2.44"] },
      ],
    });
    const sessionLink = screen.getByRole("link", { name: /Open session/ });
    expect(sessionLink).toHaveAttribute("target", "_blank");
    const sessionUrl = new URL(sessionLink.getAttribute("href") ?? "", "http://app.test");
    expect(sessionUrl.pathname).toBe("/sessions/9007199254740993");
    expect(sessionUrl.searchParams.get("q")).toBe(encodeSearchDefinition(definition));
    expect(screen.getByText("ID 9007199254740993")).toBeVisible();
  });

  it("enables global server sorting after completion", async () => {
    const view = render(
      <SearchResultsTable
        job={job("running")}
        metadata={metadata}
        searchId="search-1"
        submissionQuery={encodeSearchDefinition(definition)}
      />,
    );
    view.rerender(
      <SearchResultsTable
        job={job("done")}
        metadata={metadata}
        searchId="search-1"
        submissionQuery={encodeSearchDefinition(definition)}
      />,
    );

    const sortButton = screen.getByRole("button", { name: "Start ↓" });
    await waitFor(() => expect(sortButton).toBeEnabled());
    fireEvent.click(sortButton);

    await waitFor(() =>
      expect(resultsHook).toHaveBeenLastCalledWith("search-1", "done", "ts"),
    );
  });

  it("renders a 409 sort conflict as a recoverable error", () => {
    resultsHook.mockReturnValue({
      ...resultState,
      rows: [],
      error: new SearchApiError(
        409,
        "search_running",
        "Alternate sorting requires a finished search.",
      ),
    });

    render(
      <SearchResultsTable
        job={job("running")}
        metadata={metadata}
        searchId="search-1"
        submissionQuery={encodeSearchDefinition(definition)}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Alternate sorting requires a finished search.",
    );
    expect(
      screen.getByRole("button", { name: "Use newest first" }),
    ).toBeVisible();
  });

  it("does not create or leak a pivot for a redacted endpoint", () => {
    resultsHook.mockReturnValue({
      ...resultState,
      rows: [
        {
          id: "9007199254740993",
          start: "2025-10-27T08:30:00.000Z",
          src: { redacted: true, ip: "192.0.2.99", port: 443 },
        },
      ],
    });
    const view = render(
      <SearchResultsTable
        job={job("running")}
        metadata={metadata}
        searchId="search-1"
        submissionQuery={encodeSearchDefinition(definition)}
      />,
    );

    expect(screen.getByText("Redacted")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Pivot on source IP/ })).not.toBeInTheDocument();
    expect(view.container.innerHTML).not.toContain("192.0.2.99");
  });

  it("offers a functional manual check when terminal tail checks are exhausted", () => {
    const checkAgain = vi.fn();
    resultsHook.mockReturnValue({
      ...resultState,
      terminalTailExhausted: true,
      checkAgain,
    });
    render(
      <SearchResultsTable
        job={job("done")}
        metadata={metadata}
        searchId="search-1"
        submissionQuery={encodeSearchDefinition(definition)}
      />,
    );

    expect(screen.getByText("Results may be incomplete.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Check results again" }));
    expect(checkAgain).toHaveBeenCalledTimes(1);
  });
});
