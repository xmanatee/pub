/**
 * Tracker — JSON store lives server-side (`server.ts`); AI categorization
 * uses the centralized prompt in `core/ai/prompts.categorize`.
 */
export interface TrackerEntry {
  id: string;
  createdAt: number;
  updatedAt: number | null;
  text: string;
  category: string | null;
}

export const DEFAULT_CATEGORIES = ["work", "exercise", "meal", "errand", "study", "rest", "other"];
