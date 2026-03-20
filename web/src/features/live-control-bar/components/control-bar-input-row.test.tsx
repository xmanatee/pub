/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/components/ui/tooltip";
import { ControlBarInputRow } from "./control-bar-input-row";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  const currentRoot = root;
  if (currentRoot) {
    await act(async () => {
      currentRoot.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

describe("ControlBarInputRow", () => {
  it("starts recording when the record button is clicked", async () => {
    const onStartRecording = vi.fn();

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <TooltipProvider>
          <ControlBarInputRow
            fileInputRef={{ current: null }}
            hasText={false}
            input=""
            onFileChange={() => {}}
            onFocus={() => {}}
            onInputChange={() => {}}
            onInputKeyDown={() => {}}
            onSend={() => {}}
            onStartRecording={onStartRecording}
            onStartVoiceMode={() => {}}
            sendDisabled={false}
            visualState="idle"
            voiceModeEnabled={false}
          />
        </TooltipProvider>,
      );
    });

    const button = container?.querySelector('button[aria-label="Record audio"]');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("record button not found");
    }

    await act(async () => {
      button.click();
    });

    expect(onStartRecording).toHaveBeenCalledTimes(1);
  });
});
