import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioChatEntry } from "~/features/live-chat/types/live-chat-types";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BAR_COUNT = 40;
const FLAT_PEAKS = Array.from({ length: BAR_COUNT }, () => 0.15);
const SEEK_STEP_SECONDS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getSeekRatioFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return 0;
  return clamp((clientX - left) / width, 0, 1);
}

export function resolveKeyboardSeekTime({
  key,
  currentTime,
  duration,
}: {
  key: string;
  currentTime: number;
  duration: number;
}): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return duration;
  if (key === "ArrowLeft") return clamp(currentTime - SEEK_STEP_SECONDS, 0, duration);
  if (key === "ArrowRight") return clamp(currentTime + SEEK_STEP_SECONDS, 0, duration);
  return null;
}

export function AudioBubble({ entry }: { entry: AudioChatEntry }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const animRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const peaks = entry.waveform ?? FLAT_PEAKS;
  const duration = entry.duration ?? 0;
  const isUser = entry.from === "user";

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const total = audio.duration || duration;
    if (total > 0) setProgress(audio.currentTime / total);
    animRef.current = requestAnimationFrame(tick);
  }, [duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(animRef.current);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      cancelAnimationFrame(animRef.current);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [tick]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        void playPromise.catch((error) => {
          console.warn("Failed to play audio clip", error);
          setPlaying(false);
          cancelAnimationFrame(animRef.current);
        });
      }
    } else {
      audio.pause();
    }
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const container = containerRef.current;
      if (!audio || !container) return;
      const rect = container.getBoundingClientRect();
      const ratio = getSeekRatioFromPointer(e.clientX, rect.left, rect.width);
      const total = audio.duration || duration;
      if (total > 0) {
        audio.currentTime = ratio * total;
        setProgress(ratio);
      }
    },
    [duration],
  );

  const handleSeekKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const total = audio.duration || duration;
      const nextTime = resolveKeyboardSeekTime({
        key: event.key,
        currentTime: audio.currentTime,
        duration: total,
      });
      if (nextTime === null) return;
      event.preventDefault();
      audio.currentTime = nextTime;
      setProgress(total > 0 ? nextTime / total : 0);
    },
    [duration],
  );

  const playedColor = isUser ? "bg-primary-foreground" : "bg-primary";
  const unplayedColor = isUser ? "bg-primary-foreground/40" : "bg-primary/40";

  const displayDuration = playing
    ? formatDuration(audioRef.current?.currentTime ?? 0)
    : formatDuration(duration);

  return (
    <div className="flex items-center gap-2">
      {/* biome-ignore lint/a11y/useMediaCaption: live chat audio has no captions */}
      <audio ref={audioRef} preload="metadata" src={entry.audioUrl} />

      <button
        type="button"
        onClick={togglePlay}
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary-foreground/20" : "bg-primary/20"
        }`}
      >
        {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
      </button>

      <div
        ref={containerRef}
        role="slider"
        aria-label="Audio position"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(progress * 100)}%`}
        tabIndex={0}
        className="flex h-6 flex-1 cursor-pointer items-end gap-px"
        onClick={handleSeek}
        onKeyDown={handleSeekKeyDown}
      >
        {peaks.map((peak, i) => (
          <div
            key={`${i}-${peak}`}
            className={`min-w-px flex-1 rounded-full transition-colors ${i / peaks.length < progress ? playedColor : unplayedColor}`}
            style={{ height: `${Math.max(8, peak * 100)}%` }}
          />
        ))}
      </div>

      <span className="min-w-10 text-right text-xs tabular-nums opacity-80">{displayDuration}</span>
    </div>
  );
}
