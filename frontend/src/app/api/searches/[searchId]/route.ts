import { NextResponse } from "next/server";

import {
  isSearchJobWire,
  normalizeSearchJob,
} from "@/features/search/model/search-job";
import { backendClient } from "@/server/auth/dependencies";
import { withAuthenticatedSession } from "@/server/http/authenticated-route";

type SearchRouteContext = {
  params: Promise<{ searchId: string }>;
};

export async function GET(_request: Request, context: SearchRouteContext) {
  return withAuthenticatedSession(async (sid) => {
    const { searchId } = await context.params;
    const search = await backendClient.getAuthenticatedJson(
      sid,
      `/v1/searches/${encodeURIComponent(searchId)}`,
      isSearchJobWire,
    );
    return NextResponse.json(normalizeSearchJob(search));
  });
}

export async function DELETE(_request: Request, context: SearchRouteContext) {
  return withAuthenticatedSession(async (sid) => {
    const { searchId } = await context.params;
    await backendClient.requestAuthenticated(
      sid,
      `/v1/searches/${encodeURIComponent(searchId)}`,
      { method: "DELETE" },
    );
    return new NextResponse(null, { status: 204 });
  });
}
