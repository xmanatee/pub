import {
  type CommandFunctionSpec,
  parseCommandFunctionList,
} from "~/features/live/lib/command-protocol";

export interface CanvasManifest {
  v: number;
  manifestId: string;
  functions: CommandFunctionSpec[];
}

export function parseCanvasManifest(html: string): CanvasManifest | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const node = doc.querySelector('script[type="application/pubblue-command-manifest+json"]');
  if (!node) return null;
  const raw = (node.textContent || "").trim();
  if (raw.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;

  const manifestId =
    typeof record.manifestId === "string" && record.manifestId.length > 0
      ? record.manifestId
      : `manifest-${Date.now().toString(36)}`;

  const functions = parseCommandFunctionList(record.functions);

  return {
    v: typeof record.version === "number" ? record.version : 1,
    manifestId,
    functions,
  };
}
