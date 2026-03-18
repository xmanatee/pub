import { closeSentry } from "../telemetry/sentry.js";

export async function exitProcess(code: number): Promise<never> {
  await closeSentry();
  process.exit(code);
}
