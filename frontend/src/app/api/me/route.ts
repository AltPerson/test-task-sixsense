import { NextResponse } from "next/server";

import { backendClient } from "@/server/auth/dependencies";
import { withAuthenticatedSession } from "@/server/http/authenticated-route";

export async function GET() {
  return withAuthenticatedSession(async (sid) => {
    const profile = await backendClient.getProfile(sid);
    return NextResponse.json({ user: profile });
  });
}
