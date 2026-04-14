import { describe, expect, it } from "vitest";
import { CONTROL_BAR_PRIORITY, type ControlBarLayerInput } from "./control-bar-types";
import { resolveLayer } from "./resolve-layer";

function layer(input: Partial<ControlBarLayerInput>): ControlBarLayerInput {
  return {
    priority: CONTROL_BAR_PRIORITY.live,
    mainContent: "default-main",
    ...input,
  };
}

describe("resolveLayer", () => {
  it("returns undefined when no layers are pushed", () => {
    expect(resolveLayer([])).toBeUndefined();
  });

  it("returns the only layer when one is pushed", () => {
    const resolved = resolveLayer([layer({ mainContent: "only" })]);
    expect(resolved?.mainContent).toBe("only");
  });

  it("higher-priority layer overrides lower-priority defined fields", () => {
    const low = layer({
      priority: CONTROL_BAR_PRIORITY.live,
      mainContent: "low-main",
      rightAction: "low-right",
    });
    const high = layer({
      priority: CONTROL_BAR_PRIORITY.fullscreenPrompt,
      mainContent: "high-main",
    });
    const resolved = resolveLayer([low, high]);
    expect(resolved?.mainContent).toBe("high-main");
    expect(resolved?.rightAction).toBe("low-right");
  });

  it("higher-priority layer with only mainContent inherits addons and statusButton — load-bearing invariant for the fullscreen-prompt + preview interaction", () => {
    const live = layer({
      priority: CONTROL_BAR_PRIORITY.live,
      mainContent: "live-input",
      addons: [{ key: "preview", content: "preview-notification" }],
      statusButton: { content: "blob", ariaLabel: "Toggle control bar" },
    });
    const prompt = layer({
      priority: CONTROL_BAR_PRIORITY.fullscreenPrompt,
      mainContent: "fullscreen-prompt",
    });
    const resolved = resolveLayer([live, prompt]);
    expect(resolved?.mainContent).toBe("fullscreen-prompt");
    expect(resolved?.addons).toEqual([{ key: "preview", content: "preview-notification" }]);
    expect(resolved?.statusButton?.ariaLabel).toBe("Toggle control bar");
  });

  it("equal-priority layers: last pushed wins", () => {
    const a = layer({ priority: CONTROL_BAR_PRIORITY.shell, mainContent: "first" });
    const b = layer({ priority: CONTROL_BAR_PRIORITY.shell, mainContent: "second" });
    expect(resolveLayer([a, b])?.mainContent).toBe("second");
  });

  it("composes className across all layers (not clobber)", () => {
    const a = layer({
      priority: CONTROL_BAR_PRIORITY.live,
      mainContent: "x",
      className: "base-style",
    });
    const b = layer({
      priority: CONTROL_BAR_PRIORITY.liveTransient,
      mainContent: "y",
      className: "override-style",
    });
    const className = resolveLayer([a, b])?.className ?? "";
    expect(className).toContain("base-style");
    expect(className).toContain("override-style");
  });

  it("defaults expanded to true when no layer specifies it", () => {
    expect(resolveLayer([layer({})])?.expanded).toBe(true);
  });

  it("defaults backdropVisible to false when no layer specifies it", () => {
    expect(resolveLayer([layer({})])?.backdropVisible).toBe(false);
  });

  it("explicit expanded=false overrides the default", () => {
    expect(resolveLayer([layer({ expanded: false })])?.expanded).toBe(false);
  });

  it("returns undefined if no layer defines mainContent", () => {
    // Synthetic case — input type requires mainContent, but defensive coverage.
    const invalid = { priority: CONTROL_BAR_PRIORITY.live } as ControlBarLayerInput;
    expect(resolveLayer([invalid])).toBeUndefined();
  });

  it("layer order in input array does not affect priority resolution", () => {
    const live = layer({
      priority: CONTROL_BAR_PRIORITY.live,
      mainContent: "live",
      addons: [{ key: "a", content: "addon" }],
    });
    const prompt = layer({
      priority: CONTROL_BAR_PRIORITY.fullscreenPrompt,
      mainContent: "prompt",
    });
    const resolvedA = resolveLayer([live, prompt]);
    const resolvedB = resolveLayer([prompt, live]);
    expect(resolvedA?.mainContent).toBe("prompt");
    expect(resolvedB?.mainContent).toBe("prompt");
    expect(resolvedA?.addons).toEqual(resolvedB?.addons);
  });
});
