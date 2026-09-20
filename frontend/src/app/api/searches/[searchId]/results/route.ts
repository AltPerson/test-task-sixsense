import { NextResponse } from "next/server";

import {
  isSearchResultsWire,
  normalizeSearchResults,
} from "@/features/search/search-results";
import { SUPPORTED_SORTS } from "@/features/search/search-definition";
import { AppError } from "@/server/auth/errors";
import { backendClient } from "@/server/auth/dependencies";
import { withAuthenticatedSession } from "@/server/http/authenticated-route";

type ResultsRouteContext = {
  params: Promise<{ searchId: string }>;
};

export async function GET(request: Request, context: ResultsRouteContext) {
  return withAuthenticatedSession(async (sid) => {
    const { searchId } = await context.params;
    const incoming = new URL(request.url).searchParams;
    const cursor = incoming.get("cursor");
    const sort = incoming.get("sort");

    if (cursor !== null && (cursor.length === 0 || cursor.length > 4_096)) {
      throw new AppError(400, "invalid_cursor", "The result cursor is invalid.");
    }

    if (sort !== null && !SUPPORTED_SORTS.some((value) => value === sort)) {
      throw new AppError(400, "invalid_sort", "The result sort is invalid.");
    }

    const parameters = new URLSearchParams({ limit: "200" });
    if (cursor !== null) {
      parameters.set("cursor", cursor);
    }
    if (sort !== null) {
      parameters.set("sort", sort);
    }

    const page = await backendClient.getAuthenticatedJson(
      sid,
      `/v1/searches/${encodeURIComponent(searchId)}/results?${parameters.toString()}`,
      isSearchResultsWire,
    );

    return NextResponse.json(normalizeSearchResults(page));
  });
}
