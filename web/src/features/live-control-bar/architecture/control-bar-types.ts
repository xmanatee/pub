import type { ReactNode } from "react";

export interface ControlBarLayoutConfig {
  leftAction?: ReactNode;
  centerContent: ReactNode;
  rightAction?: ReactNode;
  topAddon?: ReactNode;
  statusAction?: ReactNode;
}

export interface ControlBarSurfaceConfig {
  isExpanded: boolean;
  onStatusClick?: () => void;
  className?: string;
  shellStyle?: React.CSSProperties;
}

export interface ControlBarFullConfig extends ControlBarLayoutConfig, ControlBarSurfaceConfig {}
