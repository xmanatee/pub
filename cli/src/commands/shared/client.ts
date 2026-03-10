import { PubApiClient } from "../../core/api/client.js";
import type { RequiredConfig } from "../../core/config/index.js";
import { getRequiredConfig } from "../../core/config/index.js";

export function createClient(configOverride?: RequiredConfig): PubApiClient {
  const config = configOverride || getRequiredConfig();
  return new PubApiClient(config.baseUrl, config.apiKey);
}
