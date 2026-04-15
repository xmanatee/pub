import type { TrackerEntry } from "./commands";
import { addTracker, deleteTracker, listTracker } from "./server";

export const tracker = {
  list: (): Promise<{ entries: TrackerEntry[] }> => listTracker(),
  add: (text: string, category: string | null): Promise<{ entry: TrackerEntry }> =>
    addTracker({ data: { text, category } }),
  delete: (id: string): Promise<{ id: string }> => deleteTracker({ data: { id } }),
};
