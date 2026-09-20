import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/server/auth/errors";

const mocks = vi.hoisted(() => ({
  getAuthenticatedJson: vi.fn(),
}));

vi.mock("@/server/auth/dependencies", () => ({
  backendClient: { getAuthenticatedJson: mocks.getAuthenticatedJson },
}));
vi.mock("@/server/http/authenticated-route", () => ({
  withAuthenticatedSession: async (
    action: (sid: string) => Promise<Response>,
  ) => {
    try {
      return await action("opaque-sid");
    } catch (error) {
      const appError = error as AppError;
      return Response.json(
        { error: { code: appError.code, message: appError.message } },
        { status: appError.status },
      );
    }
  },
}));

import { GET } from "@/app/api/sessions/[sessionId]/route";

function request(sessionId: string) {
  return GET(new Request(`http://app.test/api/sessions/${sessionId}`), {
    params: Promise.resolve({ sessionId }),
  });
}

describe("session BFF route", () => {
  beforeEach(() => mocks.getAuthenticatedJson.mockReset());

  it("forwards the exact large string ID through the authenticated client", async () => {
    const id = "18446744073709551615";
    mocks.getAuthenticatedJson.mockResolvedValue({
      id,
      protocol: "dns",
      decoded: { dns: { answer: { redacted: true, secret: "hidden" } } },
      access_token: "server-only",
    });

    const response = await request(id);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id,
      decoded: { dns: { answer: { redacted: true } } },
    });
    expect(body).not.toHaveProperty("access_token");
    expect(JSON.stringify(body)).not.toContain("hidden");
    expect(mocks.getAuthenticatedJson).toHaveBeenCalledWith(
      "opaque-sid",
      `/v1/sessions/${id}`,
      expect.any(Function),
    );
  });

  it("returns the documented 404 for a malformed ID without calling backend", async () => {
    const response = await request("12-not-valid");

    expect(response.status).toBe(404);
    expect(mocks.getAuthenticatedJson).not.toHaveBeenCalled();
  });

  it("rejects a mismatched backend session", async () => {
    mocks.getAuthenticatedJson.mockResolvedValue({ id: "2", protocol: "dns", decoded: {} });

    const response = await request("1");

    expect(response.status).toBe(502);
  });
});
