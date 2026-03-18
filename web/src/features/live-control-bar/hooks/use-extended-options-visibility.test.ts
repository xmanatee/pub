import { describe, expect, it } from "vitest";
import {
  type ExtendedOptionsEvent,
  extendedOptionsReducer,
} from "./use-extended-options-visibility";

function apply(initial: boolean, ...events: ExtendedOptionsEvent[]): boolean {
  return events.reduce(extendedOptionsReducer, initial);
}

describe("extendedOptionsReducer", () => {
  it("shows on bar expansion", () => {
    expect(apply(false, { type: "bar-expanded" })).toBe(true);
  });

  it("hides on bar collapse", () => {
    expect(apply(true, { type: "bar-collapsed" })).toBe(false);
  });

  it("hides on dismiss", () => {
    expect(apply(true, { type: "dismiss" })).toBe(false);
  });

  it("stays hidden after dismiss even if bar-expanded is not re-sent", () => {
    const visible = apply(true, { type: "dismiss" });
    expect(visible).toBe(false);
    // No bar-expanded event → stays false
  });

  it("re-shows after collapse → expand cycle", () => {
    expect(
      apply(true, { type: "dismiss" }, { type: "bar-collapsed" }, { type: "bar-expanded" }),
    ).toBe(true);
  });

  it("full lifecycle: expand → dismiss → collapse → expand", () => {
    let state = false;

    state = extendedOptionsReducer(state, { type: "bar-expanded" });
    expect(state).toBe(true);

    state = extendedOptionsReducer(state, { type: "dismiss" });
    expect(state).toBe(false);

    // Bar still expanded — no change
    state = extendedOptionsReducer(state, { type: "dismiss" });
    expect(state).toBe(false);

    // Collapse and re-expand
    state = extendedOptionsReducer(state, { type: "bar-collapsed" });
    expect(state).toBe(false);

    state = extendedOptionsReducer(state, { type: "bar-expanded" });
    expect(state).toBe(true);
  });
});
