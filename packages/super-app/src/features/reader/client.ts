import type { ReaderResult } from "./commands";
import { simplify } from "./server";

export const reader = {
  simplify: (url: string, html: string): Promise<ReaderResult> => simplify({ data: { url, html } }),
};
