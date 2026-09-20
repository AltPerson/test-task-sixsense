import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchProtocolSchema,
  fetchSessionDetail,
  SessionApiError,
} from "@/features/session/session-api";

const session = {
  id: "18446744073709551615",
  protocol: "tls",
  decoded: { tls: { version: "1.3" } },
};

describe("session browser API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests a large string ID without numeric conversion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSessionDetail(session.id)).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessions/${session.id}`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("rejects malformed IDs before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSessionDetail("12/not-valid")).rejects.toMatchObject({
      status: 404,
      code: "session_not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 410])("preserves a %s session error", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: `status_${status}`, message: `Failure ${status}` } }),
          { status, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(fetchSessionDetail(session.id)).rejects.toEqual(
      expect.objectContaining<Partial<SessionApiError>>({
        status,
        code: `status_${status}`,
        message: `Failure ${status}`,
      }),
    );
  });

  it("validates the server-provided protocol schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ protocol: "tls", decoder_versions: ["2"], fields: "bad" }), {
          status: 200,
        }),
      ),
    );

    await expect(fetchProtocolSchema("tls")).rejects.toMatchObject({
      status: 502,
      code: "invalid_response",
    });
  });
});
