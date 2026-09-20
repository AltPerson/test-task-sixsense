import { NextResponse } from "next/server";

import { isProtocolSchema } from "@/features/session/session-detail";
import { AppError } from "@/server/auth/errors";
import { backendClient } from "@/server/auth/dependencies";
import { withAuthenticatedSession } from "@/server/http/authenticated-route";

const PROTOCOL_PATTERN = /^[a-z0-9_-]{1,64}$/i;

type ProtocolSchemaRouteContext = {
  params: Promise<{ protocol: string }>;
};

export async function GET(
  _request: Request,
  context: ProtocolSchemaRouteContext,
) {
  return withAuthenticatedSession(async (sid) => {
    const { protocol } = await context.params;
    if (!PROTOCOL_PATTERN.test(protocol)) {
      throw new AppError(
        400,
        "invalid_protocol",
        "The protocol name is invalid.",
      );
    }

    const schema = await backendClient.getAuthenticatedJson(
      sid,
      `/v1/meta/schema/${encodeURIComponent(protocol)}`,
      isProtocolSchema,
    );
    if (schema.protocol.toLowerCase() !== protocol.toLowerCase()) {
      throw new AppError(
        502,
        "invalid_backend_response",
        "The backend returned an unexpected protocol schema.",
      );
    }
    return NextResponse.json(schema);
  });
}
