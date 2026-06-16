import { isLiveAgentProfileId } from "../../../../shared/live-agent-profile.js";
import type { OpenClawLikeProfileConfig, OpenClawLikeProfilesConfig } from "./types.js";

function readRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function readTrimmedString(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  return trimmed ? trimmed : undefined;
}

function readStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.every((entry) => typeof entry === "string") ? input : undefined;
}

function parseProfilesJson(raw: string, key: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON value for ${key}: ${detail}`);
  }
}

export function normalizeOpenClawLikeProfiles(
  input: unknown,
  key = "openclawLike.profiles",
): OpenClawLikeProfilesConfig {
  const record = readRecord(input);
  if (!record || Object.keys(record).length === 0) {
    throw new Error(`${key} must be a non-empty object.`);
  }

  const profiles: OpenClawLikeProfilesConfig = {};
  for (const [profileId, value] of Object.entries(record)) {
    if (!isLiveAgentProfileId(profileId)) {
      throw new Error(`${key} contains invalid profile id "${profileId}".`);
    }

    const profile = readRecord(value);
    if (!profile) {
      throw new Error(`${key}.${profileId} must be an object.`);
    }

    const label = readTrimmedString(profile.label);
    if (!label) {
      throw new Error(`${key}.${profileId}.label is required.`);
    }

    const command = readTrimmedString(profile.command);
    if (!command) {
      throw new Error(`${key}.${profileId}.command is required.`);
    }

    const description = readTrimmedString(profile.description);
    const args = profile.args === undefined ? undefined : readStringArray(profile.args);
    if (profile.args !== undefined && !args) {
      throw new Error(`${key}.${profileId}.args must be an array of strings.`);
    }

    const normalized: OpenClawLikeProfileConfig = { label, command };
    if (description) normalized.description = description;
    if (args) normalized.args = args;
    profiles[profileId] = normalized;
  }

  return profiles;
}

export function parseOpenClawLikeProfilesValue(
  raw: string,
  key = "openclawLike.profiles",
): OpenClawLikeProfilesConfig {
  return normalizeOpenClawLikeProfiles(parseProfilesJson(raw, key), key);
}

export function resolveOpenClawLikeDefaultProfile(
  value: string | undefined,
  profiles: OpenClawLikeProfilesConfig | undefined,
  key = "openclawLike.defaultProfile",
): string | undefined {
  const profileId = readTrimmedString(value);
  if (!profileId) return undefined;
  if (!isLiveAgentProfileId(profileId)) {
    throw new Error(`${key} contains invalid profile id "${profileId}".`);
  }
  if (profiles && !profiles[profileId]) {
    throw new Error(`${key} must reference a profile defined in openclawLike.profiles.`);
  }
  return profileId;
}
