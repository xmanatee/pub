import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useControlBarLayer } from "~/components/control-bar/control-bar-controller";
import { controlBarNotificationsToAddons } from "~/components/control-bar/control-bar-parts";
import { CONTROL_BAR_STYLES } from "~/components/control-bar/control-bar-styles";
import type { ControlBarTone } from "~/components/control-bar/control-bar-tone";
import { controlBarToneStyle } from "~/components/control-bar/control-bar-tone";
import {
  CONTROL_BAR_PRIORITY,
  type ControlBarAddon,
  type ControlBarNotificationConfig,
} from "~/components/control-bar/control-bar-types";
import { Button } from "~/components/ui/button";
import { AppNavMenu } from "~/features/app-shell/components/app-nav-menu";
import { useHeaderNavVisible } from "~/features/app-shell/hooks/use-header-nav-visible";
import type { LiveViewMode } from "~/features/live/types/live-types";
import { useControlBarText } from "~/features/live-control-bar/hooks/use-control-bar-text";
import { useExtendedOptionsVisibility } from "~/features/live-control-bar/hooks/use-extended-options-visibility";
import { useFileUpload } from "~/features/live-control-bar/hooks/use-file-upload";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";
import { ControlBarInputRow } from "../components/control-bar-input-row";
import { ControlBarOptionalLiveMode } from "../components/control-bar-optional-live-mode";
import { LiveViewOptions } from "../components/live-view-options";
import { resolveTransientLayer } from "./resolve-transient-layer";

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);

interface UseLiveControlBarBridgeOptions {
  initialInput?: string;
  shellTone?: ControlBarTone | null;
  statusButtonContent?: ReactNode;
}

export function useLiveControlBarBridge({
  initialInput,
  shellTone,
  statusButtonContent,
}: UseLiveControlBarBridgeOptions) {
  const {
    agentName,
    agentOnline,
    audio,
    availableAgents,
    collapseControlBar,
    connected,
    controlBarCollapsed,
    controlBarState,
    defaultAgentName,
    dismissPreview,
    hasCanvasContent,
    lastTakeoverAt,
    optionalLive,
    preview,
    requestLiveSession,
    retryConnection,
    toggleControlBar,
    setDefaultAgentName,
    setSelectedHostId,
    setViewMode,
    sendChat,
    sendFile,
    takeoverLive,
    viewMode,
    blobState,
    voiceModeEnabled,
    closeLive,
    errorThrottle,
  } = useLiveSession();

  const canCollapseBar = hasCanvasContent;
  const previewForcesExpansion = canCollapseBar && viewMode === "canvas" && preview !== null;
  const isExpanded =
    viewMode === "canvas"
      ? canCollapseBar
        ? previewForcesExpansion || !controlBarCollapsed
        : true
      : true;
  const suppressAutoOptionsRef = useRef(false);

  const {
    visible: extendedOptionsVisible,
    dismiss: dismissExtendedOptions,
    toggle: toggleExtendedOptions,
  } = useExtendedOptionsVisibility({
    controlBarState,
    isBarExpanded: isExpanded,
    showOnExpand: canCollapseBar && !preview && !suppressAutoOptionsRef.current,
    viewMode,
  });

  useEffect(() => {
    if (preview) {
      suppressAutoOptionsRef.current = true;
      dismissExtendedOptions();
      return;
    }

    if (!isExpanded || viewMode !== "canvas") {
      suppressAutoOptionsRef.current = false;
    }
  }, [dismissExtendedOptions, isExpanded, preview, viewMode]);

  const { input, setInput, hasText, handleSend, handleKeyDown } = useControlBarText({
    disabled: !connected,
    onSendChat: sendChat,
    initialInput,
  });

  const { fileInputRef, handleFile } = useFileUpload({ onSendFile: sendFile });

  const headerNavVisible = useHeaderNavVisible();

  const handleViewSelect = useCallback(
    (mode: LiveViewMode) => {
      setViewMode(mode);
      dismissExtendedOptions();
    },
    [dismissExtendedOptions, setViewMode],
  );

  useEffect(() => {
    if (!isExpanded) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && canCollapseBar) toggleControlBar();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canCollapseBar, isExpanded, toggleControlBar]);

  const handlePreviewClick = useCallback(() => {
    setViewMode("chat");
    dismissPreview();
  }, [dismissPreview, setViewMode]);

  // Stable across renders — only the imperative ref attaches per mount.
  const waveform = useMemo(
    () => (
      <div ref={audio.barsRef} className="flex h-7 w-full items-center gap-0.5 overflow-hidden">
        {WAVEFORM_BARS.map((id) => (
          <div
            key={id}
            className="min-w-0 flex-1 rounded-full bg-foreground/70 transition-all duration-75"
            style={{ height: "4px" }}
          />
        ))}
      </div>
    ),
    [audio.barsRef],
  );

  const rightAction =
    viewMode !== "canvas" ? (
      <Button
        type="button"
        variant="secondary"
        size="controlBack"
        className={CONTROL_BAR_STYLES.backButton}
        onClick={() => {
          setViewMode("canvas");
          collapseControlBar();
        }}
        aria-label="Back to canvas"
      >
        <ArrowLeft />
      </Button>
    ) : undefined;

  const addons: ControlBarAddon[] = [];

  if (extendedOptionsVisible) {
    addons.push({
      key: "extended-options",
      priority: 0,
      content: (
        <LiveViewOptions
          viewMode={viewMode}
          onSelect={handleViewSelect}
          footer={
            !headerNavVisible ? <AppNavMenu onNavigate={dismissExtendedOptions} /> : undefined
          }
        />
      ),
    });
  }

  const notifications: ControlBarNotificationConfig[] = [];

  if (errorThrottle.phase === "paused") {
    notifications.push({
      key: "error-throttle",
      priority: 0,
      label: "Paused",
      labelClassName: "text-destructive",
      content: (
        <span>
          {errorThrottle.errorCount} errors —{" "}
          <button
            type="button"
            className="underline font-medium hover:text-foreground"
            onClick={errorThrottle.resume}
          >
            Resume
          </button>
        </span>
      ),
    });
  } else if (errorThrottle.phase === "suggest-pause") {
    notifications.push({
      key: "error-throttle",
      priority: 0,
      label: "Errors",
      labelClassName: "text-amber-600",
      content: (
        <span>
          {errorThrottle.errorCount} canvas errors —{" "}
          <button
            type="button"
            className="underline font-medium hover:text-foreground"
            onClick={errorThrottle.pause}
          >
            Pause
          </button>{" "}
          <button
            type="button"
            className="underline font-medium hover:text-foreground"
            onClick={errorThrottle.dismiss}
          >
            Dismiss
          </button>
        </span>
      ),
    });
  }

  if (preview) {
    notifications.push({
      key: "preview",
      priority: 1,
      ariaLabel: "Open chat",
      content: preview.text,
      label: preview.source === "system" ? "System" : (agentName ?? "Agent"),
      labelClassName:
        preview.source === "system"
          ? preview.severity === "error"
            ? "text-destructive"
            : "text-amber-600"
          : "text-primary",
      onClick: handlePreviewClick,
    });
  }

  addons.push(...controlBarNotificationsToAddons(notifications));

  // The live layer owns the chrome (status button, backdrop, expansion). Higher-priority
  // layers only override the fields they need; field-merge inherits everything else.
  useControlBarLayer({
    priority: CONTROL_BAR_PRIORITY.live,
    addons,
    backdropOnClick: canCollapseBar ? toggleControlBar : undefined,
    backdropVisible: canCollapseBar && isExpanded && viewMode === "canvas" && !preview,
    expanded: isExpanded,
    shellStyle: controlBarToneStyle(shellTone),
    statusButton: statusButtonContent
      ? {
          ariaLabel: canCollapseBar ? "Toggle control bar" : "Toggle extended options",
          content: statusButtonContent,
          onClick: canCollapseBar ? toggleControlBar : toggleExtendedOptions,
        }
      : undefined,
    mainContent: optionalLive ? (
      <ControlBarOptionalLiveMode
        agentOnline={agentOnline === true}
        onConnect={requestLiveSession}
        onExit={closeLive}
      />
    ) : (
      <ControlBarInputRow
        fileInputRef={fileInputRef}
        hasText={hasText}
        input={input}
        onFileChange={handleFile}
        onFocus={dismissExtendedOptions}
        onInputChange={setInput}
        onInputKeyDown={handleKeyDown}
        onSend={handleSend}
        onStartRecording={audio.startRecording}
        onStartVoiceMode={audio.startVoiceMode}
        sendDisabled={!connected}
        blobState={blobState}
        voiceModeEnabled={voiceModeEnabled}
      />
    ),
    rightAction: rightAction,
  });

  const transient = resolveTransientLayer({
    agents: availableAgents,
    controlBarState,
    defaultAgentName,
    elapsed: audio.elapsed,
    lastTakeoverAt,
    onCancelRecording: audio.cancelRecording,
    onExit: closeLive,
    onPauseResume:
      controlBarState === "recording-paused" ? audio.resumeRecording : audio.pauseRecording,
    onReconnect: retryConnection,
    onSelectAgent: setSelectedHostId,
    onSendRecording: audio.sendRecording,
    onSetDefaultAgent: setDefaultAgentName,
    onStopVoiceMode: audio.stopVoiceMode,
    onTakeover: takeoverLive,
    rightAction: rightAction,
    waveform,
  });

  useControlBarLayer(
    transient ? { ...transient, priority: CONTROL_BAR_PRIORITY.liveTransient } : null,
  );
}
