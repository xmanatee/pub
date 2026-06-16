import { readNonEmptyString, readRecord, readString } from "./protocol-runtime-core";

export type LiveAgentProfileOption = {
  id: string;
  label: string;
  description?: string;
};

export const CLAUDE_LIVE_AGENT_PROFILES: LiveAgentProfileOption[] = [
  {
    id: "fast",
    label: "Fast",
    description: "Lowest latency. Uses the lightweight Claude live model.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Default tradeoff for most live sessions.",
  },
  {
    id: "thorough",
    label: "Thorough",
    description: "More deliberate. Uses the deepest Claude live model.",
  },
];

export const DEFAULT_CLAUDE_LIVE_PROFILE_ID = "balanced";

const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isLiveAgentProfileId(input: string): boolean {
  return PROFILE_ID_PATTERN.test(input);
}

export function readLiveProfileId(input: unknown): string | undefined {
  const value = readNonEmptyString(input)?.trim();
  return value && isLiveAgentProfileId(value) ? value : undefined;
}

export function readLiveAgentProfileOption(input: unknown): LiveAgentProfileOption | undefined {
  const record = readRecord(input);
  if (!record) return undefined;

  const id = readLiveProfileId(record.id);
  const label = readNonEmptyString(record.label)?.trim();
  if (!id || !label) return undefined;

  const description = readString(record.description)?.trim();
  return {
    id,
    label,
    description: description ? description : undefined,
  };
}

export function readLiveAgentProfileOptions(input: unknown): LiveAgentProfileOption[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input.map((entry) => readLiveAgentProfileOption(entry));
  if (values.some((entry) => entry === undefined)) return undefined;

  const seen = new Set<string>();
  const profiles: LiveAgentProfileOption[] = [];
  for (const profile of values as LiveAgentProfileOption[]) {
    if (seen.has(profile.id)) return undefined;
    seen.add(profile.id);
    profiles.push(profile);
  }
  return profiles;
}
