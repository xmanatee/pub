/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as analytics from "../analytics.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as auth_accounts from "../auth_accounts.js";
import type * as auth_cleanup from "../auth_cleanup.js";
import type * as auth_errors from "../auth_errors.js";
import type * as connections from "../connections.js";
import type * as env from "../env.js";
import type * as http from "../http.js";
import type * as http_agent_routes from "../http/agent_routes.js";
import type * as http_pub_routes from "../http/pub_routes.js";
import type * as http_pub_routes_api from "../http/pub_routes/api.js";
import type * as http_pub_routes_content from "../http/pub_routes/content.js";
import type * as http_shared from "../http/shared.js";
import type * as linking from "../linking.js";
import type * as presence from "../presence.js";
import type * as pubAccessTokens from "../pubAccessTokens.js";
import type * as pubFiles from "../pubFiles.js";
import type * as pubs from "../pubs.js";
import type * as rateLimits from "../rateLimits.js";
import type * as telegram from "../telegram.js";
import type * as telegramBots from "../telegramBots.js";
import type * as telegram_init_data from "../telegram_init_data.js";
import type * as testing from "../testing.js";
import type * as tunnels from "../tunnels.js";
import type * as turn from "../turn.js";
import type * as user_data from "../user_data.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  analytics: typeof analytics;
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  auth_accounts: typeof auth_accounts;
  auth_cleanup: typeof auth_cleanup;
  auth_errors: typeof auth_errors;
  connections: typeof connections;
  env: typeof env;
  http: typeof http;
  "http/agent_routes": typeof http_agent_routes;
  "http/pub_routes": typeof http_pub_routes;
  "http/pub_routes/api": typeof http_pub_routes_api;
  "http/pub_routes/content": typeof http_pub_routes_content;
  "http/shared": typeof http_shared;
  linking: typeof linking;
  presence: typeof presence;
  pubAccessTokens: typeof pubAccessTokens;
  pubFiles: typeof pubFiles;
  pubs: typeof pubs;
  rateLimits: typeof rateLimits;
  telegram: typeof telegram;
  telegramBots: typeof telegramBots;
  telegram_init_data: typeof telegram_init_data;
  testing: typeof testing;
  tunnels: typeof tunnels;
  turn: typeof turn;
  user_data: typeof user_data;
  users: typeof users;
  utils: typeof utils;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
