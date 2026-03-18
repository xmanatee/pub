import { type LiveModelProfile, readLiveModelProfile } from "./live-model-profile";
import {
  readFiniteNumber,
  readNonEmptyString,
  readRecord,
  readString,
  readStringArray,
  readTrimmedString,
} from "./protocol-runtime-core";

export type LiveInfo = {
  slug: string;
  status?: string;
  browserOffer?: string;
  agentAnswer?: string;
  agentCandidates: string[];
  browserCandidates: string[];
  createdAt: number;
  modelProfile?: LiveModelProfile;
};

export type AgentPresenceBody = {
  daemonSessionId: string;
  agentName?: string;
};

export type AgentSignalBody = {
  slug: string;
  daemonSessionId: string;
  answer?: string;
  candidates?: string[];
  agentName?: string;
};

type ParseResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };

export function parseLiveInfo(input: unknown): LiveInfo | null {
  if (input === null || input === undefined) return null;
  const record = readRecord(input);
  if (!record) return null;

  const slug = readNonEmptyString(record.slug);
  const browserCandidates = readStringArray(record.browserCandidates);
  const agentCandidates = readStringArray(record.agentCandidates);
  const createdAt = readFiniteNumber(record.createdAt);
  if (!slug || !browserCandidates || !agentCandidates || createdAt === undefined) {
    return null;
  }

  return {
    slug,
    status: readString(record.status),
    browserOffer: readString(record.browserOffer),
    agentAnswer: readString(record.agentAnswer),
    browserCandidates,
    agentCandidates,
    createdAt,
    modelProfile: readLiveModelProfile(record.modelProfile),
  };
}

export function parseAgentPresenceBody(input: unknown): ParseResult<AgentPresenceBody> {
  const record = readRecord(input);
  if (!record) {
    return { ok: false, error: "Invalid JSON body" };
  }

  const daemonSessionId = readTrimmedString(record.daemonSessionId);
  if (!daemonSessionId) {
    return { ok: false, error: "Missing daemonSessionId" };
  }

  return {
    ok: true,
    value: {
      daemonSessionId,
      agentName: readTrimmedString(record.agentName),
    },
  };
}

export function parseAgentSignalBody(input: unknown): ParseResult<AgentSignalBody> {
  const record = readRecord(input);
  if (!record) {
    return { ok: false, error: "Invalid JSON body" };
  }

  const slug = readTrimmedString(record.slug);
  if (!slug) {
    return { ok: false, error: "Missing slug" };
  }

  const daemonSessionId = readTrimmedString(record.daemonSessionId);
  if (!daemonSessionId) {
    return { ok: false, error: "Missing daemonSessionId" };
  }

  const candidates =
    record.candidates === undefined ? undefined : readStringArray(record.candidates);
  if (record.candidates !== undefined && !candidates) {
    return { ok: false, error: "Invalid candidates" };
  }

  const answer = record.answer === undefined ? undefined : readString(record.answer);
  if (record.answer !== undefined && answer === undefined) {
    return { ok: false, error: "Invalid answer" };
  }

  return {
    ok: true,
    value: {
      slug,
      daemonSessionId,
      answer,
      candidates,
      agentName: readTrimmedString(record.agentName),
    },
  };
}
