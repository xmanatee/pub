/**
 * Cross-feature navigation. Source features call `dispatch(action, context)`;
 * the destination feature reads `useIncomingTarget(serviceId)` from the
 * provider, applies the context (e.g. prefills the compose form), and clears
 * it once consumed.
 *
 * This is the productivity-app glue: "draft email from this telegram message"
 * flows through here, not through ad-hoc state-passing.
 */
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import type { CrossFeatureContext, ServiceAction } from "./registry";
import { findService } from "./registry";

export interface DispatchedTarget {
  action: ServiceAction;
  context: CrossFeatureContext;
}

interface TargetContextValue {
  dispatch: (action: ServiceAction, context: CrossFeatureContext) => void;
  current: DispatchedTarget | null;
  consume: () => void;
}

const TargetContext = React.createContext<TargetContextValue | null>(null);

export function TargetNavigationProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = React.useState<DispatchedTarget | null>(null);
  const navigate = useNavigate();

  const dispatch = React.useCallback(
    (action: ServiceAction, context: CrossFeatureContext) => {
      const destination = destinationFor(action);
      if (!destination) return;
      setCurrent({ action, context });
      navigate({ to: destination.route });
    },
    [navigate],
  );

  const consume = React.useCallback(() => setCurrent(null), []);

  return (
    <TargetContext.Provider value={{ dispatch, current, consume }}>
      {children}
    </TargetContext.Provider>
  );
}

function destinationFor(action: ServiceAction) {
  switch (action) {
    case "draft-email":
      return findService("mail");
    case "create-event":
      return findService("calendar");
    case "create-task":
      return findService("tasks");
    case "create-note":
      return findService("notes");
    case "draft-telegram":
      return findService("telegram");
  }
}

/** Source side: dispatch a cross-feature action. */
export function useDispatchTarget(): TargetContextValue["dispatch"] {
  const ctx = React.useContext(TargetContext);
  if (!ctx) throw new Error("useDispatchTarget must be used within <TargetNavigationProvider>");
  return ctx.dispatch;
}

/**
 * Destination side: read an incoming target intended for `serviceId`. Returns
 * `null` if no incoming context applies. Caller must invoke `consume()` after
 * applying it (so navigating away later doesn't re-trigger).
 */
export function useIncomingTarget(serviceId: string): {
  target: DispatchedTarget | null;
  consume: () => void;
} {
  const ctx = React.useContext(TargetContext);
  if (!ctx) throw new Error("useIncomingTarget must be used within <TargetNavigationProvider>");
  const matching =
    ctx.current && intendedFor(ctx.current.action) === serviceId ? ctx.current : null;
  return { target: matching, consume: ctx.consume };
}

function intendedFor(action: ServiceAction): string | null {
  return destinationFor(action)?.id ?? null;
}
