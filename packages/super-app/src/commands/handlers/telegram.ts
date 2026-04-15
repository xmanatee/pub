import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import type { TelegramAuthState, TelegramDialog, TelegramMessage } from "../results";

const SESSION_PATH = path.join(os.homedir(), ".pub-super-app", "telegram-session");
const API_ID = Number(process.env.TELEGRAM_API_ID ?? "0");
const API_HASH = process.env.TELEGRAM_API_HASH ?? "";

interface PendingAuth {
  phone: string;
  phoneCodeHash: string;
}

interface TelegramRuntime {
  client: TelegramClient | null;
  pending: PendingAuth | null;
  needsPassword: boolean;
}

// Preserved across Vite HMR so the live client + half-finished auth flow
// survive handler or manifest edits. Falls back to a fresh object when `hot`
// is unavailable (e.g. production build).
const hotData = (import.meta.hot?.data ?? {}) as { telegram?: TelegramRuntime };
if (!hotData.telegram) {
  hotData.telegram = { client: null, pending: null, needsPassword: false };
}
const state: TelegramRuntime = hotData.telegram;

async function loadSession(): Promise<string> {
  try {
    return await fs.readFile(SESSION_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

async function saveSession(session: string): Promise<void> {
  await fs.mkdir(path.dirname(SESSION_PATH), { recursive: true });
  await fs.writeFile(SESSION_PATH, session, { mode: 0o600 });
}

function ensureCreds(): void {
  if (!API_ID || !API_HASH) {
    throw new Error(
      "Set TELEGRAM_API_ID and TELEGRAM_API_HASH (get from https://my.telegram.org/apps).",
    );
  }
}

async function getClient(connect = true): Promise<TelegramClient> {
  if (state.client) {
    if (connect && !state.client.connected) await state.client.connect();
    return state.client;
  }
  ensureCreds();
  const sessionString = await loadSession();
  const client = new TelegramClient(new StringSession(sessionString), API_ID, API_HASH, {
    connectionRetries: 3,
    useWSS: true,
  });
  if (connect) await client.connect();
  state.client = client;
  return client;
}

export async function authState(): Promise<TelegramAuthState> {
  if (!API_ID || !API_HASH) return { status: "logged-out" };
  if (state.pending && !state.needsPassword) {
    return {
      status: "code-sent",
      phone: state.pending.phone,
      phoneCodeHash: state.pending.phoneCodeHash,
    };
  }
  if (state.needsPassword) {
    return { status: "needs-password" };
  }
  const client = await getClient();
  const authed = await client.checkAuthorization().catch(() => false);
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

export async function authSendCode(params: { phone: string }): Promise<TelegramAuthState> {
  if (!params.phone) throw new Error("phone is required");
  const client = await getClient();
  const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, params.phone);
  state.pending = { phone: params.phone, phoneCodeHash: result.phoneCodeHash };
  state.needsPassword = false;
  return { status: "code-sent", phone: params.phone, phoneCodeHash: result.phoneCodeHash };
}

export async function authVerify(params: {
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
  await saveSession(String(client.session.save()));
  return authState();
}

export async function authPassword(params: { password: string }): Promise<TelegramAuthState> {
  const client = await getClient();
  await client.signInWithPassword(
    { apiId: API_ID, apiHash: API_HASH },
    {
      password: async () => params.password,
      onError: (e) => {
        throw e;
      },
    },
  );
  state.needsPassword = false;
  state.pending = null;
  await saveSession(String(client.session.save()));
  return authState();
}

export async function authLogout(): Promise<TelegramAuthState> {
  const client = await getClient();
  await client.invoke(new Api.auth.LogOut());
  state.client = null;
  state.pending = null;
  state.needsPassword = false;
  await fs.rm(SESSION_PATH, { force: true });
  return { status: "logged-out" };
}

export async function dialogs(
  params: { limit?: number } = {},
): Promise<{ dialogs: TelegramDialog[] }> {
  const client = await getClient();
  const result = await client.getDialogs({ limit: params.limit ?? 50 });
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

function toMessage(m: Api.Message): TelegramMessage {
  let mediaType: TelegramMessage["mediaType"] = null;
  if (m.media) {
    if (m.media instanceof Api.MessageMediaPhoto) mediaType = "photo";
    else if (m.media instanceof Api.MessageMediaDocument) {
      const doc = m.media.document as Api.Document | undefined;
      const attrs = doc?.attributes ?? [];
      if (attrs.some((a) => a instanceof Api.DocumentAttributeAudio && a.voice))
        mediaType = "voice";
      else if (attrs.some((a) => a instanceof Api.DocumentAttributeAudio)) mediaType = "audio";
      else if (attrs.some((a) => a instanceof Api.DocumentAttributeVideo)) mediaType = "video";
      else mediaType = "document";
    }
  }
  return {
    id: m.id,
    from: m.sender ? ((m.sender as Api.User).firstName ?? null) : null,
    text: m.message ?? "",
    date: m.date,
    out: Boolean(m.out),
    mediaType,
  };
}

export async function messages(params: {
  dialogId: string;
  limit?: number;
}): Promise<{ messages: TelegramMessage[] }> {
  const client = await getClient();
  const entity = await client.getEntity(params.dialogId);
  const list = await client.getMessages(entity, { limit: params.limit ?? 50 });
  return { messages: list.map(toMessage) };
}

export async function send(params: { dialogId: string; text: string }): Promise<{ id: number }> {
  const client = await getClient();
  const entity = await client.getEntity(params.dialogId);
  const result = await client.sendMessage(entity, { message: params.text });
  return { id: result.id };
}

export async function search(params: {
  dialogId?: string;
  query: string;
  limit?: number;
}): Promise<{ messages: TelegramMessage[] }> {
  const client = await getClient();
  if (params.dialogId) {
    const entity = await client.getEntity(params.dialogId);
    const list = await client.getMessages(entity, {
      search: params.query,
      limit: params.limit ?? 30,
    });
    return { messages: list.map(toMessage) };
  }
  const list = await client.getMessages(undefined, {
    search: params.query,
    limit: params.limit ?? 30,
  });
  return { messages: list.map(toMessage) };
}
