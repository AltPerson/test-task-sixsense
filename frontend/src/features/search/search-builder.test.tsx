import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SearchBuilder } from "@/features/search/search-builder";
import {
  encodeSearchDefinition,
  toDateTimeLocal,
  type SearchDefinition,
} from "@/features/search/search-definition";

const navigation = vi.hoisted(() => ({
  query: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

const metadata = {
  profile: {
    id: "user-1",
    email: "analyst@example.test",
    display_name: "Analyst",
    role: "analyst",
    permissions: ["search"],
    sensor_ids: ["sensor-readable"],
  },
  sensors: [
    {
      id: "sensor-readable",
      name: "Readable sensor",
      site: "North",
      kind: "packet",
      status: "online",
    },
    {
      id: "sensor-locked",
      name: "Locked sensor",
      site: "South",
      kind: "packet",
      status: "online",
    },
  ],
  fields: [
    {
      name: "src.ip",
      label: "Source IP",
      type: "ip",
      operators: ["eq", "exists"],
      example: "192.0.2.1",
    },
    {
      name: "dst.port",
      label: "Destination port",
      type: "port",
      operators: ["eq", "between"],
      example: "443",
    },
    {
      name: "country",
      label: "Country",
      type: "enum",
      operators: ["eq", "in"],
      enumName: "country",
      example: "US",
    },
  ],
  columns: [
    {
      key: "ts",
      label: "Timestamp",
      type: "datetime",
      defaultVisible: true,
      sortable: true,
      widthHint: 180,
    },
  ],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockMetadataRequests() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/search/enums/country")) {
        return Promise.resolve(
          Response.json({
            name: "country",
            values: [
              { value: "DE", label: "Germany" },
              { value: "US", label: "United States" },
            ],
          }),
        );
      }

      return Promise.resolve(Response.json(metadata));
    }),
  );
}

describe("SearchBuilder", () => {
  beforeEach(() => {
    navigation.query = "";
    navigation.push.mockReset();
    vi.unstubAllGlobals();
    mockMetadataRequests();
  });

  it("shows every sensor while keeping unreadable sensors locked", async () => {
    render(<SearchBuilder />, { wrapper });

    expect(await screen.findByText("Readable sensor")).toBeInTheDocument();
    expect(screen.getByText("Locked sensor")).toBeInTheDocument();
    expect(screen.getByLabelText(/Readable sensor/)).toBeChecked();
    expect(screen.getByLabelText(/Locked sensor/)).toBeDisabled();
    expect(screen.getByText(/South · packet · online · Locked/)).toBeVisible();
  });

  it("uses field operators and enum values supplied by metadata", async () => {
    render(<SearchBuilder />, { wrapper });
    await screen.findByText("Readable sensor");
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));

    fireEvent.change(screen.getByLabelText("Field"), {
      target: { value: "dst.port" },
    });
    fireEvent.change(screen.getByLabelText("Operator"), {
      target: { value: "between" },
    });
    expect(screen.getByLabelText("Minimum value")).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText("Maximum value")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Field"), {
      target: { value: "src.ip" },
    });
    fireEvent.change(screen.getByLabelText("Operator"), {
      target: { value: "exists" },
    });
    expect(screen.queryByLabelText("Value")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Field"), {
      target: { value: "country" },
    });
    expect(
      await screen.findByRole("option", { name: "United States" }),
    ).toHaveValue("US");
  });

  it("blocks invalid local state instead of changing the URL", async () => {
    render(<SearchBuilder />, { wrapper });
    const sensor = await screen.findByLabelText(/Readable sensor/);
    fireEvent.click(sensor);
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare search link" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Select at least one readable sensor.",
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("reconstructs a shared definition and emits a versioned URL", async () => {
    const shared: SearchDefinition = {
      version: 1,
      from: "2026-01-01T10:00:00.000Z",
      to: "2026-01-01T11:00:00.000Z",
      sensorIds: ["sensor-readable"],
      conditions: [
        { field: "dst.port", operator: "between", values: ["80", "443"] },
      ],
      sort: "bytes",
    };
    navigation.query = new URLSearchParams({
      q: encodeSearchDefinition(shared),
    }).toString();
    render(<SearchBuilder />, { wrapper });

    expect(await screen.findByDisplayValue("80")).toBeInTheDocument();
    expect(screen.getByDisplayValue("443")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Smallest first")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveValue(
      toDateTimeLocal(shared.from),
    );
    expect(screen.getByLabelText("To")).toHaveValue(
      toDateTimeLocal(shared.to),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Prepare search link" }),
    );
    await waitFor(() => expect(navigation.push).toHaveBeenCalledOnce());
    const [url] = navigation.push.mock.calls[0] as [string];
    expect(url).toContain("?q=");
    expect(decodeURIComponent(url)).toContain('"version":1');
    expect(url).not.toContain("job");
  });

  it("restores URL state on navigation without resetting ordinary edits", async () => {
    const first: SearchDefinition = {
      version: 1,
      from: "2026-01-01T10:00:00.000Z",
      to: "2026-01-01T11:00:00.000Z",
      sensorIds: ["sensor-readable"],
      conditions: [
        { field: "dst.port", operator: "between", values: ["80", "443"] },
      ],
      sort: "-ts",
    };
    const second: SearchDefinition = {
      ...first,
      conditions: [
        { field: "src.ip", operator: "eq", values: ["192.0.2.50"] },
      ],
      sort: "risk",
    };
    navigation.query = new URLSearchParams({
      q: encodeSearchDefinition(first),
    }).toString();
    const view = render(<SearchBuilder />, { wrapper });

    const minimum = await screen.findByDisplayValue("80");
    fireEvent.change(minimum, { target: { value: "81" } });
    view.rerender(<SearchBuilder />);
    expect(screen.getByDisplayValue("81")).toBeInTheDocument();

    navigation.query = new URLSearchParams({
      q: encodeSearchDefinition(second),
    }).toString();
    view.rerender(<SearchBuilder />);
    expect(
      await screen.findByDisplayValue("192.0.2.50"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lowest risk first")).toBeInTheDocument();

    navigation.query = new URLSearchParams({
      q: encodeSearchDefinition(first),
    }).toString();
    view.rerender(<SearchBuilder />);
    expect(await screen.findByDisplayValue("80")).toBeInTheDocument();
  });

  it("invalidates a prepared link after the form changes", async () => {
    const view = render(<SearchBuilder />, { wrapper });
    await screen.findByText("Readable sensor");
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare search link" }),
    );
    await waitFor(() => expect(navigation.push).toHaveBeenCalledOnce());
    const [url] = navigation.push.mock.calls[0] as [string];
    navigation.query = url.split("?")[1] ?? "";
    view.rerender(<SearchBuilder />);
    expect(
      await screen.findByRole("button", { name: "Copy search link" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sort order"), {
      target: { value: "ts" },
    });
    expect(
      screen.queryByRole("button", { name: "Copy search link" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Search definition ready")).not.toBeInTheDocument();
  });
});
