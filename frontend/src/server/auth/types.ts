import type { components } from "@/generated/api";
import { isRecord } from "@/lib/validation";

export type LoginCredentials = components["schemas"]["LoginRequest"];
export type TokenPair = components["schemas"]["TokenPair"];
export type UserProfile = components["schemas"]["Profile"];

export type SessionRecord = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  profile: UserProfile;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isLoginCredentials(value: unknown): value is LoginCredentials {
  return (
    isRecord(value) &&
    typeof value.email === "string" &&
    typeof value.password === "string"
  );
}

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

export function isTokenPair(value: unknown): value is TokenPair {
  return (
    isRecord(value) &&
    typeof value.access_token === "string" &&
    value.access_token.length > 0 &&
    value.token_type === "bearer" &&
    typeof value.access_expires_in === "number" &&
    Number.isFinite(value.access_expires_in) &&
    typeof value.refresh_token === "string" &&
    value.refresh_token.length > 0 &&
    typeof value.refresh_expires_in === "number" &&
    Number.isFinite(value.refresh_expires_in) &&
    isUserProfile(value.user)
  );
}
