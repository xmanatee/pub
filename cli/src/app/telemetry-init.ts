import { resolvePubSettings } from "../core/config/index.js";
import { initSentryCli } from "../core/telemetry/sentry.js";

export function initCliTelemetry(version?: string): void {
  const settings = resolvePubSettings();
  const telemetry = settings.valuesByKey.telemetry;
  const sentryDsn = settings.valuesByKey.sentryDsn;

  if (telemetry && telemetry.value === false) return;
  if (!sentryDsn || typeof sentryDsn.value !== "string" || sentryDsn.value.length === 0) return;

  initSentryCli({ dsn: sentryDsn.value, version });
}
