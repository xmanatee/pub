import type { ReactNode } from "react";

export interface ControlBarAddon {
  key: string;
  priority: number;
  content: ReactNode;
}

interface ControlBarLayoutConfig {
  leftAction?: ReactNode;
  centerContent: ReactNode;
  rightAction?: ReactNode;
  addons: ControlBarAddon[];
  statusAction: ReactNode;
}

interface ControlBarSurfaceConfig {
  isExpanded: boolean;
  onStatusClick: () => void;
  className?: string;
  shellStyle?: React.CSSProperties;
}

export interface ControlBarFullConfig extends ControlBarLayoutConfig, ControlBarSurfaceConfig {}
