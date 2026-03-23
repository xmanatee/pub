import { createMessageDedup } from "../../../../shared/message-dedup-core";
import type { BufferedEntry } from "./shared.js";

interface BridgeEntryQueueParams {
  onBatch: (entries: BufferedEntry[]) => Promise<void>;
  onProcessingStart: () => void;
  onProcessingEnd: () => void;
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

      const raw = queue.splice(0);
      const entries: BufferedEntry[] = [];
      for (const entry of raw) {
        if (!dedup.isDuplicate(`${entry.channel}:${entry.msg.id}`)) {
          entries.push(entry);
        }
      }
      if (entries.length === 0) continue;

      params.onProcessingStart();
      try {
        await params.onBatch(entries);
      } finally {
        params.onProcessingEnd();
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
