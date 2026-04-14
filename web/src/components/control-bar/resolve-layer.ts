import { cn } from "~/lib/utils";
import type { ControlBarLayerInput, ResolvedControlBarLayer } from "./control-bar-types";

/**
 * Fold every pushed layer into a single resolved layer.
 *
 * Composition rules:
 *   - Layers are sorted by `priority` ascending; insertion order tie-breaks (last-pushed wins).
 *   - Each scalar field uses the highest-priority layer that defines it. Lower-priority
 *     layers fill in undefined fields — so a high-priority layer can override `mainContent`
 *     while still inheriting `addons` and `statusButton` from below. **This is the
 *     load-bearing invariant**: removing it breaks the fullscreen-prompt + preview
 *     interaction and similar partial overrides.
 *   - `className` composes (via `cn`) so multi-layer styling stacks rather than clobbers.
 *
 * Returns undefined when no layer defines `mainContent`.
 */
export function resolveLayer(
  layers: readonly ControlBarLayerInput[],
): ResolvedControlBarLayer | undefined {
  if (layers.length === 0) return undefined;
  const sorted = [...layers].sort((a, b) => a.priority - b.priority);

  let mainContent: ControlBarLayerInput["mainContent"] | undefined;
  let addons: ControlBarLayerInput["addons"];
  let backdropOnClick: ControlBarLayerInput["backdropOnClick"];
  let backdropVisible: boolean | undefined;
  const classNames: string[] = [];
  let expanded: boolean | undefined;
  let leftAction: ControlBarLayerInput["leftAction"];
  let rightAction: ControlBarLayerInput["rightAction"];
  let shellStyle: ControlBarLayerInput["shellStyle"];
  let statusButton: ControlBarLayerInput["statusButton"];

  for (const layer of sorted) {
    if (layer.mainContent !== undefined) mainContent = layer.mainContent;
    if (layer.addons !== undefined) addons = layer.addons;
    if (layer.backdropOnClick !== undefined) backdropOnClick = layer.backdropOnClick;
    if (layer.backdropVisible !== undefined) backdropVisible = layer.backdropVisible;
    if (layer.className !== undefined) classNames.push(layer.className);
    if (layer.expanded !== undefined) expanded = layer.expanded;
    if (layer.leftAction !== undefined) leftAction = layer.leftAction;
    if (layer.rightAction !== undefined) rightAction = layer.rightAction;
    if (layer.shellStyle !== undefined) shellStyle = layer.shellStyle;
    if (layer.statusButton !== undefined) statusButton = layer.statusButton;
  }

  if (mainContent === undefined) return undefined;

  return {
    addons,
    backdropOnClick,
    backdropVisible: backdropVisible ?? false,
    className: classNames.length > 0 ? cn(...classNames) : undefined,
    expanded: expanded ?? true,
    leftAction,
    mainContent,
    rightAction,
    shellStyle,
    statusButton,
  };
}
