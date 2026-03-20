import type { ReactNode } from "react";
import { ControlBarHost } from "~/components/control-bar/control-bar-controller";
import type { ControlBarTone } from "~/components/control-bar/control-bar-tone";
import { useLiveControlBarBridge } from "~/features/live-control-bar/hooks/use-live-control-bar-bridge";

interface ControlBarProps {
  initialInput?: string;
  shellTone?: ControlBarTone | null;
  statusButtonContent?: ReactNode;
}

export function ControlBar({ initialInput, shellTone, statusButtonContent }: ControlBarProps) {
  useLiveControlBarBridge({ initialInput, shellTone, statusButtonContent });
  return <ControlBarHost />;
}
