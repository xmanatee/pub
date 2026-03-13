interface BrowserPlatformSnapshot {
  userAgent: string;
}

interface MediaTrackLike {
  stop(): void;
}

interface MediaStreamLike {
  getTracks(): MediaTrackLike[];
}

type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;

export class LiveConnectionPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveConnectionPreparationError";
  }
}

function readBrowserPlatform(): BrowserPlatformSnapshot | null {
  if (typeof navigator === "undefined" || typeof navigator.userAgent !== "string") {
    return null;
  }
  return { userAgent: navigator.userAgent };
}

function isIosWebKitIPhone(platform: BrowserPlatformSnapshot | null): boolean {
  if (!platform) return false;
  const ua = platform.userAgent;
  if (!/iPhone|iPod/i.test(ua)) return false;
  if (!/AppleWebKit/i.test(ua)) return false;
  return !/Android/i.test(ua);
}

function readGetUserMedia(): GetUserMedia | null {
  if (typeof navigator === "undefined") return null;
  const getUserMedia = navigator.mediaDevices?.getUserMedia;
  if (!getUserMedia) return null;
  return getUserMedia.bind(navigator.mediaDevices);
}

function isDomExceptionWithName(error: unknown, name: string): boolean {
  return error instanceof DOMException ? error.name === name : false;
}

export async function prepareMobileLiveConnection(params?: {
  platform?: BrowserPlatformSnapshot | null;
  getUserMedia?: GetUserMedia | null;
}): Promise<boolean> {
  const platform = params?.platform ?? readBrowserPlatform();
  if (!isIosWebKitIPhone(platform)) return false;

  const getUserMedia = params?.getUserMedia ?? readGetUserMedia();
  if (!getUserMedia) {
    throw new LiveConnectionPreparationError(
      "This iPhone browser cannot request microphone access needed for live connection.",
    );
  }

  let stream: MediaStreamLike | null = null;
  try {
    stream = await getUserMedia({ audio: true });
  } catch (error) {
    if (isDomExceptionWithName(error, "NotAllowedError")) {
      throw new LiveConnectionPreparationError(
        "On iPhone, live connection needs microphone access before it can connect. Allow mic access and try again.",
      );
    }
    if (isDomExceptionWithName(error, "NotFoundError")) {
      throw new LiveConnectionPreparationError(
        "No microphone is available on this iPhone, so live connection cannot start.",
      );
    }
    throw new LiveConnectionPreparationError(
      "iPhone live connection could not prepare microphone access before connecting.",
    );
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }

  return true;
}
