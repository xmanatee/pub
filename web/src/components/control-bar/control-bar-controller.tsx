import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useReducer,
  useRef,
} from "react";
import { cn } from "~/lib/utils";
import { ControlBarSurface } from "./control-bar-surface";
import type { ControlBarLayerInput, ResolvedControlBarLayer } from "./control-bar-types";
import { resolveLayer } from "./resolve-layer";

interface ControlBarLayerEntry {
  id: string;
  layer: ControlBarLayerInput;
}

interface ControlBarController {
  popLayer: (id: string) => void;
  pushLayer: (layer: ControlBarLayerInput) => string;
  updateLayer: (id: string, layer: ControlBarLayerInput) => void;
}

type ControlBarAction =
  | { type: "PUSH"; entry: ControlBarLayerEntry }
  | { type: "UPDATE"; entry: ControlBarLayerEntry }
  | { type: "POP"; id: string };

const INITIAL_LAYERS: readonly ControlBarLayerEntry[] = [];

const ControlBarControllerContext = createContext<ControlBarController | null>(null);

function reducer(
  layers: readonly ControlBarLayerEntry[],
  action: ControlBarAction,
): readonly ControlBarLayerEntry[] {
  switch (action.type) {
    case "PUSH":
      return [...layers, action.entry];
    case "UPDATE":
      return layers.map((entry) => (entry.id === action.entry.id ? action.entry : entry));
    case "POP":
      return layers.filter((entry) => entry.id !== action.id);
  }
}

function ControlBarContexts({ children }: { children: ReactNode }) {
  const [layers, dispatch] = useReducer(reducer, INITIAL_LAYERS);
  const idRef = useRef(0);

  const controllerRef = useRef<ControlBarController>({
    popLayer: (id) => dispatch({ type: "POP", id }),
    pushLayer: (layer) => {
      const id = `cb-${idRef.current++}`;
      dispatch({ type: "PUSH", entry: { id, layer } });
      return id;
    },
    updateLayer: (id, layer) => dispatch({ type: "UPDATE", entry: { id, layer } }),
  });

  return (
    <ControlBarControllerContext.Provider value={controllerRef.current}>
      {children}
      <ControlBarHost layers={layers} />
    </ControlBarControllerContext.Provider>
  );
}

/** Mount exactly once at the root layout. Nesting throws — use {@link ControlBarSandbox} for isolated demos. */
export function ControlBarProvider({ children }: { children: ReactNode }) {
  if (useContext(ControlBarControllerContext)) {
    throw new Error(
      "ControlBarProvider cannot be nested. Mount it once at the root layout; use ControlBarSandbox for isolated demos.",
    );
  }
  return <ControlBarContexts>{children}</ControlBarContexts>;
}

/** Permits nesting so devtools and unit tests can instantiate independent bars inside the live tree. */
export function ControlBarSandbox({ children }: { children: ReactNode }) {
  return <ControlBarContexts>{children}</ControlBarContexts>;
}

function useControlBarController(): ControlBarController {
  const controller = useContext(ControlBarControllerContext);
  if (!controller) {
    throw new Error(
      "Control-bar hooks must be used inside a ControlBarProvider or ControlBarSandbox",
    );
  }
  return controller;
}

/**
 * Register a layer for the lifetime of the calling component. `null` pops without unmounting.
 * Stack composition is determined by {@link ControlBarLayerInput.priority}, never by mount order.
 */
export function useControlBarLayer(layer: ControlBarLayerInput | null) {
  const controller = useControlBarController();
  const layerIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!layer) {
      if (layerIdRef.current) {
        controller.popLayer(layerIdRef.current);
        layerIdRef.current = null;
      }
      return;
    }

    if (layerIdRef.current) {
      controller.updateLayer(layerIdRef.current, layer);
      return;
    }

    layerIdRef.current = controller.pushLayer(layer);
  }, [controller, layer]);

  useLayoutEffect(
    () => () => {
      if (!layerIdRef.current) return;
      controller.popLayer(layerIdRef.current);
      layerIdRef.current = null;
    },
    [controller],
  );
}

function ControlBarHost({ layers }: { layers: readonly ControlBarLayerEntry[] }) {
  const top = resolveLayer(layers.map((e) => e.layer));
  if (!top) return null;
  return <RenderedHost top={top} />;
}

function RenderedHost({ top }: { top: ResolvedControlBarLayer }) {
  const showBackdrop = top.backdropVisible || typeof top.backdropOnClick === "function";
  return (
    <>
      {showBackdrop ? (
        <button
          type="button"
          className={cn(
            "fixed inset-0 z-10 bg-black/20 transition-opacity duration-300",
            top.backdropVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={top.backdropOnClick}
          aria-label="Dismiss control bar"
        />
      ) : null}
      <ControlBarSurface
        addons={top.addons}
        className={top.className}
        expanded={top.expanded}
        leftAction={top.leftAction}
        mainContent={top.mainContent}
        rightAction={top.rightAction}
        shellStyle={top.shellStyle}
        statusButton={top.statusButton}
      />
    </>
  );
}
