import { invoke } from "~/core/pub";
import type { MailMessage, MailMessageDetail } from "./commands";
import * as cmd from "./commands";
import { sanitizeMailHtml } from "./server";

export const mailApi = {
  list: (query = "in:inbox", max = 30): Promise<{ messages: MailMessage[] }> =>
    invoke(cmd.listInbox, { query, max: String(max) }),
  read: async (id: string): Promise<MailMessageDetail> => {
    const detail = await invoke<MailMessageDetail>(cmd.readMessage, { id });
    if (detail.bodyHtml) {
      const { html } = await sanitizeMailHtml({ data: { html: detail.bodyHtml } });
      return { ...detail, bodyHtml: html };
    }
    return detail;
  },
  archive: (id: string): Promise<void> => invoke(cmd.archiveMessage, { id }),
  trash: (id: string): Promise<void> => invoke(cmd.trashMessage, { id }),
  markRead: (id: string): Promise<void> => invoke(cmd.markAsRead, { id }),
  draft: (to: string, subject: string, body: string): Promise<void> =>
    invoke(cmd.sendDraft, { to, subject, body }),
  send: (to: string, subject: string, body: string): Promise<void> =>
    invoke(cmd.sendMessage, { to, subject, body }),
};
