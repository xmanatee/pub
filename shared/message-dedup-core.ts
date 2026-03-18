/**
 * Two-generation message deduplication.
 *
 * Uses two sets (current + previous) to provide bounded memory with graceful
 * eviction. When the current set exceeds half the max size, it becomes the
 * previous set and a fresh current set is created. Lookups check both sets,
 * guaranteeing at least 50 % history retention at all times — unlike a naive
 * Set.clear() which drops 100 % at the boundary.
 */

export interface MessageDedup {
  /** Returns `true` if `key` was already seen; otherwise records it and returns `false`. */
  isDuplicate(key: string): boolean;
  /** Clears all tracked keys. */
  reset(): void;
  /** Returns the total number of tracked keys across both generations. */
  size(): number;
}

export function createMessageDedup(maxSize: number): MessageDedup {
  const halfMax = Math.max(1, Math.floor(maxSize / 2));
  let current = new Set<string>();
  let previous = new Set<string>();

  function isDuplicate(key: string): boolean {
    if (current.has(key) || previous.has(key)) return true;
    current.add(key);
    if (current.size >= halfMax) {
      previous = current;
      current = new Set<string>();
    }
    return false;
  }

  function reset(): void {
    current = new Set<string>();
    previous = new Set<string>();
  }

  function size(): number {
    return current.size + previous.size;
  }

  return { isDuplicate, reset, size };
}
