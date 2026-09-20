import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  getSessionId,
} from "@/server/auth/cookie";
import { backendClient, sessionStore } from "@/server/auth/dependencies";
import { errorResponse } from "@/server/http/errors";

export async function POST() {
  const sid = await getSessionId();
  let response: NextResponse;

  try {
    if (sid) {
      await backendClient.logout(sid);
    }

    response = new NextResponse(null, { status: 204 });
  } catch (error) {
    response = errorResponse(error);
  } finally {
    // A resolved BFF response always means the local session was cleared, even
    // when upstream revocation failed and the response itself is an error.
    if (sid) {
      await sessionStore.delete(sid);
    }
  }

  clearSessionCookie(response);
  return response;
}
