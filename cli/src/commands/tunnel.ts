import type { Command } from "commander";
import { registerTunnelManagementCommands } from "./tunnel/management-commands.js";
import { registerTunnelMessageCommands } from "./tunnel/message-commands.js";
import { registerTunnelStartCommand } from "./tunnel/start-command.js";

export function registerTunnelCommands(program: Command): void {
  const tunnel = program.command("tunnel").description("P2P encrypted tunnel to browser");
  registerTunnelStartCommand(tunnel);
  registerTunnelMessageCommands(tunnel);
  registerTunnelManagementCommands(tunnel);
}

export {
  buildBridgeForkStdio,
  buildDaemonForkStdio,
  getFollowReadDelayMs,
  messageContainsPong,
  parseBridgeMode,
  parsePositiveIntegerOption,
  pickReusableTunnel,
  readDaemonProcessInfo,
  resolveTunnelIdSelection,
  shouldRestartDaemonForCliUpgrade,
} from "./tunnel-helpers.js";
