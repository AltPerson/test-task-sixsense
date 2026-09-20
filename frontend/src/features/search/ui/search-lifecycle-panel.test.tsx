import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchApiError } from "@/features/search/api/search-api";
import { SearchLifecyclePanel } from "@/features/search/ui/search-lifecycle-panel";
import type { SearchJob } from "@/features/search/model/search-job";

const failedJob: SearchJob = {
  id: "search-1",
  state: "failed",
  sensorIds: ["sensor-1"],
  createdAt: "2026-01-01T10:00:00.000Z",
  progress: {
    scannedSessions: 5,
    totalSessionsEstimate: 10,
    matched: 1,
    matchedIsEstimate: true,
    percent: 50,
  },
  warnings: [
    {
      code: "sensor_lagging",
      sensorId: "sensor-1",
      detail: "Packets may still arrive.",
    },
  ],
};

const baseProps = {
  phase: "active" as const,
  job: failedJob,
  createError: null,
  releaseError: null,
  progressError: null,
  isPolling: false,
  hasActiveSearch: true,
  hasPendingSubmission: false,
  onAbandonPending: vi.fn(),
  onRelease: vi.fn(),
  onRetryPending: vi.fn(),
  onRetryProgress: vi.fn(),
};

describe("SearchLifecyclePanel", () => {
  it("renders a terminal failed state and capture warnings", () => {
    render(<SearchLifecyclePanel {...baseProps} />);

    expect(screen.getByRole("heading", { name: "Failed" })).toBeVisible();
    expect(screen.getByText(/Sensor lagging/)).toBeVisible();
    expect(screen.getByText("Packets may still arrive.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cancel and release search slot" }),
    ).toBeVisible();
    expect(screen.queryByText("Updating")).not.toBeInTheDocument();
  });

  it("explains expiry and offers an explicit clear-to-rerun path", () => {
    render(
      <SearchLifecyclePanel
        {...baseProps}
        progressError={
          new SearchApiError(410, "search_expired", "The search expired.")
        }
      />,
    );

    expect(screen.getByText(/definition preserved in this URL/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Clear expired search" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Retry progress check" }),
    ).not.toBeInTheDocument();
  });

  it("turns a max-active-search response into actionable guidance", () => {
    render(
      <SearchLifecyclePanel
        {...baseProps}
        createError={
          new SearchApiError(429, "too_many_searches", "Search limit reached.")
        }
        hasActiveSearch={false}
        job={null}
        phase="idle"
      />,
    );

    expect(screen.getByText(/three retained searches/)).toBeVisible();
  });

  it("offers explicit recovery choices for an unresolved submission", () => {
    render(
      <SearchLifecyclePanel
        {...baseProps}
        createError={
          new SearchApiError(503, "temporarily_unavailable", "Outcome unknown.")
        }
        hasActiveSearch={false}
        hasPendingSubmission
        job={null}
        phase="idle"
      />,
    );

    expect(screen.getByText(/exact original body/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry unresolved submission" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Abandon unresolved submission" }),
    ).toBeVisible();
  });
});
