/**
 * The Surface's `shellContent` is the **only** visible chrome (border, bg, shadow,
 * blur, rounding). Inner primitives like {@link ControlBarPanel} are layout-only
 * to avoid nested-pill artefacts. Keep it that way: never re-add chrome inside.
 */
export const CONTROL_BAR_STYLES = {
  actionButton: "shrink-0",
  backButton: "border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl",
  controlBar: "flex w-full items-center gap-1.5 px-1.5",
  controlHeight: "min-h-12",
  shellContent:
    "border border-border/70 bg-background/86 shadow-lg backdrop-blur-xl transition-all duration-300 rounded-3xl",
} as const;
