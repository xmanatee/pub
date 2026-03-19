import { api } from "@backend/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveCommandSummary } from "~/features/live/types/live-types";

const MIN_RENDER_MS = 5_000;
const IDLE_DEBOUNCE_MS = 2_000;

interface UsePreviewCaptureOptions {
  slug: string;
  liveMode: boolean;
  command: LiveCommandSummary;
  hasCanvasContent: boolean;
  pubUpdatedAt?: number;
  hasPreviewHtml: boolean;
}

export function usePreviewCapture({
  slug,
  liveMode,
  command,
  hasCanvasContent,
  pubUpdatedAt,
  hasPreviewHtml,
}: UsePreviewCaptureOptions) {
  const savePreview = useMutation(api.pubs.savePreviewHtml);
  const [capturePreview, setCapturePreview] = useState(false);
  const savedForRef = useRef<string | null>(null);
  const contentLoadedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (hasCanvasContent) contentLoadedAtRef.current = Date.now();
  }, [hasCanvasContent]);

  const versionKey = `${slug}:${pubUpdatedAt}`;
  const needsCapture =
    liveMode &&
    hasCanvasContent &&
    !hasPreviewHtml &&
    pubUpdatedAt !== undefined &&
    savedForRef.current !== versionKey;

  const isIdle = command.phase === "idle" && command.activeCount === 0;

  useEffect(() => {
    if (!needsCapture || !isIdle) {
      setCapturePreview(false);
      return;
    }

    const elapsed = Date.now() - contentLoadedAtRef.current;
    const delay = Math.max(IDLE_DEBOUNCE_MS, MIN_RENDER_MS - elapsed);

    const timer = setTimeout(() => setCapturePreview(true), delay);
    return () => clearTimeout(timer);
  }, [needsCapture, isIdle]);

  const handlePreviewCaptured = useCallback(
    (html: string) => {
      setCapturePreview(false);
      if (!pubUpdatedAt) return;
      savedForRef.current = versionKey;
      void savePreview({ slug, previewHtml: html, updatedAt: pubUpdatedAt });
    },
    [savePreview, slug, pubUpdatedAt, versionKey],
  );

  return { capturePreview, handlePreviewCaptured };
}
