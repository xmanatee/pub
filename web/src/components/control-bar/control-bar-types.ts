import type { ReactNode } from "react";

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
  hidden?: boolean;
  onClick?: () => void;
}

export interface ControlBarLayerConfig {
  addons?: ControlBarAddon[];
  className?: string;
  leftAction?: ReactNode;
  mainContent: ReactNode;
  rightAction?: ReactNode;
}

export interface ControlBarChromeConfig {
  backdropOnClick?: () => void;
  backdropVisible?: boolean;
  expanded?: boolean;
  shellStyle?: React.CSSProperties;
  statusButton?: ControlBarStatusButtonConfig;
}

export interface ControlBarSurfaceProps {
  addons?: ControlBarAddon[];
  className?: string;
  expanded: boolean;
  leftAction?: ReactNode;
  mainContent: ReactNode;
  rightAction?: ReactNode;
  shellStyle?: React.CSSProperties;
  statusButton?: ControlBarStatusButtonConfig;
}
