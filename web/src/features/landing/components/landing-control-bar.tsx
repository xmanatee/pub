import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ControlBarHost,
  useControlBarBaseLayer,
  useControlBarChrome,
} from "~/components/control-bar/control-bar-controller";
import { ControlBarLabel, ControlBarPanel } from "~/components/control-bar/control-bar-parts";
import { controlBarToneStyle } from "~/components/control-bar/control-bar-tone";
import { Button } from "~/components/ui/button";
import { trackCtaClicked } from "~/lib/analytics";

const LANDING_BAR_TONE = {
  backgroundSize: "180%",
  colorA: "rgba(28, 199, 255, 0.55)",
  colorB: "rgba(77, 158, 255, 0.45)",
  colorC: "rgba(72, 232, 174, 0.35)",
  opacity: 0.65,
  speedMs: 6800,
};

export function LandingControlBar() {
  const baseLayer = useMemo(
    () => ({
      mainContent: (
        <ControlBarPanel>
          <ControlBarLabel className="px-2 text-foreground">
            Take 5 minutes to try it with your agent.
          </ControlBarLabel>
          <Button
            asChild
            variant="default"
            className="h-10 shrink-0 rounded-full px-4 text-xs font-semibold"
            onClick={() => trackCtaClicked({ cta: "sign_in", location: "floating_control_bar" })}
          >
            <Link to="/login">Sign in</Link>
          </Button>
        </ControlBarPanel>
      ),
    }),
    [],
  );

  useControlBarBaseLayer(baseLayer);
  useControlBarChrome({
    expanded: true,
    shellStyle: controlBarToneStyle(LANDING_BAR_TONE),
  });

  return <ControlBarHost />;
}
