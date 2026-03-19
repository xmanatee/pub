export function readSdkAssistantText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  if (!("type" in message)) return "";

  const { type } = message as { type: unknown };

  if (type === "assistant") return readAssistantMessage(message);
  if (type === "stream_event") return readStreamEvent(message);

  return "";
}

function readAssistantMessage(msg: Record<string, unknown>): string {
  if (!("message" in msg)) return "";

  const { message } = msg as { message: unknown };
  if (!message || typeof message !== "object") return "";
  if (!("content" in message)) return "";

  const { content } = message as { content: unknown };
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      if (!("type" in block) || block.type !== "text") return "";
      if (!("text" in block) || typeof block.text !== "string") return "";
      return block.text;
    })
    .join("");
}

function readStreamEvent(msg: Record<string, unknown>): string {
  if (!("event" in msg)) return "";

  const { event } = msg as { event: unknown };
  if (!event || typeof event !== "object") return "";
  if (!("type" in event) || event.type !== "content_block_delta") return "";
  if (!("delta" in event)) return "";

  const { delta } = event as { delta: unknown };
  if (!delta || typeof delta !== "object") return "";
  if (!("type" in delta) || delta.type !== "text_delta") return "";
  if (!("text" in delta) || typeof delta.text !== "string") return "";

  return delta.text;
}
