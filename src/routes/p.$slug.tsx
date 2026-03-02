import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { CanvasPanel } from "~/components/live/canvas-panel";
import { ChatPanel } from "~/components/live/chat-panel";
import { ControlBar } from "~/components/live/control-bar";
import { ControlBarGoLiveMode } from "~/components/live/control-bar-go-live-mode";
import { SettingsPanel } from "~/components/live/settings-panel";
import { useChatPreview } from "~/components/live/use-chat-preview";
import { useLivePageModel } from "~/components/live/use-live-page-model";
import { trackPubViewed } from "~/lib/analytics";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/p/$slug")({
  component: PubPage,
});

function PubPage() {
  const { slug } = Route.useParams();
  const pub = useQuery(api.pubs.getBySlug, { slug });
  const recordPublicView = useMutation(api.analytics.recordPublicView);
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);
  const [interactiveMode, setInteractiveMode] = useState(false);

  useEffect(() => {
    if (pub && !trackedAnalytics.current) {
      trackedAnalytics.current = true;
      trackPubViewed({
        slug: pub.slug,
        contentType: pub.contentType ?? "text",
        isPublic: pub.isPublic,
      });
    }
  }, [pub]);

  useEffect(() => {
    if (!pub || !pub.isPublic || trackedViewCount.current) return;
    trackedViewCount.current = true;
    void recordPublicView({ slug: pub.slug });
  }, [pub, recordPublicView]);

  useEffect(() => {
    setInteractiveMode(false);
    trackedAnalytics.current = false;
    trackedViewCount.current = false;
  }, [slug]);

  if (pub === undefined) {
    return <StatusScreen text="Loading..." />;
  }

  if (pub === null) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="text-xl font-bold text-foreground">Not found</h1>
        <p className="text-muted-foreground">This pub doesn't exist or is not accessible.</p>
        <Link to="/" className="text-primary hover:underline text-sm">
          Go to pub.blue
        </Link>
      </div>
    );
  }

  const hasContent = Boolean(pub.content && pub.contentType);

  // Owner — interactive mode when agent is online
  if (pub.isOwner) {
    if (!hasContent) {
      return <InteractiveView slug={slug} />;
    }
    if (interactiveMode) {
      return <InteractiveView slug={slug} onBackToContent={() => setInteractiveMode(false)} />;
    }
    return (
      <>
        <FullScreenContent content={pub.content ?? ""} contentType={pub.contentType ?? "text"} />
        <ControlBarGoLiveMode onGoLive={() => setInteractiveMode(true)} />
      </>
    );
  }

  // Non-owner — content only
  if (!hasContent) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="text-xl font-bold text-foreground">No content</h1>
        <p className="text-muted-foreground">This pub has no static content.</p>
        <Link to="/" className="text-primary hover:underline text-sm">
          Go to pub.blue
        </Link>
      </div>
    );
  }

  return <FullScreenContent content={pub.content ?? ""} contentType={pub.contentType ?? "text"} />;
}

function InteractiveView({
  slug,
  onBackToContent,
}: {
  slug: string;
  onBackToContent?: () => void;
}) {
  const navigate = useNavigate();
  const model = useLivePageModel(slug);
  const { previewText, dismissPreview } = useChatPreview(model.messages, model.viewMode);
  const [controlBarCollapsed, setControlBarCollapsed] = useState(false);

  // Auto-trigger goLive when entering interactive view
  useEffect(() => {
    if (model.agentOnline && !model.liveRequested) {
      model.goLive();
    }
  }, [model.agentOnline, model.liveRequested, model.goLive]);

  if (!model.agentOnline && !model.liveRequested && !model.canvasHtml) {
    if (onBackToContent) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4">
          <p className="text-muted-foreground text-sm">Agent offline.</p>
          <button
            type="button"
            onClick={onBackToContent}
            className="text-primary hover:underline text-sm"
          >
            Back to content
          </button>
        </div>
      );
    }
    return <StatusScreen text="Agent offline." />;
  }

  if (model.liveRequested && !model.live?.agentAnswer && !model.canvasHtml)
    return <StatusScreen text="Connecting..." />;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {controlBarCollapsed ? null : (
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
      )}

      {onBackToContent ? (
        <button
          type="button"
          onClick={onBackToContent}
          className="fixed top-4 left-4 z-[60] px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Content
        </button>
      ) : null}

      <div className="flex-1 min-h-0 relative">
        {model.viewMode === "canvas" ? (
          <CanvasPanel
            animationStyle={model.animationStyle}
            html={model.canvasHtml}
            visualState={model.visualState}
          />
        ) : null}

        {model.viewMode === "chat" ? (
          <ChatPanel
            files={model.files}
            messages={model.messages}
            messagesEndRef={model.messagesEndRef}
            showDeliveryStatus={model.showDeliveryStatus}
          />
        ) : null}

        {model.viewMode === "settings" ? (
          <SettingsPanel
            autoOpenCanvas={model.autoOpenCanvas}
            animationStyle={model.animationStyle}
            developerModeEnabled={model.developerModeEnabled}
            fileCount={model.files.length}
            hasCanvasContent={Boolean(model.canvasHtml)}
            messageCount={model.messages.length}
            onAutoOpenCanvasChange={model.setAutoOpenCanvas}
            onAnimationStyleChange={model.setAnimationStyle}
            onClearCanvas={model.clearCanvas}
            onClearFiles={model.clearFiles}
            onClearMessages={model.clearMessages}
            onDeveloperModeChange={model.setDeveloperModeEnabled}
            onShowDeliveryStatusChange={model.setShowDeliveryStatus}
            onVoiceModeEnabledChange={model.setVoiceModeEnabled}
            showDeliveryStatus={model.showDeliveryStatus}
            voiceModeEnabled={model.voiceModeEnabled}
          />
        ) : null}
      </div>

      <ControlBar
        agentName={null}
        chatPreview={previewText}
        collapsed={controlBarCollapsed}
        sendDisabled={!model.connected}
        bridge={model.bridgeRef.current}
        lastTakeoverAt={model.lastTakeoverAt}
        onClose={() => navigate({ to: "/dashboard" })}
        onDismissPreview={dismissPreview}
        onTakeover={() => void model.takeoverLive()}
        onToggleCollapsed={() => setControlBarCollapsed((c) => !c)}
        onSendAudio={model.sendAudio}
        onSendChat={model.sendChat}
        sessionState={model.sessionState}
        onChangeView={model.setViewMode}
        viewMode={model.viewMode}
        visualState={model.visualState}
        voiceModeEnabled={model.voiceModeEnabled}
      />
    </div>
  );
}

function FullScreenContent({ content, contentType }: { content: string; contentType: string }) {
  switch (contentType) {
    case "html":
      return <FullScreenHtml content={content} />;
    case "markdown":
      return <FullScreenMarkdown content={content} />;
    default:
      return (
        <div className="fixed inset-0 z-50 overflow-auto bg-background">
          <pre className="p-6 text-sm whitespace-pre-wrap font-mono text-foreground">{content}</pre>
        </div>
      );
  }
}

function FullScreenHtml({ content }: { content: string }) {
  const srcDoc = `<base target="_blank">${content}`;
  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups"
      className="fixed inset-0 z-50 w-full h-full border-none"
      title="Published HTML content"
    />
  );
}

function FullScreenMarkdown({ content }: { content: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;

    void Promise.all([import("marked"), import("dompurify")]).then(
      ([{ marked }, { default: DOMPurify }]) => {
        void Promise.resolve(marked.parse(content)).then((unsafeHtml) => {
          if (cancelled) return;
          const safeHtml = DOMPurify.sanitize(unsafeHtml, {
            USE_PROFILES: { html: true },
          });
          setHtml(safeHtml);
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [content]);

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background">
      <div
        className="max-w-[800px] mx-auto px-8 py-12 prose prose-sm dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function StatusScreen({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm">{text}</div>
    </div>
  );
}
