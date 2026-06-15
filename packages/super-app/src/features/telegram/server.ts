/**
 * Server-side Telegram client. The browser calls these TanStack Start server
 * functions; GramJS, API credentials, and the StringSession stay in the local
 * Node process.
 */
import { createServerFn } from "@tanstack/react-start";
import { Api, TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { StringSession } from "telegram/sessions";
import { readFeatureConfig } from "~/core/config.server";
import { expandHome } from "~/core/paths";
import type {
  TelegramAuthState,
  TelegramConfig,
  TelegramDialog,
  TelegramMessage,
  TelegramPeerInfo,
  TelegramUpload,
} from "./commands";

const SESSION_PATH = "~/.pub-super-app/telegram-session.txt";
const SESSION_FILE_MODE = 0o600;

interface Runtime {
  client: TelegramClient | null;
  pending: { phone: string; phoneCodeHash: string } | null;
  needsPassword: boolean;
}

const runtime: Runtime = {
  client: null,
  pending: null,
  needsPassword: false,
};

async function loadSessionFs() {
  const [fs, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  return { fs, path };
}

async function loadSession(): Promise<string> {
  const { fs } = await loadSessionFs();
  try {
    return (await fs.readFile(expandHome(SESSION_PATH), "utf8")).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

async function saveSession(session: string): Promise<void> {
  const { fs, path } = await loadSessionFs();
  const file = expandHome(SESSION_PATH);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, session, { mode: SESSION_FILE_MODE });
  await fs.chmod(file, SESSION_FILE_MODE);
}

async function clearSession(): Promise<void> {
  const { fs } = await loadSessionFs();
  await fs.rm(expandHome(SESSION_PATH), { force: true });
}

async function loadCreds(): Promise<{ apiId: number; apiHash: string } | null> {
  const cfg = (await readFeatureConfig("telegram")) as TelegramConfig | null;
  if (!cfg || typeof cfg.apiId !== "number" || typeof cfg.apiHash !== "string" || !cfg.apiHash) {
    return null;
  }
  return { apiId: cfg.apiId, apiHash: cfg.apiHash };
}

async function requireCreds(): Promise<{ apiId: number; apiHash: string }> {
  const creds = await loadCreds();
  if (!creds) {
    throw new Error("Telegram not configured. Open Settings to add apiId / apiHash.");
  }
  return creds;
}

async function getClient(): Promise<TelegramClient> {
  if (runtime.client) {
    if (!runtime.client.connected) await runtime.client.connect();
    return runtime.client;
  }
  const { apiId, apiHash } = await requireCreds();
  const client = new TelegramClient(new StringSession(await loadSession()), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: true,
  });
  await client.connect();
  runtime.client = client;
  return client;
}

function asRecord(input: unknown, name: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${name} input must be an object`);
  }
  return input as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} is required`);
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}

function optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${key} must be a number`);
  return value;
}

function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

function numberArray(input: Record<string, unknown>, key: string): number[] {
  const value = input[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "number")) {
    throw new Error(`${key} must be a number array`);
  }
  return value;
}

function uploadInput(value: unknown): TelegramUpload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("file is required");
  }
  const file = value as Partial<TelegramUpload>;
  if (
    typeof file.filename !== "string" ||
    typeof file.mime !== "string" ||
    typeof file.base64 !== "string"
  ) {
    throw new Error("file must include filename, mime, and base64");
  }
  return { filename: file.filename, mime: file.mime, base64: file.base64 };
}

function detectMediaType(message: Api.Message): TelegramMessage["mediaType"] {
  if (!message.media) return null;
  if (message.media instanceof Api.MessageMediaPhoto) return "photo";
  if (message.media instanceof Api.MessageMediaDocument) {
    const doc = message.media.document as Api.Document | undefined;
    const attrs = doc?.attributes ?? [];
    if (attrs.some((attr) => attr instanceof Api.DocumentAttributeAudio && attr.voice))
      return "voice";
    if (attrs.some((attr) => attr instanceof Api.DocumentAttributeAudio)) return "audio";
    if (attrs.some((attr) => attr instanceof Api.DocumentAttributeVideo && attr.roundMessage)) {
      return "video-note";
    }
    if (attrs.some((attr) => attr instanceof Api.DocumentAttributeVideo)) return "video";
    return "document";
  }
  return null;
}

function toMessage(message: Api.Message): TelegramMessage {
  const reactions: TelegramMessage["reactions"] = [];
  const raw = (message.reactions as Api.MessageReactions | undefined)?.results;
  if (raw) {
    for (const reactionResult of raw) {
      const reaction = reactionResult.reaction as
        | Api.ReactionEmoji
        | Api.ReactionCustomEmoji
        | undefined;
      const emoticon = reaction instanceof Api.ReactionEmoji ? reaction.emoticon : "*";
      reactions.push({
        emoticon,
        count: reactionResult.count,
        chosen: Boolean(reactionResult.chosenOrder !== undefined),
      });
    }
  }
  const replyHeader = message.replyTo as Api.MessageReplyHeader | undefined;
  return {
    id: message.id,
    from: message.sender ? ((message.sender as Api.User).firstName ?? null) : null,
    text: message.message ?? "",
    date: message.date,
    out: Boolean(message.out),
    mediaType: detectMediaType(message),
    replyToId: replyHeader?.replyToMsgId ?? null,
    editDate: message.editDate ?? null,
    pinned: Boolean(message.pinned),
    reactions,
  };
}

function toDialog(
  dialog: Awaited<ReturnType<TelegramClient["getDialogs"]>>[number],
): TelegramDialog {
  const entity = dialog.entity;
  let title = "";
  if (entity instanceof Api.User) {
    title =
      [entity.firstName, entity.lastName].filter(Boolean).join(" ") || entity.username || "User";
  } else if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
    title = entity.title || "";
  } else {
    title = dialog.title ?? "";
  }
  return {
    id: String(dialog.id),
    title,
    unread: dialog.unreadCount ?? 0,
    lastMessage: dialog.message?.message ?? null,
    date: dialog.date ?? 0,
    isUser: dialog.isUser,
    isGroup: dialog.isGroup,
    isChannel: dialog.isChannel,
  };
}

async function fetchMuted(client: TelegramClient, entity: Api.TypeEntityLike): Promise<boolean> {
  const inputPeer = await client.getInputEntity(entity);
  const settings = (await client.invoke(
    new Api.account.GetNotifySettings({ peer: new Api.InputNotifyPeer({ peer: inputPeer }) }),
  )) as Api.PeerNotifySettings;
  const until = settings.muteUntil ?? 0;
  return until > Math.floor(Date.now() / 1000);
}

async function getAuthState(): Promise<TelegramAuthState> {
  const creds = await loadCreds();
  if (!creds) return { status: "not-configured" };
  if (runtime.pending && !runtime.needsPassword) {
    return {
      status: "code-sent",
      phone: runtime.pending.phone,
      phoneCodeHash: runtime.pending.phoneCodeHash,
    };
  }
  if (runtime.needsPassword) return { status: "needs-password" };
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

export const telegramAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<TelegramAuthState> => getAuthState(),
);

export const telegramSendCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.sendCode");
    return { phone: requiredString(data, "phone") };
  })
  .handler(async ({ data }): Promise<TelegramAuthState> => {
    const { apiId, apiHash } = await requireCreds();
    const client = await getClient();
    const result = await client.sendCode({ apiId, apiHash }, data.phone);
    runtime.pending = { phone: data.phone, phoneCodeHash: result.phoneCodeHash };
    runtime.needsPassword = false;
    return { status: "code-sent", phone: data.phone, phoneCodeHash: result.phoneCodeHash };
  });

export const telegramVerify = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.verify");
    return {
      phone: requiredString(data, "phone"),
      phoneCodeHash: requiredString(data, "phoneCodeHash"),
      code: requiredString(data, "code"),
    };
  })
  .handler(async ({ data }): Promise<TelegramAuthState> => {
    const client = await getClient();
    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: data.phone,
          phoneCodeHash: data.phoneCodeHash,
          phoneCode: data.code,
        }),
      );
    } catch (err) {
      if ((err as { errorMessage?: string }).errorMessage === "SESSION_PASSWORD_NEEDED") {
        runtime.needsPassword = true;
        return { status: "needs-password" };
      }
      throw err;
    }
    runtime.pending = null;
    runtime.needsPassword = false;
    await saveSession(String(client.session.save()));
    return getAuthState();
  });

export const telegramPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.password");
    return { password: requiredString(data, "password") };
  })
  .handler(async ({ data }): Promise<TelegramAuthState> => {
    const { apiId, apiHash } = await requireCreds();
    const client = await getClient();
    await client.signInWithPassword(
      { apiId, apiHash },
      {
        password: async () => data.password,
        onError: (err) => {
          throw err;
        },
      },
    );
    runtime.needsPassword = false;
    runtime.pending = null;
    await saveSession(String(client.session.save()));
    return getAuthState();
  });

export const telegramLogout = createServerFn({ method: "POST" }).handler(
  async (): Promise<TelegramAuthState> => {
    const client = await getClient();
    await client.invoke(new Api.auth.LogOut());
    runtime.client = null;
    runtime.pending = null;
    runtime.needsPassword = false;
    await clearSession();
    return { status: "logged-out" };
  },
);

export const telegramDialogs = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input ?? {}, "telegram.dialogs");
    return { limit: optionalNumber(data, "limit") ?? 50 };
  })
  .handler(async ({ data }): Promise<{ dialogs: TelegramDialog[] }> => {
    const client = await getClient();
    const dialogs = await client.getDialogs({ limit: data.limit });
    return { dialogs: dialogs.map(toDialog) };
  });

export const telegramMessages = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.messages");
    return {
      dialogId: requiredString(data, "dialogId"),
      limit: optionalNumber(data, "limit") ?? 50,
    };
  })
  .handler(async ({ data }): Promise<{ messages: TelegramMessage[] }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    const list = await client.getMessages(entity, { limit: data.limit });
    return { messages: list.map(toMessage) };
  });

export const telegramSearchMessages = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.searchMessages");
    return {
      dialogId: requiredString(data, "dialogId"),
      query: requiredString(data, "query"),
      limit: optionalNumber(data, "limit") ?? 50,
    };
  })
  .handler(async ({ data }): Promise<{ messages: TelegramMessage[] }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    const list = await client.getMessages(entity, { limit: data.limit, search: data.query });
    return { messages: list.map(toMessage) };
  });

export const telegramPeer = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.peer");
    return { dialogId: requiredString(data, "dialogId") };
  })
  .handler(async ({ data }): Promise<TelegramPeerInfo> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    const muted = await fetchMuted(client, entity);
    if (entity instanceof Api.User) {
      const full = (await client.invoke(
        new Api.users.GetFullUser({ id: entity }),
      )) as Api.users.UserFull;
      return {
        id: data.dialogId,
        title:
          [entity.firstName, entity.lastName].filter(Boolean).join(" ") ||
          entity.username ||
          "User",
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
        id: data.dialogId,
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
        id: data.dialogId,
        title: entity.title,
        kind: entity.megagroup ? "group" : "channel",
        username: entity.username ?? undefined,
        about: full.about ?? undefined,
        memberCount: full.participantsCount,
        muted,
      };
    }
    throw new Error("unsupported peer type");
  });

export const telegramSend = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.send");
    return {
      dialogId: requiredString(data, "dialogId"),
      text: requiredString(data, "text"),
      replyTo: optionalNumber(data, "replyTo"),
    };
  })
  .handler(async ({ data }): Promise<{ id: number }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    const result = await client.sendMessage(entity, { message: data.text, replyTo: data.replyTo });
    return { id: result.id };
  });

export const telegramSendFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.sendFile");
    return {
      dialogId: requiredString(data, "dialogId"),
      file: uploadInput(data.file),
      caption: optionalString(data, "caption"),
      replyTo: optionalNumber(data, "replyTo"),
    };
  })
  .handler(async ({ data }): Promise<{ id: number | null }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    const buffer = Buffer.from(data.file.base64, "base64");
    const file = new CustomFile(data.file.filename, buffer.length, "", buffer);
    const result = await client.sendFile(entity, {
      file,
      caption: data.caption ?? "",
      replyTo: data.replyTo,
    });
    return { id: result.id ?? null };
  });

export const telegramEdit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.edit");
    return {
      dialogId: requiredString(data, "dialogId"),
      id: optionalNumber(data, "id"),
      text: requiredString(data, "text"),
    };
  })
  .handler(async ({ data }): Promise<{ id: number }> => {
    if (data.id === undefined) throw new Error("id is required");
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    await client.editMessage(entity, { message: data.id, text: data.text });
    return { id: data.id };
  });

export const telegramDelete = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.delete");
    return { dialogId: requiredString(data, "dialogId"), ids: numberArray(data, "ids") };
  })
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    await client.deleteMessages(entity, data.ids, { revoke: true });
    return { deleted: data.ids.length };
  });

export const telegramForward = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.forward");
    return {
      fromDialogId: requiredString(data, "fromDialogId"),
      toDialogId: requiredString(data, "toDialogId"),
      ids: numberArray(data, "ids"),
    };
  })
  .handler(async ({ data }): Promise<{ forwarded: number }> => {
    const client = await getClient();
    const fromEntity = await client.getEntity(data.fromDialogId);
    const toEntity = await client.getEntity(data.toDialogId);
    await client.forwardMessages(toEntity, { messages: data.ids, fromPeer: fromEntity });
    return { forwarded: data.ids.length };
  });

export const telegramReact = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.react");
    return {
      dialogId: requiredString(data, "dialogId"),
      id: optionalNumber(data, "id"),
      emoticon: optionalString(data, "emoticon") ?? null,
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (data.id === undefined) throw new Error("id is required");
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    const reaction = data.emoticon
      ? [new Api.ReactionEmoji({ emoticon: data.emoticon })]
      : undefined;
    await client.invoke(
      new Api.messages.SendReaction({
        peer: entity,
        msgId: data.id,
        reaction,
        addToRecent: true,
      }),
    );
    return { ok: true };
  });

export const telegramPin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.pin");
    return { dialogId: requiredString(data, "dialogId"), id: optionalNumber(data, "id") };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (data.id === undefined) throw new Error("id is required");
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    await client.pinMessage(entity, data.id, { notify: false });
    return { ok: true };
  });

export const telegramUnpin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.unpin");
    return { dialogId: requiredString(data, "dialogId"), id: optionalNumber(data, "id") };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (data.id === undefined) throw new Error("id is required");
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    await client.unpinMessage(entity, data.id);
    return { ok: true };
  });

export const telegramMarkRead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.markRead");
    return {
      dialogId: requiredString(data, "dialogId"),
      maxId: optionalNumber(data, "maxId"),
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    await client.markAsRead(entity, data.maxId);
    return { ok: true };
  });

export const telegramDownloadMedia = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.downloadMedia");
    return { dialogId: requiredString(data, "dialogId"), id: optionalNumber(data, "id") };
  })
  .handler(
    async ({ data }): Promise<{ dataUrl: string; mime: string | null; filename: string }> => {
      if (data.id === undefined) throw new Error("id is required");
      const client = await getClient();
      const entity = await client.getEntity(data.dialogId);
      const [message] = await client.getMessages(entity, { ids: [data.id] });
      if (!message?.media) throw new Error("message has no media");
      const buffer = await client.downloadMedia(message.media);
      if (!buffer) throw new Error("download returned empty buffer");
      const doc =
        message.media instanceof Api.MessageMediaDocument ? (message.media.document ?? null) : null;
      const mime = doc instanceof Api.Document ? (doc.mimeType ?? null) : null;
      const bytes = Buffer.from(buffer as Uint8Array);
      return {
        dataUrl: `data:${mime ?? "application/octet-stream"};base64,${bytes.toString("base64")}`,
        mime,
        filename: `${data.dialogId}_${data.id}`,
      };
    },
  );

export const telegramMute = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.mute");
    return {
      dialogId: requiredString(data, "dialogId"),
      enabled: optionalBoolean(data, "enabled") ?? false,
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    const inputPeer = await client.getInputEntity(entity);
    await client.invoke(
      new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer: inputPeer }),
        settings: new Api.InputPeerNotifySettings({
          muteUntil: data.enabled ? 2_147_483_647 : 0,
        }),
      }),
    );
    return { ok: true };
  });

export const telegramBlock = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.block");
    return { dialogId: requiredString(data, "dialogId") };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    await client.invoke(new Api.contacts.Block({ id: await client.getInputEntity(entity) }));
    return { ok: true };
  });

export const telegramUnblock = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.unblock");
    return { dialogId: requiredString(data, "dialogId") };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    await client.invoke(new Api.contacts.Unblock({ id: await client.getInputEntity(entity) }));
    return { ok: true };
  });

export const telegramArchive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.archive");
    return {
      dialogId: requiredString(data, "dialogId"),
      archived: optionalBoolean(data, "archived") ?? false,
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    await client.invoke(
      new Api.folders.EditPeerFolders({
        folderPeers: [
          new Api.InputFolderPeer({
            peer: await client.getInputEntity(entity),
            folderId: data.archived ? 1 : 0,
          }),
        ],
      }),
    );
    return { ok: true };
  });

export const telegramLeave = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = asRecord(input, "telegram.leave");
    return { dialogId: requiredString(data, "dialogId") };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = await getClient();
    const entity = await client.getEntity(data.dialogId);
    if (entity instanceof Api.Channel) {
      await client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
    } else if (entity instanceof Api.Chat) {
      const me = (await client.getMe()) as Api.User;
      await client.invoke(new Api.messages.DeleteChatUser({ chatId: entity.id, userId: me }));
    }
    return { ok: true };
  });
