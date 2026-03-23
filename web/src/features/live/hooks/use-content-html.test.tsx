/** @vitest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useContentHtml } from "./use-content-html";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({
  content,
  loading = false,
  onChange,
}: {
  content?: string;
  loading?: boolean;
  onChange: (value: ReturnType<typeof useContentHtml>) => void;
}) {
  const value = useContentHtml(content, { loading });

  useEffect(() => {
    onChange(value);
  }, [onChange, value]);

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

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

describe("useContentHtml", () => {
  it("returns loading state while content is unresolved", async () => {
    const states: Array<ReturnType<typeof useContentHtml>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness content={undefined} loading onChange={(value) => states.push(value)} />,
      );
    });

    const latest = states.at(-1);
    expect(latest?.html).toBeNull();
    expect(latest?.status).toBe("loading");
  });

  it("returns empty state when content is missing after loading", async () => {
    const states: Array<ReturnType<typeof useContentHtml>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness content={undefined} onChange={(value) => states.push(value)} />,
      );
    });

    const latest = states.at(-1);
    expect(latest?.html).toBeNull();
    expect(latest?.status).toBe("empty");
  });

  it("returns html content as-is", async () => {
    const states: Array<ReturnType<typeof useContentHtml>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness content="<h1>Hello</h1>" onChange={(value) => states.push(value)} />,
      );
    });

    const latest = states.at(-1);
    expect(latest?.html).toBe("<h1>Hello</h1>");
    expect(latest?.status).toBe("ready");
  });
});
