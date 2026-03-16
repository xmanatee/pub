# Communication Protocol Research

> Research into replacing or improving Pub's current WebRTC-based live communication system with established protocols.

## Current Architecture

### What We Have

```
┌─────────────────────────────────────────────┐
│  Bridge Protocol (app-level)                │
│  Named channels: chat, _control, command,   │
│  file, media, canvas-file, render-error     │
├─────────────────────────────────────────────┤
│  App-level ACKs & Delivery Receipts         │
├─────────────────────────────────────────────┤
│  WebRTC Data Channels (ordered SCTP)        │
├─────────────────────────────────────────────┤
│  ICE / STUN (NAT traversal)                 │
├─────────────────────────────────────────────┤
│  DTLS (encryption)                          │
└─────────────────────────────────────────────┘

Signaling: Convex DB (browser writes, agent polls)
Presence:  HTTP heartbeat every 30s, 90s staleness
```

### Signaling Flow

1. Browser creates WebRTC offer → stores in Convex DB (`lives.browserOffer`)
2. Agent daemon polls Convex via `getLiveForAgent` reactive subscription
3. Daemon detects pending offer → creates answer via `werift` (pure-JS WebRTC)
4. Daemon posts answer via HTTP PATCH to `/api/v1/agent/live/signal`
5. Browser picks up answer from Convex query, applies it
6. ICE candidates exchanged through DB writes (batched: browser 500ms, daemon 2s)
7. Once ICE connects → data channels open → bridge protocol messages flow

### Key Pain Points

| Issue | Severity | Description |
|-------|----------|-------------|
| No auto-reconnect | High | ICE failure → session hangs; browser must manually send new offer |
| Signaling via DB polling | Medium | Adds latency; race conditions between offer writes and daemon reads |
| 50 ICE candidate limit | Medium | Could fail in complex NAT environments (corporate, VPN) |
| No termination handshake | Medium | Browser doesn't know daemon died; waits for ICE timeout |
| Two independent connections | Medium | Convex subscription for signaling + WebRTC for data — either can fail independently |
| werift (pure-JS WebRTC) | Medium | Less battle-tested than native; potential edge cases in NAT traversal |
| Outbound buffer drops | Low | 200-message cap; early agent output silently lost |
| Ack timeout = permanent failure | Low | No retry of original message, just marks failed |
| Complex state machine | Low | Signaling decision logic has many states and subtle timing windows |

### What the Current Architecture Gets Right

- **P2P data path**: Once connected, data flows directly browser↔agent (low latency)
- **Encryption**: DTLS provides transport encryption
- **Ordered delivery**: SCTP guarantees ordering within channels
- **Named channels**: Good logical separation of concerns
- **Streaming support**: Stream-start/data/end protocol for large payloads

---

## Protocol Analysis

### 1. MTProto (Telegram)

**What it is**: Telegram's custom protocol for client↔server communication. Three layers: transport, cryptographic, and application.

**Key design concepts worth borrowing**:

- **Session ≠ Connection**: MTProto sessions persist across TCP/WS connections. A session is tied to a device + auth key, not a socket. Messages can arrive on any connection within the session. **This is the biggest conceptual improvement we could adopt** — our current model ties the session to a single WebRTC peer connection.
- **Explicit ACK protocol**: Content-related messages require explicit ACKs. Non-content messages (containers, acks themselves) don't. ACKs are batched into the next outgoing message. Unacked messages are resent on reconnection.
- **Message IDs as timestamps**: `msg_id ≈ unixtime * 2^32`, monotonically increasing. Provides natural ordering, deduplication, and replay protection. Rejected if >300s old or >30s in the future.
- **Server salts**: Rotating shared secrets that provide replay protection and session binding.
- **Containers**: Multiple messages packed into a single transport frame (up to 1024). Reduces round trips.

**What doesn't apply**:

- Custom encryption (IGE mode AES-256) — we don't need our own crypto; TLS/DTLS is fine
- Authorization key exchange (DH) — we use API keys
- Transport obfuscation — not a censorship concern for us

**Verdict**: Not a drop-in replacement, but the **session-over-connection** and **explicit ACK batching** patterns are directly applicable and would solve our reconnection problem.

### 2. Signal Protocol

**What it is**: End-to-end encryption protocol (Double Ratchet + X3DH key agreement).

**Relevance**: Almost none for our use case. Signal Protocol is purely about **encryption**, not transport. It relies on an external transport layer (typically WebSockets to a server, or push notifications). The Double Ratchet provides forward secrecy per message, which is overkill when we control both endpoints and trust the server.

**What we could borrow**: Nothing practical. Our threat model doesn't require E2E encryption between browser and agent — TLS to the relay/server is sufficient.

**Verdict**: Wrong tool for the job. Signal Protocol solves a different problem (encryption at rest and in transit against a compromised server).

### 3. WebTransport (HTTP/3 + QUIC)

**What it is**: W3C API for browser↔server communication over HTTP/3. Provides multiplexed bidirectional streams AND unreliable datagrams over a single QUIC connection.

**Key advantages over current approach**:

- **Native multiplexing**: Multiple independent streams over one connection — no head-of-line blocking between channels. Maps perfectly to our named channels.
- **No signaling needed**: Client connects directly to server URL. No offer/answer/ICE dance. Eliminates the entire Convex signaling plane.
- **Built-in reliability options**: Choose reliable (streams) or unreliable (datagrams) per channel.
- **Automatic reconnection**: QUIC has connection migration built in — survives IP changes.
- **Backpressure**: Streams API provides natural flow control.
- **Works in Web Workers**: Offload communication from main thread.

**Browser support**:

| Browser | Status |
|---------|--------|
| Chrome | Full support (97+) |
| Firefox | Full support (115+) |
| Safari | **Not yet supported** — but accepted into Interop 2026; expected by end of 2026 |
| Edge | Full support (via Chromium) |

**Challenges**:

- **Safari gap**: Major blocker today. ~72% browser compatibility score. Interop 2026 should fix this.
- **Server-side**: Need an HTTP/3 server. Node.js doesn't have native support yet. Options: Cloudflare Workers, Caddy, or custom QUIC server.
- **NAT traversal**: Not needed! WebTransport is client→server, so standard HTTPS routing works. But this means we lose the P2P data path — all traffic routes through a server.
- **Architecture change**: Requires a relay server between browser and agent. Agent connects to relay as a client too.

**Verdict**: The most technically elegant replacement. Eliminates the hardest parts (signaling, ICE, NAT traversal) by changing the architecture to client→relay→client. **Best long-term bet**, but blocked on Safari support until late 2026.

### 4. MQTT

**What it is**: Lightweight pub/sub messaging protocol. Designed for IoT, runs over TCP/WebSocket.

**How it could work**: Browser and agent both connect to an MQTT broker. Topics map to channels (`pub/{slug}/chat`, `pub/{slug}/control`, etc.). QoS levels provide delivery guarantees.

**Pros**:

- Simple pub/sub model
- QoS 0 (at most once), QoS 1 (at least once), QoS 2 (exactly once)
- Retained messages for state
- Last Will and Testament (LWT) for presence detection
- Runs over WebSocket in browsers

**Cons**:

- **Requires a broker**: Additional infrastructure (Mosquitto, HiveMQ, etc.)
- **Not designed for streaming**: Message-oriented, not stream-oriented. Large payloads need chunking.
- **No multiplexed streams**: Topic-based routing is conceptually similar but not as efficient.
- **Overkill pub/sub model**: We have exactly 2 participants per session. Pub/sub is for many-to-many.
- **Latency**: Additional hop through broker.

**Verdict**: Solving a different problem (IoT device fleet communication). Adds infrastructure complexity without clear benefits over WebSocket for a 1:1 session.

### 5. WebSocket with Multiplexing

**What it is**: Plain WebSocket connection with application-level channel multiplexing. Libraries like Socket.IO, or custom framing.

**How it would work**:

```
Browser ←WebSocket→ Relay Server ←WebSocket→ Agent Daemon
```

Each message frame includes a channel ID. The relay forwards messages between the browser and agent WebSocket connections.

**Pros**:

- **Universal browser support**: WebSocket works everywhere, always.
- **Dead simple**: No ICE, no STUN, no SDP, no candidates. Just connect to a URL.
- **Automatic reconnection**: Libraries like `reconnecting-websocket` or `PartySocket` handle this.
- **Proven at scale**: Every real-time app uses this pattern (Slack, Discord, Figma).
- **Convex already supports WebSockets**: The Convex client itself is a WebSocket connection.

**Cons**:

- **Head-of-line blocking**: TCP means one lost packet stalls all channels.
- **Server hop**: All data routes through the relay (adds ~5-20ms latency vs P2P).
- **No unreliable mode**: Always reliable, always ordered (TCP).
- **Need a relay server**: Though this could be a Convex action, Cloudflare Worker, or similar.

**Key insight**: Your current architecture already routes signaling through Convex (a server). The only P2P part is the data channel after ICE connects. But the P2P path is the source of most complexity (ICE, STUN, NAT traversal, werift). If P2P latency isn't critical (and for AI agent responses, the LLM latency dwarfs network latency), a relay is strictly simpler.

**Verdict**: The pragmatic choice. Eliminates 80% of current complexity. Universal support. The question is: does the ~10ms extra latency from a relay matter when the agent is running LLM inference?

### 6. QUIC (Direct)

**What it is**: UDP-based transport protocol with built-in multiplexing, encryption, and connection migration.

**Browser access**: Only through WebTransport API (see #3). Browsers cannot use raw QUIC. On the agent side, Node.js QUIC support is experimental.

**Verdict**: Subsumed by WebTransport for browser use cases. Not independently viable.

### 7. Matrix Protocol

**What it is**: Decentralized, federated communication protocol. Rooms, events, state resolution.

**Relevance**: Matrix is designed for federated chat between servers. It's enormously complex (DAG-based event ordering, state resolution algorithms, federation). For a 1:1 browser↔agent session, it's massive overkill.

**Borrowable concepts**: Event-based state model, room concept. But we already have this with the `lives` table.

**Verdict**: Wrong scale. Matrix solves federated multi-party communication. We need 1:1 sessions.

### 8. Nostr

**What it is**: Minimal relay-based protocol. Clients connect to relays via WebSocket, publish signed events, subscribe with filters.

**Design**:

- Events are JSON signed with secp256k1 keys
- Clients → Relay: `["EVENT", ...]`, `["REQ", subscription_id, filters]`, `["CLOSE", subscription_id]`
- Relay → Client: `["EVENT", subscription_id, event]`, `["OK", event_id, success, message]`

**Borrowable concepts**:

- **Extreme simplicity**: Just events and subscriptions. No complex negotiation.
- **Relay model**: Browser and agent connect to relay, exchange events. Relay handles routing.
- **Signed events**: Cryptographic authentication without sessions.

**Cons**:

- No built-in reliability guarantees (fire-and-forget events)
- No stream multiplexing
- Designed for social media, not real-time sessions

**Verdict**: The simplicity is inspiring, but lacks the reliability guarantees we need. The relay pattern is good though.

### 9. LiveKit

**What it is**: Open-source WebRTC infrastructure (SFU) with managed signaling, automatic reconnection, and data channels.

**How it would work**: Replace our custom signaling + werift with LiveKit's SDK. LiveKit handles:

- Signaling (WebSocket-based, not DB-polling)
- ICE negotiation and TURN fallback
- Automatic reconnection (ICE restart → full reconnect fallback)
- Connection quality monitoring
- Data channels with pub/sub semantics

**Reconnection behavior**: When disruption happens, LiveKit attempts ICE restart first. If that fails, it does a full reconnection with state re-sync. It even supports "live migrations" — server-side connection handoff without client disruption.

**Pros**:

- **Solves all pain points**: Auto-reconnect, managed signaling, no candidate limits, graceful disconnection.
- **Battle-tested**: Used in production by many companies.
- **Self-hostable**: Can run your own SFU.
- **SDKs for everything**: Browser, Node.js, Go, Python, etc.
- **Data channels built-in**: Reliable messaging between participants.

**Cons**:

- **Additional infrastructure**: Need to run/host a LiveKit server (or use LiveKit Cloud).
- **Dependency**: Couples your stack to LiveKit's SDK and server.
- **Overkill for data-only**: LiveKit is optimized for media (audio/video). Data channels are a secondary feature.
- **SFU model**: Designed for rooms with multiple participants. Our 1:1 use case doesn't need an SFU.

**Verdict**: Would solve all current problems, but adds significant infrastructure and dependency for what is essentially a 1:1 data channel. Best if you plan to add audio/video features later.

### 10. Cloudflare Durable Objects + PartyKit (PartyServer)

**What it is**: Serverless WebSocket infrastructure on Cloudflare's edge. Each "party" (room) is a Durable Object with WebSocket connections, state, and persistence.

**How it would work**:

```
Browser ←WS→ [Cloudflare Edge: Durable Object] ←WS→ Agent Daemon
```

Each live session gets a Durable Object. Browser and agent connect via WebSocket. The DO handles message routing, state, and persistence.

**Pros**:

- **PartySocket**: Built-in reconnection, buffering, resilience.
- **Global edge deployment**: Low latency everywhere.
- **Hibernatable WebSockets**: Scales to thousands of connections cheaply.
- **Zero infrastructure management**: Cloudflare handles everything.
- **Simple mental model**: Each session is an actor/object with its own state.

**Cons**:

- **Cloudflare lock-in**: Ties you to CF's platform.
- **Cost**: Durable Objects pricing (though cheap at low scale).
- **WebSocket only**: No unreliable datagrams or QUIC features.

**Verdict**: Extremely compelling for the relay model. Handles reconnection, buffering, and scaling out of the box. Worth serious consideration.

---

## Comparison Matrix

| Criterion | Current (WebRTC) | WebSocket Relay | WebTransport | LiveKit | PartyKit/DO |
|-----------|-----------------|-----------------|--------------|---------|-------------|
| **Browser support** | Universal | Universal | No Safari (yet) | Universal | Universal |
| **Setup complexity** | Very High | Low | Medium | Medium | Low |
| **NAT traversal** | ICE/STUN needed | Not needed | Not needed | Handled | Not needed |
| **Auto-reconnect** | No | Easy (lib) | Built-in (QUIC) | Built-in | Built-in |
| **Multiplexed streams** | Via named channels | App-level | Native | Via SDK | App-level |
| **Latency** | Lowest (P2P) | +5-20ms (relay) | Low (QUIC) | Low (SFU) | Low (edge) |
| **Signaling** | Custom (DB) | None needed | None needed | Managed | None needed |
| **Infra required** | STUN servers | Relay server | HTTP/3 server | SFU server | Cloudflare |
| **Reliability** | SCTP ordered | TCP ordered | Configurable | SDK managed | TCP ordered |
| **Maturity** | High (WebRTC) | Very High | Medium | High | Medium-High |

---

## Recommendations

### Short-term: WebSocket Relay (with MTProto-inspired session layer)

**Replace WebRTC with a relay-based WebSocket architecture**, taking key design patterns from MTProto:

1. **Session ≠ Connection** (from MTProto): A session persists across WebSocket reconnections. The session is identified by a session ID + API key, not by a specific socket. When the WebSocket drops and reconnects, the session resumes — unacked messages are replayed.

2. **Relay through Convex** (or a lightweight relay):
   ```
   Browser ←WS→ Convex/Relay ←WS→ Agent Daemon
   ```
   Eliminates: ICE, STUN, SDP exchange, candidate gathering, werift dependency.

3. **Explicit ACK batching** (from MTProto): Content messages require ACKs. ACKs are batched into the next outgoing message. Unacked messages are resent after reconnection. Message IDs are timestamp-based for natural ordering and dedup.

4. **Channel multiplexing over single WebSocket**: Keep the current named channel concept but multiplex over one connection:
   ```json
   { "ch": "chat", "id": "msg-123", "type": "text", "data": "hello" }
   ```

5. **Presence via WebSocket liveness**: No separate heartbeat HTTP calls. The relay knows a client is alive because the WebSocket is open. Relay notifies the other side immediately on disconnect.

**Why this works**:
- Universal browser support (no Safari concerns)
- Eliminates the entire signaling state machine
- Reconnection is trivial (reconnect WS, resume session)
- The ~10ms relay latency is irrelevant when the agent runs LLM inference (100ms-10s)
- Convex already has WebSocket infrastructure (ConvexClient uses WS)
- Keeps your existing bridge protocol concepts (channels, message types, streaming)

### Medium-term: Evaluate PartyKit/Durable Objects

If relay infrastructure becomes a bottleneck, PartyKit provides a production-ready relay with reconnection, buffering, hibernation, and global edge deployment. It's the "managed" version of the WebSocket relay.

### Long-term: WebTransport

Once Safari ships WebTransport support (expected late 2026 via Interop 2026), migrate the transport layer from WebSocket to WebTransport. This gives you:
- Native multiplexed streams (no app-level channel framing)
- Connection migration (survives network changes)
- Optional unreliable datagrams (for latency-sensitive data)
- No head-of-line blocking between channels

The session layer (MTProto-inspired) stays the same — just swap the transport underneath.

### What NOT to do

- **Don't adopt MTProto wholesale**: Its crypto layer is custom and controversial. Take the session/ACK patterns, not the encryption.
- **Don't adopt Signal Protocol**: It solves encryption, not transport. Irrelevant here.
- **Don't adopt Matrix**: Massively over-engineered for 1:1 sessions.
- **Don't adopt MQTT**: Wrong paradigm (IoT pub/sub) for interactive sessions.
- **Don't adopt LiveKit** (unless adding audio/video): Too heavy for data-only use.

---

## Proposed Session Protocol (MTProto-inspired)

A sketch of what the new session layer could look like:

```typescript
// Session persists across connections
interface Session {
  sessionId: string;        // Random, generated by initiator
  slug: string;             // Pub being viewed
  userId: Id<"users">;      // Session owner
  createdAt: number;
  lastActivityAt: number;
}

// Message envelope (multiplexed over single WS)
interface Envelope {
  sid: string;              // Session ID
  seq: number;              // Sequence number (monotonic within session)
  ch: ChannelName;          // Channel: "chat" | "_control" | "command" | ...
  type: MessageType;        // "text" | "event" | "stream-start" | ...
  data?: string;
  meta?: Record<string, unknown>;
  acks?: number[];          // Piggybacked ACKs for received messages
}

// Relay behavior
// - Stores unacked messages per session (bounded buffer)
// - On reconnect: replays unacked messages
// - On disconnect: notifies other party immediately
// - On session timeout (90s no connection): cleans up
```

### Migration Path

1. **Phase 1**: Add WebSocket relay endpoint alongside existing WebRTC. Both browser and agent can connect via WS.
2. **Phase 2**: Implement session layer with ACKs and reconnection. Test in parallel with WebRTC.
3. **Phase 3**: Default new sessions to WebSocket relay. Keep WebRTC as fallback.
4. **Phase 4**: Remove WebRTC signaling, ICE, werift dependency. Delete `webrtc-negotiation-core.ts`, `webrtc-transport-core.ts`, signaling state machine.

Files that would be simplified or removed:
- `shared/webrtc-negotiation-core.ts` — removed
- `shared/webrtc-transport-core.ts` — simplified (no ICE/STUN config)
- `cli/src/live/transport/signaling.ts` — replaced with WS connect
- `cli/src/live/daemon/channel-manager.ts` — simplified (no ICE candidate management)
- `web/src/features/live/lib/webrtc-browser.ts` — replaced with WS client
- `web/src/features/live/hooks/use-live-bridge.ts` — simplified
- `convex/pubs.ts` — remove offer/answer/candidate fields from lives table

---

## Sources

- [MTProto Protocol](https://core.telegram.org/mtproto)
- [MTProto Detailed Description](https://core.telegram.org/mtproto/description)
- [MTProto Service Messages](https://core.telegram.org/mtproto/service_messages)
- [WebTransport Explainer (W3C)](https://github.com/w3c/webtransport/blob/main/explainer.md)
- [WebTransport Browser Support](https://caniuse.com/webtransport)
- [Interop 2026 Announcement (WebKit)](https://webkit.org/blog/17818/announcing-interop-2026/)
- [WebTransport Chrome Docs](https://developer.chrome.com/docs/capabilities/web-apis/webtransport)
- [WebRTC vs WebTransport (VideoSDK)](https://www.videosdk.live/developer-hub/webtransport/webrtc-vs-webtransport)
- [LiveKit Documentation](https://docs.livekit.io/intro/basics/connect/)
- [LiveKit Connection Flow (DeepWiki)](https://deepwiki.com/livekit/livekit/4.1-client-connection-flow)
- [PartyKit Documentation](https://docs.partykit.io/how-partykit-works/)
- [Cloudflare Acquires PartyKit](https://blog.cloudflare.com/cloudflare-acquires-partykit/)
- [Nostr Protocol (NIP-01)](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [WebSocket vs WebRTC DataChannel (VideoSDK)](https://www.videosdk.live/developer-hub/webrtc/websocket-vs-webrtc-datachannel)
- [DataChannel vs WebTransport vs WebSockets (SoftPage)](https://www.softpagecms.com/2025/08/25/datachannel-webtransport/)
- [WebRTC vs WebSockets (Ably)](https://ably.com/topic/webrtc-vs-websocket)
