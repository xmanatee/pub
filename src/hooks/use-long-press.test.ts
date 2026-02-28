import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createState,
  endTouch,
  fire,
  handleContextMenu,
  handlePointerDown,
  handlePointerMove,
} from "./long-press-logic";

describe("long-press logic", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires callback on contextmenu", () => {
    const state = createState();
    const onActivate = vi.fn();
    handleContextMenu(state, onActivate);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("fires callback after 500ms touch hold", () => {
    const state = createState();
    const onActivate = vi.fn();
    handlePointerDown(state, "touch", 0, 0, onActivate);
    expect(onActivate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("does not fire if cancelled before 500ms", () => {
    const state = createState();
    const onActivate = vi.fn();
    handlePointerDown(state, "touch", 0, 0, onActivate);
    vi.advanceTimersByTime(300);
    endTouch(state);
    vi.advanceTimersByTime(500);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("cancels if pointer moves beyond threshold", () => {
    const state = createState();
    const onActivate = vi.fn();
    handlePointerDown(state, "touch", 0, 0, onActivate);
    handlePointerMove(state, 15, 0);
    vi.advanceTimersByTime(500);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("ignores mouse pointer down (only touch triggers timer)", () => {
    const state = createState();
    const onActivate = vi.fn();
    handlePointerDown(state, "mouse", 0, 0, onActivate);
    vi.advanceTimersByTime(500);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("does not double-fire when timer triggers before contextmenu", () => {
    const state = createState();
    const onActivate = vi.fn();
    handlePointerDown(state, "touch", 0, 0, onActivate);
    vi.advanceTimersByTime(500);
    expect(onActivate).toHaveBeenCalledOnce();
    handleContextMenu(state, onActivate);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("fire prevents double-firing", () => {
    const state = createState();
    const onActivate = vi.fn();
    fire(state, onActivate);
    fire(state, onActivate);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("standalone right-click fires even after a prior completed gesture", () => {
    const state = createState();
    const onActivate = vi.fn();
    handlePointerDown(state, "touch", 0, 0, onActivate);
    vi.advanceTimersByTime(500);
    endTouch(state);
    handleContextMenu(state, onActivate);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("ignores contextmenu from a canceled touch gesture", () => {
    const state = createState();
    const onActivate = vi.fn();
    handlePointerDown(state, "touch", 0, 0, onActivate);
    handlePointerMove(state, 15, 0);
    handleContextMenu(state, onActivate);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
