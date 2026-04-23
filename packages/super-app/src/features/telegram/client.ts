/**
 * Browser-side gramjs client. Session is persisted in `localStorage` via
 * `StringSession`; API credentials are read from the super-app config file
 * (`~/.pub-super-app/config.json` → `telegram.apiId` / `telegram.apiHash`).
 * The client is created lazily on first use and kept on `globalThis` so
 * Vite HMR doesn't drop the logged-in session.
 */
import "~/core/node-polyfills";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { getFeatureConfig } from "~/core/config";
import type {
  TelegramAuthState,
  TelegramConfig,
  TelegramDialog,
  TelegramMessage,
  TelegramPeerInfo,
} from "./commands";

const SESSION_KEY = "pub-super-app:telegram-session";

interface Runtime {
  client: TelegramClient | null;
  pending: { phone: string; phoneCodeHash: string } | null;
  needsPassword: boolean;
  creds: { apiId: number; apiHash: string } | null;
}

const key = Symbol.for("pub-super-app:tg-runtime");
type Globals = typeof globalThis & { [k: symbol]: Runtime | undefined };
if (!(globalThis as Globals)[key]) {
  (globalThis as Globals)[key] = {
    client: null,
    pending: null,
    needsPassword: false,
    creds: null,
  };
}
const state: Runtime = (globalThis as Globals)[key] as Runtime;

function loadSession(): string {
  return localStorage.getItem(SESSION_KEY) ?? "";
}

function saveSession(s: string): void {
  localStorage.setItem(SESSION_KEY, s);
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

async function loadCreds(): Promise<{ apiId: number; apiHash: string } | null> {
  if (state.creds) return state.creds;
  const cfg = (await getFeatureConfig({ data: { name: "telegram" } })) as TelegramConfig | null;
  if (!cfg || typeof cfg.apiId !== "number" || !cfg.apiHash) return null;
  state.creds = { apiId: cfg.apiId, apiHash: cfg.apiHash };
  return state.creds;
}

async function requireCreds(): Promise<{ apiId: number; apiHash: string }> {
  const creds = await loadCreds();
  if (!creds) {
    throw new Error(
      'Telegram not configured. Add { apiId, apiHash } under "telegram" in ~/.pub-super-app/config.json.',
    );
  }
  return creds;
}

async function getClient(): Promise<TelegramClient> {
  if (state.client) {
    if (!state.client.connected) await state.client.connect();
    return state.client;
  }
  const { apiId, apiHash } = await requireCreds();
  const client = new TelegramClient(new StringSession(loadSession()), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: true,
  });
  await client.connect();
  state.client = client;
  return client;
}

// ---------- auth ----------

async function authState(): Promise<TelegramAuthState> {
  const creds = await loadCreds();
  if (!creds) return { status: "not-configured" };
  if (state.pending && !state.needsPassword) {
    return {
      status: "code-sent",
      phone: state.pending.phone,
      phoneCodeHash: state.pending.phoneCodeHash,
    };
  }
  if (state.needsPassword) return { status: "needs-password" };
  const client = await getClient();
  const authed = await client.checkAuthorization();
  if (!authed) return { status: "logged-out" };
  const me = (await client.getMe()) as Api.User;
  return {
    status: "logged-in",
    me: {
      id: String(me.id),
      username: me.username ?? undefined,
      firstName: me.firstName ?? undefined,
    },
  };
}

async function sendCode(phone: string): Promise<TelegramAuthState> {
  const { apiId, apiHash } = await requireCreds();
  const client = await getClient();
  const result = await client.sendCode({ apiId, apiHash }, phone);
  state.pending = { phone, phoneCodeHash: result.phoneCodeHash };
  state.needsPassword = false;
  return { status: "code-sent", phone, phoneCodeHash: result.phoneCodeHash };
}

async function verify(params: {
  phone: string;
  phoneCodeHash: string;
  code: string;
}): Promise<TelegramAuthState> {
  const client = await getClient();
  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: params.phone,
        phoneCodeHash: params.phoneCodeHash,
        phoneCode: params.code,
      }),
    );
  } catch (err) {
    if ((err as { errorMessage?: string }).errorMessage === "SESSION_PASSWORD_NEEDED") {
      state.needsPassword = true;
      return { status: "needs-password" };
    }
    throw err;
  }
  state.pending = null;
  state.needsPassword = false;
  saveSession(String(client.session.save()));
  return authState();
}

async function password(pw: string): Promise<TelegramAuthState> {
  const { apiId, apiHash } = await requireCreds();
  const client = await getClient();
  await client.signInWithPassword(
    { apiId, apiHash },
    {
      password: async () => pw,
      // Re-throw the real error instead of gramjs's generic AUTH_USER_CANCEL.
      onError: (err) => {
        throw err;
      },
    },
  );
  state.needsPassword = false;
  state.pending = null;
  saveSession(String(client.session.save()));
  return authState();
}

async function logout(): Promise<TelegramAuthState> {
  const client = await getClient();
  await client.invoke(new Api.auth.LogOut());
  state.client = null;
  state.pending = null;
  state.needsPassword = false;
  state.creds = null;
  clearSession();
  return { status: "logged-out" };
}

// ---------- reading ----------

function detectMediaType(m: Api.Message): TelegramMessage["mediaType"] {
  if (!m.media) return null;
  if (m.media instanceof Api.MessageMediaPhoto) return "photo";
  if (m.media instanceof Api.MessageMediaDocument) {
    const doc = m.media.document as Api.Document | undefined;
    const attrs = doc?.attributes ?? [];
    if (attrs.some((a) => a instanceof Api.DocumentAttributeAudio && a.voice)) return "voice";
    if (attrs.some((a) => a instanceof Api.DocumentAttributeAudio)) return "audio";
    if (attrs.some((a) => a instanceof Api.DocumentAttributeVideo)) return "video";
    return "document";
  }
  return null;
}

function toMessage(m: Api.Message): TelegramMessage {
  const reactions: TelegramMessage["reactions"] = [];
  const raw = (m.reactions as Api.MessageReactions | undefined)?.results;
  if (raw) {
    for (const r of raw) {
      const e = r.reaction as Api.ReactionEmoji | Api.ReactionCustomEmoji | undefined;
      const emoticon = e instanceof Api.ReactionEmoji ? e.emoticon : "⭐";
      reactions.push({ emoticon, count: r.count, chosen: Boolean(r.chosenOrder !== undefined) });
    }
  }
  const replyHeader = m.replyTo as Api.MessageReplyHeader | undefined;
  return {
    id: m.id,
    from: m.sender ? ((m.sender as Api.User).firstName ?? null) : null,
    text: m.message ?? "",
    date: m.date,
    out: Boolean(m.out),
    mediaType: detectMediaType(m),
    replyToId: replyHeader?.replyToMsgId ?? null,
    editDate: m.editDate ?? null,
    pinned: Boolean(m.pinned),
    reactions,
  };
}

async function dialogs(limit = 50): Promise<{ dialogs: TelegramDialog[] }> {
  const client = await getClient();
  const result = await client.getDialogs({ limit });
  const out: TelegramDialog[] = result.map((d) => {
    const entity = d.entity;
    let title = "";
    if (entity instanceof Api.User) {
      title =
        [entity.firstName, entity.lastName].filter(Boolean).join(" ") || entity.username || "User";
    } else if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
      title = entity.title || "";
    } else {
      title = d.title ?? "";
    }
    return {
      id: String(d.id),
      title,
      unread: d.unreadCount ?? 0,
      lastMessage: d.message?.message ?? null,
      date: d.date ?? 0,
      isUser: d.isUser,
      isGroup: d.isGroup,
      isChannel: d.isChannel,
    };
  });
  return { dialogs: out };
}

async function messages(dialogId: string, limit = 50): Promise<{ messages: TelegramMessage[] }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  const list = await client.getMessages(entity, { limit });
  return { messages: list.map(toMessage) };
}

async function fetchMuted(client: TelegramClient, entity: Api.TypeEntityLike): Promise<boolean> {
  const inputPeer = await client.getInputEntity(entity);
  const settings = (await client.invoke(
    new Api.account.GetNotifySettings({ peer: new Api.InputNotifyPeer({ peer: inputPeer }) }),
  )) as Api.PeerNotifySettings;
  const until = settings.muteUntil ?? 0;
  return until > Math.floor(Date.now() / 1000);
}

async function peer(dialogId: string): Promise<TelegramPeerInfo> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  const id = String(dialogId);
  const muted = await fetchMuted(client, entity);
  if (entity instanceof Api.User) {
    const full = (await client.invoke(
      new Api.users.GetFullUser({ id: entity }),
    )) as Api.users.UserFull;
    return {
      id,
      title:
        [entity.firstName, entity.lastName].filter(Boolean).join(" ") || entity.username || "User",
      kind: "user",
      username: entity.username ?? undefined,
      phone: entity.phone ?? undefined,
      about: full.fullUser.about ?? undefined,
      muted,
      blocked: Boolean(full.fullUser.blocked),
    };
  }
  if (entity instanceof Api.Chat) {
    return {
      id,
      title: entity.title,
      kind: "group",
      memberCount: entity.participantsCount,
      muted,
    };
  }
  if (entity instanceof Api.Channel) {
    const fullChat = (await client.invoke(
      new Api.channels.GetFullChannel({ channel: entity }),
    )) as Api.messages.ChatFull;
    const full = fullChat.fullChat as Api.ChannelFull;
    return {
      id,
      title: entity.title,
      kind: entity.megagroup ? "group" : "channel",
      username: entity.username ?? undefined,
      about: full.about ?? undefined,
      memberCount: full.participantsCount,
      muted,
    };
  }
  throw new Error("unsupported peer type");
}

// ---------- writing ----------

async function send(dialogId: string, text: string, replyTo?: number): Promise<{ id: number }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  const result = await client.sendMessage(entity, { message: text, replyTo });
  return { id: result.id };
}

async function editMessage(dialogId: string, id: number, text: string): Promise<{ id: number }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  await client.editMessage(entity, { message: id, text });
  return { id };
}

async function deleteMessages(dialogId: string, ids: number[]): Promise<{ deleted: number }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  await client.deleteMessages(entity, ids, { revoke: true });
  return { deleted: ids.length };
}

async function forwardMessages(
  fromDialogId: string,
  toDialogId: string,
  ids: number[],
): Promise<{ forwarded: number }> {
  const client = await getClient();
  const fromEntity = await client.getEntity(fromDialogId);
  const toEntity = await client.getEntity(toDialogId);
  await client.forwardMessages(toEntity, { messages: ids, fromPeer: fromEntity });
  return { forwarded: ids.length };
}

// ---------- reactions / pins / reads ----------

async function react(dialogId: string, id: number, emoticon: string | null): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  const reaction = emoticon ? [new Api.ReactionEmoji({ emoticon })] : undefined;
  await client.invoke(
    new Api.messages.SendReaction({
      peer: entity,
      msgId: id,
      reaction,
      addToRecent: true,
    }),
  );
  return { ok: true };
}

async function pin(dialogId: string, id: number): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  await client.pinMessage(entity, id, { notify: false });
  return { ok: true };
}

async function unpin(dialogId: string, id: number): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  await client.unpinMessage(entity, id);
  return { ok: true };
}

async function markRead(dialogId: string, maxId?: number): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  await client.markAsRead(entity, maxId);
  return { ok: true };
}

// ---------- media / mute / block / archive / leave ----------

async function downloadMedia(
  dialogId: string,
  id: number,
): Promise<{ dataUrl: string; mime: string | null; filename: string }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  const [message] = await client.getMessages(entity, { ids: [id] });
  if (!message?.media) throw new Error("message has no media");
  const buffer = await client.downloadMedia(message.media);
  if (!buffer) throw new Error("download returned empty buffer");
  const doc =
    message.media instanceof Api.MessageMediaDocument ? (message.media.document ?? null) : null;
  const mime = doc instanceof Api.Document ? (doc.mimeType ?? null) : null;
  const bytes = buffer as Uint8Array;
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const dataUrl = `data:${mime ?? "application/octet-stream"};base64,${btoa(binary)}`;
  const filename = `${dialogId}_${id}`;
  return { dataUrl, mime, filename };
}

async function mute(dialogId: string, enabled: boolean): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  const inputPeer = await client.getInputEntity(entity);
  await client.invoke(
    new Api.account.UpdateNotifySettings({
      peer: new Api.InputNotifyPeer({ peer: inputPeer }),
      settings: new Api.InputPeerNotifySettings({
        muteUntil: enabled ? 2_147_483_647 : 0,
      }),
    }),
  );
  return { ok: true };
}

async function block(dialogId: string): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  await client.invoke(new Api.contacts.Block({ id: await client.getInputEntity(entity) }));
  return { ok: true };
}

async function unblock(dialogId: string): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  await client.invoke(new Api.contacts.Unblock({ id: await client.getInputEntity(entity) }));
  return { ok: true };
}

async function archive(dialogId: string, archived: boolean): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  await client.invoke(
    new Api.folders.EditPeerFolders({
      folderPeers: [
        new Api.InputFolderPeer({
          peer: await client.getInputEntity(entity),
          folderId: archived ? 1 : 0,
        }),
      ],
    }),
  );
  return { ok: true };
}

async function leave(dialogId: string): Promise<{ ok: true }> {
  const client = await getClient();
  const entity = await client.getEntity(dialogId);
  if (entity instanceof Api.Channel) {
    await client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
  } else if (entity instanceof Api.Chat) {
    const me = (await client.getMe()) as Api.User;
    await client.invoke(new Api.messages.DeleteChatUser({ chatId: entity.id, userId: me }));
  }
  return { ok: true };
}

export const telegram = {
  authState,
  sendCode,
  verify,
  password,
  logout,
  dialogs,
  messages,
  peer,
  send,
  edit: editMessage,
  delete: deleteMessages,
  forward: forwardMessages,
  react,
  pin,
  unpin,
  markRead,
  downloadMedia,
  mute,
  block,
  unblock,
  archive,
  leave,
};
