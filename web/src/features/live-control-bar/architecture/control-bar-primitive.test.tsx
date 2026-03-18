import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ControlBarAddon, ControlBarFullConfig } from "./control-bar-types";

vi.mock("~/components/ui/separator", () => ({
  Separator: () => <hr data-testid="separator" />,
}));

vi.mock("../components/control-bar-classes", () => ({
  CB: { shellContent: "shell-content" },
}));

vi.mock("../components/control-bar-state.css", () => ({}));

import { ControlBarPrimitive } from "./control-bar-primitive";

function renderPrimitive(overrides: Partial<ControlBarFullConfig> = {}) {
  const defaults: ControlBarFullConfig = {
    centerContent: <span>center</span>,
    addons: [],
    statusAction: <span>status</span>,
    isExpanded: true,
    onStatusClick: vi.fn(),
  };
  return renderToStaticMarkup(<ControlBarPrimitive {...defaults} {...overrides} />);
}

describe("ControlBarPrimitive", () => {
  it("renders addons sorted by priority with separators between them", () => {
    const addons: ControlBarAddon[] = [
      { key: "b", priority: 1, content: <div>addon-b</div> },
      { key: "a", priority: 0, content: <div>addon-a</div> },
    ];
    const html = renderPrimitive({ addons });

    const addonAIndex = html.indexOf("addon-a");
    const addonBIndex = html.indexOf("addon-b");
    expect(addonAIndex).toBeGreaterThan(-1);
    expect(addonBIndex).toBeGreaterThan(-1);
    expect(addonAIndex).toBeLessThan(addonBIndex);

    const separators = html.match(/data-testid="separator"/g);
    expect(separators).toHaveLength(2);
  });

  it("renders single addon with trailing separator only", () => {
    const addons: ControlBarAddon[] = [
      { key: "only", priority: 0, content: <div>single-addon</div> },
    ];
    const html = renderPrimitive({ addons });

    expect(html).toContain("single-addon");
    const separators = html.match(/data-testid="separator"/g);
    expect(separators).toHaveLength(1);
  });

  it("renders collapsed addon slot when addons array is empty", () => {
    const html = renderPrimitive({ addons: [] });

    expect(html).toContain("max-h-0");
    expect(html).toContain("opacity-0");
    expect(html).not.toContain("max-h-60");
  });

  it("renders expanded addon slot when addons are present", () => {
    const addons: ControlBarAddon[] = [{ key: "a", priority: 0, content: <div>addon</div> }];
    const html = renderPrimitive({ addons });

    expect(html).toContain("max-h-60");
    expect(html).toContain("opacity-100");
  });

  it("always renders the status button", () => {
    const html = renderPrimitive({ isExpanded: false });
    expect(html).toContain('aria-label="Toggle control bar"');
    expect(html).toContain("status");
  });
});
