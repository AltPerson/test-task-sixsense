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

import { GET } from "@/app/api/session-schema/[protocol]/route";

function request(protocol: string) {
  return GET(new Request(`http://app.test/api/session-schema/${protocol}`), {
    params: Promise.resolve({ protocol }),
  });
}

describe("protocol schema BFF route", () => {
  beforeEach(() => mocks.getAuthenticatedJson.mockReset());

  it("retrieves the authenticated public schema", async () => {
    mocks.getAuthenticatedJson.mockResolvedValue({
      protocol: "smb2",
      decoder_versions: ["1", "2"],
      fields: [],
    });

    const response = await request("smb2");

    expect(response.status).toBe(200);
    expect(mocks.getAuthenticatedJson).toHaveBeenCalledWith(
      "opaque-sid",
      "/v1/meta/schema/smb2",
      expect.any(Function),
    );
  });

  it("rejects malformed protocol names locally", async () => {
    const response = await request("tls%2Fprivate");

    expect(response.status).toBe(400);
    expect(mocks.getAuthenticatedJson).not.toHaveBeenCalled();
  });

  it("rejects a mismatched backend schema", async () => {
    mocks.getAuthenticatedJson.mockResolvedValue({
      protocol: "dns",
      decoder_versions: ["2"],
      fields: [],
    });

    const response = await request("tls");

    expect(response.status).toBe(502);
  });
});
