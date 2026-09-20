import { describe, expect, it } from "vitest";

import type { SearchMetadata } from "@/features/search/model/metadata";
import {
  buildSearchCreate,
  createCaptureAwareSearchDefinition,
  createHostPivotDefinition,
  decodeSearchDefinition,
  encodeSearchDefinition,
  type SearchDefinition,
} from "@/features/search/model/search-definition";

const definition: SearchDefinition = {
  version: 1,
  from: "2025-10-27T08:00:00.000Z",
  to: "2025-10-27T09:00:00.000Z",
  sensorIds: ["sensor-b", "sensor-a"],
  conditions: [
    { field: "dst_port", operator: "between", values: ["80", "443"] },
    { field: "dns.qname", operator: "exists", values: [] },
  ],
  sort: "-ts",
};

const metadata: SearchMetadata = {
  profile: {
    id: "user-1",
    email: "analyst@example.test",
    display_name: "Analyst",
    role: "analyst",
    permissions: [],
    sensor_ids: ["sensor-a", "sensor-b"],
  },
  sensors: [
    { id: "sensor-a", name: "A", site: "HQ", kind: "tap", status: "online" },
    { id: "sensor-b", name: "B", site: "HQ", kind: "tap", status: "online" },
  ],
  fields: [
    {
      name: "dst_port",
      label: "Destination port",
      type: "port",
      operators: ["eq", "between"],
      example: "443",
    },
    {
      name: "dns.qname",
      label: "DNS query",
      type: "string",
      operators: ["eq", "exists"],
      example: "example.test",
    },
  ],
  columns: [],
};

describe("search definition URL codec", () => {
  it("round-trips deterministically without ephemeral job state", () => {
    const encoded = encodeSearchDefinition(definition);
    const decoded = decodeSearchDefinition(encoded);

    expect(encoded).toBe(encodeSearchDefinition(definition));
    expect(encoded).not.toContain("job");
    expect(decoded).toEqual({
      ok: true,
      value: { ...definition, sensorIds: ["sensor-a", "sensor-b"] },
    });
  });

  it("rejects malformed and unsupported versions", () => {
    expect(decodeSearchDefinition("not-json").ok).toBe(false);
    expect(
      decodeSearchDefinition(JSON.stringify({ ...definition, version: 2 })).ok,
    ).toBe(false);
  });
});

describe("default search definition", () => {
  it("anchors historical searches to the newest valid readable capture", () => {
    const captureMetadata: SearchMetadata = {
      ...metadata,
      sensors: [
        { ...metadata.sensors[0], lastPacketAt: "2024-05-20T12:00:00Z" },
        { ...metadata.sensors[1], lastPacketAt: "not-a-timestamp" },
        {
          id: "locked-sensor",
          name: "Locked",
          site: "HQ",
          kind: "tap",
          status: "online",
          lastPacketAt: "2026-09-20T12:00:00Z",
        },
      ],
    };

    expect(
      createCaptureAwareSearchDefinition(
        captureMetadata,
        Date.UTC(2030, 0, 1),
      ),
    ).toMatchObject({
      from: "2024-05-20T11:00:00.000Z",
      to: "2024-05-20T12:00:00.000Z",
    });
  });
});

describe("host pivots", () => {
  it("preserves the search context and adds a metadata-supported IP condition", () => {
    const pivotMetadata: SearchMetadata = {
      ...metadata,
      fields: [
        ...metadata.fields,
        {
          name: "src.ip",
          label: "Source IP",
          type: "ip",
          operators: ["eq", "cidr"],
          example: "192.0.2.1",
        },
      ],
    };

    expect(
      createHostPivotDefinition(
        definition,
        pivotMetadata,
        "src",
        "192.0.2.44",
      ),
    ).toEqual({
      ...definition,
      sensorIds: ["sensor-b", "sensor-a"],
      conditions: [
        ...definition.conditions,
        { field: "src.ip", operator: "eq", values: ["192.0.2.44"] },
      ],
    });
  });

  it("does not invent a pivot when metadata does not support it", () => {
    expect(
      createHostPivotDefinition(definition, metadata, "dst", "192.0.2.44"),
    ).toBeNull();
  });
});

describe("buildSearchCreate", () => {
  it("omits exists values and emits exactly two converted between values", () => {
    expect(buildSearchCreate(definition, metadata)).toEqual({
      ok: true,
      value: {
        sensor_ids: ["sensor-a", "sensor-b"],
        from: definition.from,
        to: definition.to,
        filter: {
          all: [
            {
              field: "dst_port",
              op: "between",
              values: [80, 443],
            },
            { field: "dns.qname", op: "exists" },
          ],
        },
        sort: "-ts",
      },
    });
  });

  it("rejects unreadable sensors and incomplete between values", () => {
    const result = buildSearchCreate(
      {
        ...definition,
        sensorIds: ["locked-sensor"],
        conditions: [
          { field: "dst_port", operator: "between", values: ["80"] },
        ],
      },
      metadata,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        "Sensor locked-sensor is unavailable for this account.",
        "Condition 1 requires exactly two values.",
      ],
    });
  });
});
