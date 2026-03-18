import { describe, expect, it } from "vitest";
import { createMessageDedup } from "./message-dedup-core";

describe("createMessageDedup", () => {
  it("detects duplicate keys", () => {
    const dedup = createMessageDedup(100);
    expect(dedup.isDuplicate("a")).toBe(false);
    expect(dedup.isDuplicate("a")).toBe(true);
    expect(dedup.isDuplicate("b")).toBe(false);
    expect(dedup.isDuplicate("b")).toBe(true);
  });

  it("retains previous generation after eviction", () => {
    // maxSize=10 → halfMax=5, so eviction triggers when current reaches 5
    const dedup = createMessageDedup(10);

    // Fill current set with 4 keys (under threshold)
    for (let i = 0; i < 4; i++) {
      expect(dedup.isDuplicate(`key-${i}`)).toBe(false);
    }
    expect(dedup.size()).toBe(4);

    // 5th key triggers rotation: current → previous, new current created
    expect(dedup.isDuplicate("key-4")).toBe(false);
    // key-4 was added to current before rotation, so it's now in previous
    // After rotation current is empty (fresh set)

    // Keys from previous generation are still detected as duplicates
    expect(dedup.isDuplicate("key-0")).toBe(true);
    expect(dedup.isDuplicate("key-3")).toBe(true);
    expect(dedup.isDuplicate("key-4")).toBe(true);
  });

  it("evicts oldest generation when second rotation happens", () => {
    const dedup = createMessageDedup(10); // halfMax=5

    // Generation 1: fill with keys 0-4
    for (let i = 0; i < 5; i++) {
      dedup.isDuplicate(`gen1-${i}`);
    }
    // Rotation happened: gen1 keys are in previous

    // Generation 2: fill with keys 0-4
    for (let i = 0; i < 5; i++) {
      dedup.isDuplicate(`gen2-${i}`);
    }
    // Second rotation: gen2 keys are now in previous, gen1 keys are gone

    // gen1 keys are no longer detected
    expect(dedup.isDuplicate("gen1-0")).toBe(false);
    expect(dedup.isDuplicate("gen1-3")).toBe(false);

    // gen2 keys are still detected (they're in previous)
    expect(dedup.isDuplicate("gen2-0")).toBe(true);
    expect(dedup.isDuplicate("gen2-4")).toBe(true);
  });

  it("reset clears both generations", () => {
    const dedup = createMessageDedup(100);
    dedup.isDuplicate("a");
    dedup.isDuplicate("b");
    expect(dedup.size()).toBe(2);

    dedup.reset();
    expect(dedup.size()).toBe(0);
    expect(dedup.isDuplicate("a")).toBe(false);
    expect(dedup.isDuplicate("b")).toBe(false);
  });

  it("size tracks keys across both generations", () => {
    const dedup = createMessageDedup(10); // halfMax=5

    // Fill current with 4 keys
    for (let i = 0; i < 4; i++) {
      dedup.isDuplicate(`key-${i}`);
    }
    expect(dedup.size()).toBe(4);

    // 5th key triggers rotation
    dedup.isDuplicate("key-4");
    // previous has 5, current is empty
    // But the rotation clears current, so size = 5 (previous)
    // Actually: after rotation, key-4 is in previous (current was moved).
    // current = new Set(), so size = 0 + 5 = 5
    expect(dedup.size()).toBe(5);

    // Add more to current
    dedup.isDuplicate("key-5");
    expect(dedup.size()).toBe(6);
  });

  it("handles maxSize of 1 gracefully", () => {
    const dedup = createMessageDedup(1); // halfMax=1
    expect(dedup.isDuplicate("a")).toBe(false);
    // Rotation triggered immediately (current.size >= 1)
    // "a" is now in previous
    expect(dedup.isDuplicate("a")).toBe(true);
    expect(dedup.isDuplicate("b")).toBe(false);
    // "b" triggers rotation: "b" → previous, "a" is gone
    expect(dedup.isDuplicate("a")).toBe(false);
  });
});
