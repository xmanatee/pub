import { createMessageDedup } from "../../../../shared/message-dedup-core";
import { errorMessage } from "../../core/errors/cli-error.js";
import type { BufferedEntry } from "./shared.js";

interface BridgeEntryQueueParams {
  onEntry: (entry: BufferedEntry) => Promise<void>;
  onError: (error: unknown, entry: BufferedEntry) => void;
}

interface BridgeEntryQueue {
  enqueue(entries: BufferedEntry[]): void;
  stop(): Promise<void>;
}

export function createBridgeEntryQueue(params: BridgeEntryQueueParams): BridgeEntryQueue {
  const queue: BufferedEntry[] = [];
  const dedup = createMessageDedup(10_000);
  let notify: (() => void) | null = null;
  let stopping = false;

  const enqueue = (entries: BufferedEntry[]): void => {
    if (stopping) return;
    queue.push(...entries);
    notify?.();
    notify = null;
  };

  const loopDone = (async () => {
    while (!stopping) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        if (stopping) break;
      }

      const batch = queue.splice(0);
      for (const entry of batch) {
        if (stopping) break;

        if (dedup.isDuplicate(`${entry.channel}:${entry.msg.id}`)) continue;

        try {
          await params.onEntry(entry);
        } catch (error) {
          params.onError(error instanceof Error ? error : new Error(errorMessage(error)), entry);
        }
      }
    }
  })();

  return {
    enqueue,
    async stop(): Promise<void> {
      stopping = true;
      notify?.();
      notify = null;
      await loopDone;
    },
  };
}
