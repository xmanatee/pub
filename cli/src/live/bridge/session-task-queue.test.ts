import { describe, expect, it } from "vitest";
import { createSessionTaskQueue } from "./session-task-queue.js";

describe("createSessionTaskQueue", () => {
  it("runs tasks sequentially in the order they were enqueued", async () => {
    const queueSessionTask = createSessionTaskQueue();
    const events: string[] = [];

    const a = queueSessionTask(async () => {
      events.push("a:start");
      await new Promise((r) => setTimeout(r, 20));
      events.push("a:end");
    });
    const b = queueSessionTask(async () => {
      events.push("b:start");
      events.push("b:end");
    });

    await Promise.all([a, b]);
    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("runs subsequent tasks even when a prior task rejects", async () => {
    const queueSessionTask = createSessionTaskQueue();
    const observed: string[] = [];

    const first = queueSessionTask(async () => {
      throw new Error("boom");
    });
    const second = queueSessionTask(async () => {
      observed.push("second ran");
      return 42;
    });

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe(42);
    expect(observed).toEqual(["second ran"]);
  });

  it("propagates task return values", async () => {
    const queueSessionTask = createSessionTaskQueue();
    const result = await queueSessionTask(async () => "hello");
    expect(result).toBe("hello");
  });
});
