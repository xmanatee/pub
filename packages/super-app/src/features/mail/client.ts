import { invoke } from "~/core/pub";
import * as cmd from "./commands";
import { sanitizeMailHtml } from "./server";

export const mailApi = {
  list: async (query = "in:inbox", max = 30): Promise<cmd.MailListResult> =>
    cmd.parseMailListResult(await invoke(cmd.listInbox, { query, max: String(max) })),
  read: async (id: string): Promise<cmd.MailMessageDetail> => {
    const detail = cmd.parseMailMessageDetail(await invoke(cmd.readMessage, { id }));
    if (detail.bodyHtml) {
      const { html } = await sanitizeMailHtml({ data: { html: detail.bodyHtml } });
      return { ...detail, bodyHtml: html };
    }
    return detail;
  },
  archive: (id: string): Promise<void> => invoke(cmd.archiveMessage, { id }),
  trash: (id: string): Promise<void> => invoke(cmd.trashMessage, { id }),
  markRead: (id: string): Promise<void> => invoke(cmd.markAsRead, { id }),
  star: (id: string): Promise<void> => invoke(cmd.starMessage, { id }),
  draft: (to: string, subject: string, body: string): Promise<void> =>
    invoke(cmd.sendDraft, { to, subject, body }),
  send: (to: string, subject: string, body: string): Promise<void> =>
    invoke(cmd.sendMessage, { to, subject, body }),
};
