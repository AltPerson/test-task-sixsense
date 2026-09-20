import { describe, expect, it } from "vitest";

import {
  createSessionSearchDefinition,
  endpointIp,
  findUndeclaredFields,
  formatDetailValue,
  isSessionDetail,
  normalizeSessionDetail,
  valueAtPath,
  type SessionDetail,
} from "@/features/session/session-detail";

function session(extra: Record<string, unknown> = {}): SessionDetail {
  return {
    id: "18446744073709551615",
    protocol: "dns",
    decoded: {},
    sensor_id: "sensor-1",
    start: "2025-10-27T08:00:00.000Z",
    end: "2025-10-27T08:00:01.000Z",
    ...extra,
  };
}

describe("session detail contract", () => {
  it("keeps uint64 session IDs as opaque decimal strings", () => {
    const value = session();

    expect(isSessionDetail(value)).toBe(true);
    expect(value.id).toBe("18446744073709551615");
    expect(isSessionDetail({ ...value, id: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(isSessionDetail({ ...value, id: "12/not-valid" })).toBe(false);
  });

  it("suppresses every secondary value inside a redacted object", () => {
    const redacted = {
      redacted: true,
      ip: "192.0.2.99",
      secret: "must-not-leak",
    };

    expect(formatDetailValue(redacted)).toBe("Redacted");
    expect(endpointIp(redacted)).toBeNull();
    expect(
      normalizeSessionDetail(
        session({
          src: redacted,
          decoded: { tls: { secret: redacted } },
          access_token: "server-only",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        src: { redacted: true },
        decoded: { tls: { secret: { redacted: true } } },
      }),
    );
    expect(
      normalizeSessionDetail(session({ access_token: "server-only" })),
    ).not.toHaveProperty("access_token");
  });

  it("finds legacy and unexpected decoded fields without hiding arrays", () => {
    const decoded = {
      dns: {
        query: { name: "example.test" },
        answers: { address: "192.0.2.5", ttl: "60" },
        legacy_flags: ["aa", { redacted: true, secret: "hidden" }],
      },
    };

    expect(valueAtPath(decoded, "dns.query.name")).toBe("example.test");
    expect(findUndeclaredFields(decoded, ["dns.query.name", "dns.answers"]))
      .toEqual([
        {
          path: "dns.legacy_flags",
          value: ["aa", { redacted: true, secret: "hidden" }],
        },
      ]);
    expect(formatDetailValue(decoded.dns.legacy_flags)).toBe("aa, Redacted");
  });

  it("builds a reproducible session window without parsing the ID", () => {
    const definition = createSessionSearchDefinition(session());

    expect(definition).toMatchObject({
      sensorIds: ["sensor-1"],
      sort: "-ts",
      from: "2025-10-27T07:45:00.000Z",
      to: "2025-10-27T08:15:01.000Z",
    });
  });
});
