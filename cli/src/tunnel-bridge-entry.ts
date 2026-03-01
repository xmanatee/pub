import { startOpenClawBridge } from "./lib/tunnel-bridge-openclaw.js";

const slug = process.env.PUBBLUE_BRIDGE_SLUG;
const socketPath = process.env.PUBBLUE_BRIDGE_SOCKET;
const infoPath = process.env.PUBBLUE_BRIDGE_INFO;

if (!slug || !socketPath || !infoPath) {
  console.error("Missing required env vars for bridge process.");
  process.exit(1);
}

void startOpenClawBridge({
  slug,
  socketPath,
  infoPath,
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Bridge failed: ${message}`);
  process.exit(1);
});
