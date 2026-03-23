export type SessionDescriptionPayload = {
  sdp: string;
  type: string;
};

export type BrowserOfferPeer = {
  createOffer(): Promise<SessionDescriptionPayload>;
  setLocalDescription(description: SessionDescriptionPayload): Promise<void>;
  getLocalDescription(): SessionDescriptionPayload | null;
};

export async function createBrowserOffer(peer: BrowserOfferPeer): Promise<string> {
  const offer = assertSessionDescription(await peer.createOffer(), "Browser offer");
  await peer.setLocalDescription(offer);
  const appliedOffer = peer.getLocalDescription();
  return encodeSessionDescription(appliedOffer ?? offer);
}

export type AgentAnswerPeer = {
  setRemoteDescription(sdp: string, type: string): void;
  onLocalDescription(cb: (sdp: string, type: string) => void): void;
  onGatheringStateChange(cb: (state: string) => void): void;
  getLocalDescription(): SessionDescriptionPayload | null;
};

export function createAgentAnswerFromBrowserOffer(
  peer: AgentAnswerPeer,
  browserOffer: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (description: SessionDescriptionPayload) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(encodeSessionDescription(description));
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    };

    peer.onLocalDescription((sdp, type) => {
      finish(assertSessionDescription({ sdp, type }, "Agent local description"));
    });

    peer.onGatheringStateChange((state) => {
      if (state !== "complete" || settled) return;
      const local = peer.getLocalDescription();
      if (!local) return;
      finish(assertSessionDescription(local, "Agent local description"));
    });

    try {
      const parsedOffer = parseSessionDescription(browserOffer, "Browser offer");
      peer.setRemoteDescription(parsedOffer.sdp, parsedOffer.type);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    timeout = setTimeout(() => {
      const local = peer.getLocalDescription();
      if (local) {
        finish(assertSessionDescription(local, "Agent local description"));
        return;
      }
      fail(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

export function parseSessionDescription(
  descriptionJson: string,
  label = "Session description",
): SessionDescriptionPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(descriptionJson);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }

  return assertSessionDescription(parsed, label);
}

export function encodeSessionDescription(description: SessionDescriptionPayload): string {
  const normalized = assertSessionDescription(description, "Session description");
  return JSON.stringify({ sdp: normalized.sdp, type: normalized.type });
}

function assertSessionDescription(value: unknown, label: string): SessionDescriptionPayload {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} must be an object with sdp/type`);
  }

  const maybeSdp = (value as { sdp?: unknown }).sdp;
  const maybeType = (value as { type?: unknown }).type;
  if (typeof maybeSdp !== "string" || maybeSdp.length === 0) {
    throw new Error(`${label} must include a non-empty sdp`);
  }
  if (typeof maybeType !== "string" || maybeType.length === 0) {
    throw new Error(`${label} must include a non-empty type`);
  }

  return { sdp: maybeSdp, type: maybeType };
}
