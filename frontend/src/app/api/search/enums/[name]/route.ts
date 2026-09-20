import { NextResponse } from "next/server";

import { isEnumCatalog } from "@/features/search/model/metadata";
import { backendClient } from "@/server/auth/dependencies";
import { withAuthenticatedSession } from "@/server/http/authenticated-route";

type EnumRouteContext = {
  params: Promise<{ name: string }>;
};

export async function GET(_request: Request, context: EnumRouteContext) {
  return withAuthenticatedSession(async (sid) => {
    const { name } = await context.params;
    const catalog = await backendClient.getAuthenticatedJson(
      sid,
      `/v1/meta/enums/${encodeURIComponent(name)}`,
      isEnumCatalog,
    );
    return NextResponse.json(catalog);
  });
}
