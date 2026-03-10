import { PubApiClient } from "../../core/api/client.js";
import type { ApiClientSettings } from "../../core/config/index.js";
import { getApiClientSettings } from "../../core/config/index.js";

export function createClient(settingsOverride?: ApiClientSettings): PubApiClient {
  const settings = settingsOverride || getApiClientSettings();
  return new PubApiClient(settings.baseUrl, settings.apiKey);
}
