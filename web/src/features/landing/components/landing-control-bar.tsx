import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Blob } from "~/components/blob/blob";
import {
  ControlBarHost,
  useControlBarBaseLayer,
  useControlBarChrome,
} from "~/components/control-bar/control-bar-controller";
import { ControlBarLabel, ControlBarPanel } from "~/components/control-bar/control-bar-parts";
import { controlBarToneStyle } from "~/components/control-bar/control-bar-tone";
import { Button } from "~/components/ui/button";
import { trackCtaClicked } from "~/lib/analytics";

const LANDING_BLOB_TONE = {
  coreScale: 1,
  energy: 0.64,
  glow: 0.44,
  hueA: 184,
  hueB: 207,
  hueC: 160,
  saturation: 0.9,
  speedMs: 7800,
};

const LANDING_BAR_TONE = {
  backgroundSize: "180%",
  colorA: "rgba(28, 199, 255, 0.55)",
  colorB: "rgba(77, 158, 255, 0.45)",
  colorC: "rgba(72, 232, 174, 0.35)",
  opacity: 0.65,
  speedMs: 6800,
};

function useLandingBarVisibility() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      setVisible(window.scrollY > Math.max(window.innerHeight * 0.4, 220));
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return visible;
}

export function LandingControlBar() {
  const visible = useLandingBarVisibility();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (visible) {
      setExpanded(true);
      return;
    }
    setExpanded(false);
  }, [visible]);

  const baseLayer = useMemo(
    () => ({
      mainContent: (
        <ControlBarPanel>
          <ControlBarLabel className="px-2 text-foreground">
            Connect to Pub and start a private session with your agent.
          </ControlBarLabel>
          <Button
            asChild
            className="h-10 shrink-0 rounded-full px-4 text-xs font-medium"
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
    expanded: visible && expanded,
    shellStyle: controlBarToneStyle(LANDING_BAR_TONE),
    statusButton: {
      ariaLabel: expanded ? "Hide control bar" : "Show control bar",
      content: (
        <div className="h-full w-full bg-background/60">
          <Blob tone={LANDING_BLOB_TONE} dimmed={!expanded} />
        </div>
      ),
      hidden: !visible,
      onClick: () => setExpanded((current) => !current),
    },
  });

  return <ControlBarHost />;
}
