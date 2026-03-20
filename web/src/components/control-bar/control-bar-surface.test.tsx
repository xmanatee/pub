import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ControlBarAddon, ControlBarSurfaceProps } from "./control-bar-types";

vi.mock("~/components/ui/separator", () => ({
  Separator: () => <hr data-testid="separator" />,
}));

vi.mock("./control-bar-state.css", () => ({}));

import { ControlBarSurface } from "./control-bar-surface";

function renderSurface(overrides: Partial<ControlBarSurfaceProps> = {}) {
  const defaults: ControlBarSurfaceProps = {
    expanded: true,
    mainContent: <span>center</span>,
    addons: [],
    statusButton: {
      content: <span>status</span>,
      onClick: vi.fn(),
    },
  };
  return renderToStaticMarkup(<ControlBarSurface {...defaults} {...overrides} />);
}

describe("ControlBarSurface", () => {
  it("renders addons sorted by priority with separators", () => {
    const addons: ControlBarAddon[] = [
      { key: "b", priority: 1, content: <div>addon-b</div> },
      { key: "a", priority: 0, content: <div>addon-a</div> },
    ];
    const html = renderSurface({ addons });

    expect(html.indexOf("addon-a")).toBeLessThan(html.indexOf("addon-b"));
    expect(html.match(/data-testid="separator"/g)).toHaveLength(2);
  });

  it("renders a hidden addon slot when addons are absent", () => {
    const html = renderSurface({ addons: [] });

    expect(html).toContain("max-h-0");
    expect(html).not.toContain("max-h-60");
  });

  it("renders the status button when configured", () => {
    const html = renderSurface({ expanded: false });

    expect(html).toContain('aria-label="Toggle control bar"');
    expect(html).toContain("status");
  });
});
