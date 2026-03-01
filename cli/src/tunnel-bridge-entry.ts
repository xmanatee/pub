import { startOpenClawBridge } from "./lib/tunnel-bridge-openclaw.js";

const mode = process.env.PUBBLUE_BRIDGE_MODE;
const slug = process.env.PUBBLUE_BRIDGE_SLUG;
const socketPath = process.env.PUBBLUE_BRIDGE_SOCKET;
const infoPath = process.env.PUBBLUE_BRIDGE_INFO;

if (!mode || !slug || !socketPath || !infoPath) {
  console.error("Missing required env vars for bridge process.");
  process.exit(1);
}

if (mode !== "openclaw") {
  console.error(`Unsupported bridge mode: ${mode}. Supported values: openclaw`);
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
