import type { components } from "@/generated/api";
import { isRecord, isStringArray } from "@/lib/validation";

export type UserProfile = components["schemas"]["Profile"];

export function isUserProfile(value: unknown): value is UserProfile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.display_name === "string" &&
    typeof value.role === "string" &&
    isStringArray(value.permissions) &&
    isStringArray(value.sensor_ids)
  );
}
