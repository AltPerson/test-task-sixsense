import { NextResponse } from "next/server";

import {
  isColumnList,
  isFieldList,
  isSensorList,
  normalizeColumns,
  normalizeFields,
  normalizeSensors,
} from "@/features/search/model/metadata";
import { backendClient } from "@/server/auth/dependencies";
import { withAuthenticatedSession } from "@/server/http/authenticated-route";

export async function GET() {
  return withAuthenticatedSession(async (sid) => {
    const [profile, sensors, fields, columns] = await Promise.all([
      backendClient.getProfile(sid),
      backendClient.getAuthenticatedJson(sid, "/v1/sensors", isSensorList),
      backendClient.getAuthenticatedJson(
        sid,
        "/v1/meta/fields",
        isFieldList,
      ),
      backendClient.getAuthenticatedJson(
        sid,
        "/v1/meta/columns",
        isColumnList,
      ),
    ]);

    return NextResponse.json({
      profile,
      sensors: normalizeSensors(sensors.items),
      fields: normalizeFields(fields.items),
      columns: normalizeColumns(columns.items),
    });
  });
}
