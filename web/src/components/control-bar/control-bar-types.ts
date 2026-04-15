import type { CSSProperties, ReactNode } from "react";

export interface ControlBarAddon {
  key: string;
  priority?: number;
  content: ReactNode;
}

export interface ControlBarNotificationConfig {
  key: string;
  ariaLabel?: string;
  content: ReactNode;
  label: ReactNode;
  labelClassName?: string;
  onClick?: () => void;
  priority?: number;
}

export interface ControlBarStatusButtonConfig {
  ariaLabel?: string;
  content: ReactNode;
  onClick?: () => void;
}

/**
 * Stable composition order for layers pushed by every control-bar consumer.
 * Higher numbers take precedence in {@link resolveLayer}; insertion order tie-breaks.
 */
export const CONTROL_BAR_PRIORITY = {
  shell: 0,
  landing: 0,
  live: 10,
  fullscreenPrompt: 20,
  liveTransient: 30,
} as const;

export type ControlBarPriority = (typeof CONTROL_BAR_PRIORITY)[keyof typeof CONTROL_BAR_PRIORITY];

/**
 * What a consumer pushes via `useControlBarLayer`. `priority` is required and
 * decides composition. All other fields are optional — `resolveLayer` merges
 * them with lower-priority layers, so a layer can override one field
 * (e.g. `mainContent`) without clobbering the others.
 */
export interface ControlBarLayerInput {
  addons?: readonly ControlBarAddon[];
  backdropOnClick?: () => void;
  backdropVisible?: boolean;
  className?: string;
  expanded?: boolean;
  leftAction?: ReactNode;
  mainContent: ReactNode;
  priority: ControlBarPriority;
  rightAction?: ReactNode;
  shellStyle?: CSSProperties;
  statusButton?: ControlBarStatusButtonConfig;
}

/**
 * What the surface receives after {@link resolveLayer} folds the stack.
 * Defaults are applied here so the surface never has to second-guess.
 */
export interface ResolvedControlBarLayer {
  addons?: readonly ControlBarAddon[];
  backdropOnClick?: () => void;
  backdropVisible: boolean;
  className?: string;
  expanded: boolean;
  leftAction?: ReactNode;
  mainContent: ReactNode;
  rightAction?: ReactNode;
  shellStyle?: CSSProperties;
  statusButton?: ControlBarStatusButtonConfig;
}

export type ControlBarSurfaceProps = Omit<
  ResolvedControlBarLayer,
  "backdropOnClick" | "backdropVisible"
>;
