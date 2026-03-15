import { errorMessage } from "../../core/errors/cli-error.js";
import { type BufferedEntry, MAX_SEEN_IDS } from "./shared.js";

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
  const seenIds = new Set<string>();
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

        const entryKey = `${entry.channel}:${entry.msg.id}`;
        if (seenIds.has(entryKey)) continue;
        seenIds.add(entryKey);
        if (seenIds.size > MAX_SEEN_IDS) {
          seenIds.clear();
        }

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
