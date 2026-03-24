/**
 * iOS Safari WebRTC host ICE candidate unlock.
 *
 * Safari on iOS/iPadOS restricts WebRTC host ICE candidates for privacy:
 * without an active camera or microphone permission grant, the browser
 * only generates server-reflexive (STUN) candidates — never host
 * candidates containing real local IP addresses. This makes direct LAN
 * peer connections impossible and causes ICE failures through most NATs.
 *
 * Requesting (then immediately releasing) a microphone stream unlocks
 * host candidates for the lifetime of the permission grant. The grant
 * persists across page loads until the user revokes it in Safari settings,
 * so the user is only prompted once per origin.
 *
 * This workaround only applies to iOS/iPadOS where all browsers use
 * WebKit. Desktop Chrome, Firefox, and Edge expose host candidates
 * without any permission grant.
 *
 * Reference: https://webrtchacks.com/guide-to-safari-webrtc/
 *
 * TODO: Replace this workaround with a TURN server. A TURN relay provides
 * relay ICE candidates that work regardless of Safari's host candidate
 * restriction, NAT topology, or firewall configuration — making the
 * microphone permission prompt unnecessary. Options: Cloudflare Calls
 * TURN (free tier), Metered.ca, or self-hosted coturn. Config goes in
 * shared/webrtc-transport-core.ts as TURN entries in WEBRTC_ICE_SERVER_CONFIG.
 * Time-limited TURN credentials require a backend endpoint to generate them.
 */

let cached: Promise<boolean> | null = null;

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports as Mac with touch support
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}

async function isMicrophoneGranted(): Promise<boolean> {
  try {
    const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return result.state === "granted";
  } catch {
    // permissions.query("microphone") not supported on all WebKit versions
    return false;
  }
}

async function requestAndReleaseMicrophone(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return true;
  } catch {
    return false;
  }
}

async function doUnlock(): Promise<boolean> {
  if (await isMicrophoneGranted()) return true;
  return requestAndReleaseMicrophone();
}

/**
 * On iOS/iPadOS, ensure microphone permission is granted to unlock WebRTC
 * host ICE candidates. No-op on other platforms. Safe to call multiple
 * times — the result is cached for the page lifetime, and the browser
 * persists the grant across sessions.
 */
export function unlockIosIceCandidates(): Promise<boolean> {
  if (!isIos()) return Promise.resolve(false);
  if (!cached) {
    cached = doUnlock();
  }
  return cached;
}
