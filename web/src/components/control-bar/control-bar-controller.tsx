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
import type {
  ControlBarChromeConfig,
  ControlBarLayerConfig,
  ControlBarSurfaceProps,
} from "./control-bar-types";

interface ControlBarLayerEntry {
  id: string;
  layer: ControlBarLayerConfig;
}

interface ControlBarState {
  chrome: ControlBarChromeConfig;
  baseLayer: ControlBarLayerConfig | null;
  layers: ControlBarLayerEntry[];
}

interface ControlBarController {
  clearBaseLayer: () => void;
  popLayer: (id: string) => void;
  pushLayer: (layer: ControlBarLayerConfig) => string;
  resetChrome: () => void;
  setBaseLayer: (layer: ControlBarLayerConfig) => void;
  setChrome: (chrome: ControlBarChromeConfig) => void;
  updateLayer: (id: string, layer: ControlBarLayerConfig) => void;
}

type ControlBarAction =
  | { type: "SET_BASE_LAYER"; layer: ControlBarLayerConfig }
  | { type: "CLEAR_BASE_LAYER" }
  | { type: "SET_CHROME"; chrome: ControlBarChromeConfig }
  | { type: "RESET_CHROME" }
  | { type: "PUSH_LAYER"; entry: ControlBarLayerEntry }
  | { type: "UPDATE_LAYER"; entry: ControlBarLayerEntry }
  | { type: "POP_LAYER"; id: string };

const INITIAL_CHROME: ControlBarChromeConfig = {
  backdropOnClick: undefined,
  backdropVisible: false,
  expanded: true,
  shellStyle: undefined,
  statusButton: undefined,
};

const INITIAL_STATE: ControlBarState = {
  chrome: INITIAL_CHROME,
  baseLayer: null,
  layers: [],
};

const ControlBarControllerContext = createContext<ControlBarController | null>(null);
const ControlBarStateContext = createContext<ControlBarState | null>(null);

function controlBarReducer(state: ControlBarState, action: ControlBarAction): ControlBarState {
  switch (action.type) {
    case "SET_BASE_LAYER":
      return { ...state, baseLayer: action.layer };
    case "CLEAR_BASE_LAYER":
      return { ...state, baseLayer: null };
    case "SET_CHROME":
      return { ...state, chrome: action.chrome };
    case "RESET_CHROME":
      return { ...state, chrome: INITIAL_CHROME };
    case "PUSH_LAYER":
      return { ...state, layers: [...state.layers, action.entry] };
    case "UPDATE_LAYER":
      return {
        ...state,
        layers: state.layers.map((entry) => (entry.id === action.entry.id ? action.entry : entry)),
      };
    case "POP_LAYER":
      return { ...state, layers: state.layers.filter((entry) => entry.id !== action.id) };
  }
}

function resolveSurfaceProps(state: ControlBarState): {
  backdropOnClick?: () => void;
  backdropVisible: boolean;
  surface: ControlBarSurfaceProps | null;
} {
  const baseLayer = state.baseLayer;
  const topLayer = state.layers[state.layers.length - 1]?.layer;
  const activeLayer = topLayer ?? baseLayer;
  if (!activeLayer) {
    return {
      backdropOnClick: state.chrome.backdropOnClick,
      backdropVisible: state.chrome.backdropVisible ?? false,
      surface: null,
    };
  }

  return {
    backdropOnClick: state.chrome.backdropOnClick,
    backdropVisible: state.chrome.backdropVisible ?? false,
    surface: {
      addons: topLayer?.addons ?? baseLayer?.addons,
      className: cn(baseLayer?.className, topLayer?.className),
      expanded: state.chrome.expanded ?? true,
      leftAction: topLayer?.leftAction ?? baseLayer?.leftAction,
      mainContent: topLayer?.mainContent ?? baseLayer?.mainContent ?? activeLayer.mainContent,
      rightAction: topLayer?.rightAction ?? baseLayer?.rightAction,
      shellStyle: state.chrome.shellStyle,
      statusButton: state.chrome.statusButton,
    },
  };
}

export function ControlBarProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(controlBarReducer, INITIAL_STATE);
  const idRef = useRef(0);

  const controllerRef = useRef<ControlBarController>({
    clearBaseLayer: () => dispatch({ type: "CLEAR_BASE_LAYER" }),
    popLayer: (id: string) => dispatch({ type: "POP_LAYER", id }),
    pushLayer: (layer: ControlBarLayerConfig) => {
      const id = `cb-layer-${idRef.current++}`;
      dispatch({ type: "PUSH_LAYER", entry: { id, layer } });
      return id;
    },
    resetChrome: () => dispatch({ type: "RESET_CHROME" }),
    setBaseLayer: (layer: ControlBarLayerConfig) => dispatch({ type: "SET_BASE_LAYER", layer }),
    setChrome: (chrome: ControlBarChromeConfig) => dispatch({ type: "SET_CHROME", chrome }),
    updateLayer: (id: string, layer: ControlBarLayerConfig) =>
      dispatch({ type: "UPDATE_LAYER", entry: { id, layer } }),
  });

  return (
    <ControlBarControllerContext.Provider value={controllerRef.current}>
      <ControlBarStateContext.Provider value={state}>{children}</ControlBarStateContext.Provider>
    </ControlBarControllerContext.Provider>
  );
}

export function useControlBarController() {
  const controller = useContext(ControlBarControllerContext);
  if (!controller) {
    throw new Error("useControlBarController must be used within a ControlBarProvider");
  }
  return controller;
}

export function useControlBarBaseLayer(layer: ControlBarLayerConfig) {
  const controller = useControlBarController();

  useLayoutEffect(() => {
    controller.setBaseLayer(layer);
    return () => controller.clearBaseLayer();
  }, [controller, layer]);
}

export function useControlBarChrome(chrome: ControlBarChromeConfig) {
  const controller = useControlBarController();

  useLayoutEffect(() => {
    controller.setChrome(chrome);
    return () => controller.resetChrome();
  }, [chrome, controller]);
}

export function useControlBarLayer(layer: ControlBarLayerConfig | null) {
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

  useLayoutEffect(() => {
    return () => {
      if (!layerIdRef.current) return;
      controller.popLayer(layerIdRef.current);
      layerIdRef.current = null;
    };
  }, [controller]);
}

export function ControlBarHost() {
  const state = useContext(ControlBarStateContext);
  if (!state) {
    throw new Error("ControlBarHost must be used within a ControlBarProvider");
  }

  const view = resolveSurfaceProps(state);
  if (!view.surface) return null;

  return (
    <>
      <button
        type="button"
        className={cn(
          "fixed inset-0 z-10 bg-black/20 transition-opacity duration-300",
          view.backdropVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={view.backdropOnClick}
        aria-label="Dismiss control bar"
      />
      <ControlBarSurface {...view.surface} />
    </>
  );
}
