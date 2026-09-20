import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeSearchDefinition } from "@/features/search/model/search-definition";
import { SessionApiError } from "@/features/session/api/session-api";
import { SessionInspector } from "@/features/session/ui/session-inspector";
import type { ProtocolSchema, SessionDetail } from "@/features/session/model/session-detail";

const api = vi.hoisted(() => ({
  fetchProtocolSchema: vi.fn(),
  fetchSearchMetadata: vi.fn(),
  fetchSessionDetail: vi.fn(),
}));

vi.mock("@/features/session/api/session-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/session/api/session-api")>();
  return { ...actual, fetchProtocolSchema: api.fetchProtocolSchema, fetchSessionDetail: api.fetchSessionDetail };
});
vi.mock("@/features/search/api/search-api", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/search/api/search-api")
  >();
  return { ...actual, fetchSearchMetadata: api.fetchSearchMetadata };
});

const metadata = {
  profile: {
    id: "user-1",
    email: "analyst@example.test",
    display_name: "Analyst",
    role: "analyst" as const,
    permissions: [],
    sensor_ids: ["sensor-1"],
  },
  sensors: [{ id: "sensor-1", name: "Sensor", site: "HQ", kind: "tap", status: "online" }],
  fields: [
    { name: "src.ip", label: "Source IP", type: "ip", operators: ["eq"], example: "192.0.2.1" },
    { name: "dst.ip", label: "Destination IP", type: "ip", operators: ["eq"], example: "192.0.2.2" },
  ],
  columns: [],
};

const tlsSchema: ProtocolSchema = {
  protocol: "tls",
  decoder_versions: ["1", "2"],
  fields: [
    { path: "tls.version", title: "TLS version", type: "string" },
    { path: "tls.secret", title: "Secret", type: "string", sensitive: true },
    { path: "tls.missing", title: "Missing field", type: "string" },
  ],
};

function makeSession(id = "18446744073709551615", extra: Record<string, unknown> = {}): SessionDetail {
  return {
    id,
    protocol: "tls",
    decoded: {
      tls: {
        version: "1.3",
        secret: { redacted: true, value: "must-not-leak" },
        ja4: ["legacy", { nested: true }],
      },
    },
    sensor_id: "sensor-1",
    start: "2025-10-27T08:00:00.000Z",
    end: "2025-10-27T08:00:01.000Z",
    duration_ms: 1000,
    transport: "tcp",
    src: { ip: "192.0.2.10", port: 51000, host: "client.example" },
    dst: { redacted: true, ip: "198.51.100.9", port: 443 },
    bytes: { up: 10, down: 20 },
    packets: { up: "2", down: "3" },
    risk: { score: 42, band: "medium", reasons: [] },
    summary: "TLS session",
    decoder: "tls/2",
    detections: [],
    files: [],
    pcap: { available: false, reason: "expired" },
    ...extra,
  };
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children, client }: { children: ReactNode; client: QueryClient }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderInspector(sessionId = "18446744073709551615", contextQuery: string | null = null, client = queryClient()) {
  return {
    client,
    ...render(
      <SessionInspector contextQuery={contextQuery} sessionId={sessionId} />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    ),
  };
}

describe("SessionInspector", () => {
  beforeEach(() => {
    api.fetchSessionDetail.mockReset().mockResolvedValue(makeSession());
    api.fetchProtocolSchema.mockReset().mockResolvedValue(tlsSchema);
    api.fetchSearchMetadata.mockReset().mockResolvedValue(metadata);
  });

  afterEach(() => vi.useRealTimers());

  it("recovers from one truncated session response within the retry budget", async () => {
    api.fetchSessionDetail
      .mockRejectedValueOnce(
        new SessionApiError(
          502,
          "invalid_response",
          "Incomplete response",
          0,
        ),
      )
      .mockResolvedValueOnce(makeSession());
    renderInspector();

    expect(
      await screen.findByRole("heading", { name: "TLS decoded fields" }),
    ).toBeVisible();
    expect(api.fetchSessionDetail).toHaveBeenCalledTimes(2);
  });

  it("shows loading and then renders safe generic, missing, redacted, and undeclared values", async () => {
    let resolveSession: ((value: SessionDetail) => void) | undefined;
    api.fetchSessionDetail.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    renderInspector();

    expect(screen.getByRole("status")).toHaveTextContent("Loading session details");
    resolveSession?.(makeSession());

    expect(await screen.findByRole("heading", { name: "TLS decoded fields" })).toBeVisible();
    expect(screen.getByText("18446744073709551615", { exact: false })).toBeVisible();
    expect(screen.getByText("Redacted")).toBeVisible();
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Undeclared fields" })).toBeVisible();
    expect(screen.getByText("tls.ja4")).toBeVisible();
    expect(screen.getByText("legacy, nested: Yes")).toBeVisible();
    expect(document.body.textContent).not.toContain("must-not-leak");
    expect(document.body.textContent).not.toContain("198.51.100.9");
    expect(screen.getByRole("link", { name: "Search around source IP" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Search around destination IP" })).not.toBeInTheDocument();
  });

  it("renders DNS canonical arrays and legacy collapsed/string values", async () => {
    api.fetchSessionDetail.mockResolvedValue(makeSession("9007199254740993", {
      protocol: "dns",
      decoder: "dns/1",
      decoded: {
        dns: {
          query: { name: "example.test", type: "A" },
          answers: { address: "192.0.2.4", ttl: "60" },
          flags: ["aa", "rd"],
        },
      },
    }));
    api.fetchProtocolSchema.mockResolvedValue({
      protocol: "dns",
      decoder_versions: ["1", "2"],
      fields: [
        { path: "dns.query", title: "Query", type: "object" },
        { path: "dns.answers", title: "Answers", type: "array" },
        { path: "dns.flags", title: "Flags", type: "array" },
      ],
    });
    renderInspector("9007199254740993");

    expect(await screen.findByRole("heading", { name: "DNS transaction" })).toBeVisible();
    expect(screen.getByText("name: example.test · type: A")).toBeVisible();
    expect(screen.getByText("address: 192.0.2.4 · ttl: 60")).toBeVisible();
    expect(screen.getByText("aa, rd")).toBeVisible();
  });

  it.each([
    [401, "Your application session ended"],
    [403, "not allowed to read"],
    [404, "malformed, unavailable"],
    [410, "no longer retained"],
  ])("renders an actionable %s state", async (status, guidance) => {
    api.fetchSessionDetail.mockRejectedValue(new SessionApiError(status, "failure", `Failure ${status}`));
    renderInspector();

    expect(await screen.findByRole("alert")).toHaveTextContent(`Failure ${status}`);
    expect(screen.getByRole("alert")).toHaveTextContent(guidance);
  });

  it("rejects a malformed ID without fetching", () => {
    renderInspector("not-a-decimal-id");

    expect(screen.getByRole("alert")).toHaveTextContent("Session was not found");
    expect(api.fetchSessionDetail).not.toHaveBeenCalled();
  });

  it("preserves validated search context in navigation without a job ID", async () => {
    const definition = {
      version: 1 as const,
      from: "2025-10-27T07:00:00.000Z",
      to: "2025-10-27T09:00:00.000Z",
      sensorIds: ["sensor-1"],
      conditions: [],
      sort: "-ts",
    };
    renderInspector(undefined, encodeSearchDefinition(definition));

    const back = await screen.findByRole("link", { name: /Back to search definition/ });
    const href = new URL(back.getAttribute("href") ?? "", "http://app.test");
    expect(href.searchParams.get("q")).toBe(encodeSearchDefinition(definition));
    expect(href.href).not.toContain("searchId");
    expect(href.href).not.toContain("srch_");
  });

  it("does not mix a late response into a replacement session", async () => {
    let resolveOld: ((value: SessionDetail) => void) | undefined;
    api.fetchSessionDetail.mockImplementation((id: string) => {
      if (id === "1") return new Promise<SessionDetail>((resolve) => { resolveOld = resolve; });
      return Promise.resolve(makeSession("2", { summary: "New session" }));
    });
    const view = renderInspector("1");
    view.rerender(<SessionInspector contextQuery={null} sessionId="2" />);

    expect(await screen.findByText("New session")).toBeVisible();
    resolveOld?.(makeSession("1", { summary: "Stale session" }));
    await act(async () => undefined);
    expect(screen.queryByText("Stale session")).not.toBeInTheDocument();
    expect(screen.getByText("New session")).toBeVisible();
  });

  it("does not retain session details after account-scoped cache clearing", async () => {
    const client = queryClient();
    api.fetchSessionDetail
      .mockResolvedValueOnce(makeSession("1", { summary: "First account" }))
      .mockResolvedValueOnce(makeSession("1", { summary: "Second account" }));
    const first = renderInspector("1", null, client);
    expect(await screen.findByText("First account")).toBeVisible();
    first.unmount();
    client.clear();

    renderInspector("1", null, client);
    expect(await screen.findByText("Second account")).toBeVisible();
    expect(api.fetchSessionDetail).toHaveBeenCalledTimes(2);
  });

  it("shows a recoverable protocol-schema error", async () => {
    api.fetchProtocolSchema.mockRejectedValue(new SessionApiError(400, "unavailable", "Unavailable"));
    renderInspector();

    expect(await screen.findByRole("alert")).toHaveTextContent("Protocol schema unavailable");
    expect(screen.getByRole("button", { name: "Retry schema" })).toBeVisible();
  });
});
