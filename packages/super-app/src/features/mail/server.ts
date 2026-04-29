/**
 * `mail.read` returns sanitized HTML — Gmail bodies routinely contain
 * trackers, remote stylesheets, scripts. Rather than running the daemon
 * command directly from the client, we proxy through this server fn so the
 * sanitizer can scrub the body before it ever reaches the browser bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { sanitizeHtml } from "~/core/sanitize";
import type { MailMessageDetail } from "./commands";

export const sanitizeMailHtml = createServerFn({ method: "POST" })
  .inputValidator((input: { html: string }) => input)
  .handler(
    async ({ data }): Promise<{ html: string }> => ({
      html: sanitizeHtml(data.html),
    }),
  );

export type { MailMessageDetail };
