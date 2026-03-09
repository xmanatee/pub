/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContentHtml } from "./use-content-html";

const parseMock = vi.fn<(content: string) => string | Promise<string>>();
(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("marked", () => ({
  marked: {
    parse: parseMock,
  },
}));

function HookHarness({
  content,
  contentType,
  onChange,
}: {
  content?: string;
  contentType?: string;
  onChange: (value: ReturnType<typeof useContentHtml>) => void;
}) {
  const value = useContentHtml(content, contentType);

  useEffect(() => {
    onChange(value);
  }, [onChange, value]);

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  parseMock.mockReset();
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

describe("useContentHtml", () => {
  it("falls back to escaped plain text when markdown rendering fails", async () => {
    const states: Array<ReturnType<typeof useContentHtml>> = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValueOnce(new Error("markdown failed"));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          content={"# Hello\n<script>alert(1)</script>"}
          contentType="markdown"
          onChange={(value) => states.push(value)}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const latest = states.at(-1);
    expect(latest?.status).toBe("ready");
    expect(latest?.html).toContain("# Hello");
    expect(latest?.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to render markdown content",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
