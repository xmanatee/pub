import type {
  TelegramAuthState,
  TelegramDialog,
  TelegramMessage,
  TelegramPeerInfo,
  TelegramUpload,
} from "./commands";
import {
  telegramArchive,
  telegramAuthState,
  telegramBlock,
  telegramDelete,
  telegramDialogs,
  telegramDownloadMedia,
  telegramEdit,
  telegramForward,
  telegramLeave,
  telegramLogout,
  telegramMarkRead,
  telegramMessages,
  telegramMute,
  telegramPassword,
  telegramPeer,
  telegramPin,
  telegramReact,
  telegramSearchMessages,
  telegramSend,
  telegramSendCode,
  telegramSendFile,
  telegramUnblock,
  telegramUnpin,
  telegramVerify,
} from "./server";

async function fileToUpload(file: File): Promise<TelegramUpload> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  return {
    filename: file.name || "upload",
    mime: file.type || "application/octet-stream",
    base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
  };
}

export const telegram = {
  authState: (): Promise<TelegramAuthState> => telegramAuthState(),
  sendCode: (phone: string): Promise<TelegramAuthState> => telegramSendCode({ data: { phone } }),
  verify: (params: {
    phone: string;
    phoneCodeHash: string;
    code: string;
  }): Promise<TelegramAuthState> => telegramVerify({ data: params }),
  password: (password: string): Promise<TelegramAuthState> =>
    telegramPassword({ data: { password } }),
  logout: (): Promise<TelegramAuthState> => telegramLogout(),
  dialogs: (limit = 50): Promise<{ dialogs: TelegramDialog[] }> =>
    telegramDialogs({ data: { limit } }),
  messages: (dialogId: string, limit = 50): Promise<{ messages: TelegramMessage[] }> =>
    telegramMessages({ data: { dialogId, limit } }),
  searchMessages: (
    dialogId: string,
    query: string,
    limit = 50,
  ): Promise<{ messages: TelegramMessage[] }> =>
    telegramSearchMessages({ data: { dialogId, query, limit } }),
  peer: (dialogId: string): Promise<TelegramPeerInfo> => telegramPeer({ data: { dialogId } }),
  send: (dialogId: string, text: string, replyTo?: number): Promise<{ id: number }> =>
    telegramSend({ data: { dialogId, text, replyTo } }),
  sendFile: async (
    dialogId: string,
    file: File,
    caption?: string,
    replyTo?: number,
  ): Promise<{ id: number | null }> =>
    telegramSendFile({ data: { dialogId, file: await fileToUpload(file), caption, replyTo } }),
  edit: (dialogId: string, id: number, text: string): Promise<{ id: number }> =>
    telegramEdit({ data: { dialogId, id, text } }),
  delete: (dialogId: string, ids: number[]): Promise<{ deleted: number }> =>
    telegramDelete({ data: { dialogId, ids } }),
  forward: (
    fromDialogId: string,
    toDialogId: string,
    ids: number[],
  ): Promise<{ forwarded: number }> => telegramForward({ data: { fromDialogId, toDialogId, ids } }),
  react: (dialogId: string, id: number, emoticon: string | null): Promise<{ ok: true }> =>
    telegramReact({ data: { dialogId, id, emoticon } }),
  pin: (dialogId: string, id: number): Promise<{ ok: true }> =>
    telegramPin({ data: { dialogId, id } }),
  unpin: (dialogId: string, id: number): Promise<{ ok: true }> =>
    telegramUnpin({ data: { dialogId, id } }),
  markRead: (dialogId: string, maxId?: number): Promise<{ ok: true }> =>
    telegramMarkRead({ data: { dialogId, maxId } }),
  downloadMedia: (
    dialogId: string,
    id: number,
  ): Promise<{ dataUrl: string; mime: string | null; filename: string }> =>
    telegramDownloadMedia({ data: { dialogId, id } }),
  mute: (dialogId: string, enabled: boolean): Promise<{ ok: true }> =>
    telegramMute({ data: { dialogId, enabled } }),
  block: (dialogId: string): Promise<{ ok: true }> => telegramBlock({ data: { dialogId } }),
  unblock: (dialogId: string): Promise<{ ok: true }> => telegramUnblock({ data: { dialogId } }),
  archive: (dialogId: string, archived: boolean): Promise<{ ok: true }> =>
    telegramArchive({ data: { dialogId, archived } }),
  leave: (dialogId: string): Promise<{ ok: true }> => telegramLeave({ data: { dialogId } }),
};
