import type { ReactNode } from "react";
import type { ControlBarTone } from "~/components/control-bar/control-bar-tone";
import { useLiveControlBarBridge } from "~/features/live-control-bar/hooks/use-live-control-bar-bridge";

interface ControlBarProps {
  initialInput?: string;
  shellTone?: ControlBarTone | null;
  statusButtonContent?: ReactNode;
}

/** Pushes the live-session layer via the bridge hook; rendering happens in the root host. */
export function ControlBar(props: ControlBarProps) {
  useLiveControlBarBridge(props);
  return null;
}
