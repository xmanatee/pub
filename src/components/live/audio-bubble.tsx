import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioChatEntry } from "./types";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BAR_COUNT = 40;
const FLAT_PEAKS = Array.from({ length: BAR_COUNT }, () => 0.15);

export function AudioBubble({ entry }: { entry: AudioChatEntry }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const animRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const peaks = entry.waveform ?? FLAT_PEAKS;
  const duration = entry.duration ?? 0;
  const isUser = entry.from === "user";

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, []);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const total = audio.duration || duration;
    if (total > 0) setProgress(audio.currentTime / total);
    animRef.current = requestAnimationFrame(tick);
  }, [duration]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setPlaying(true);
      animRef.current = requestAnimationFrame(tick);
    } else {
      audio.pause();
      setPlaying(false);
      cancelAnimationFrame(animRef.current);
    }
  }, [tick]);

  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const container = containerRef.current;
      if (!audio || !container) return;
      const rect = container.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const total = audio.duration || duration;
      if (total > 0) {
        audio.currentTime = ratio * total;
        setProgress(ratio);
      }
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

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: waveform seek is mouse-only; keyboard users use the play button */}
      <div
        ref={containerRef}
        role="slider"
        aria-label="Audio position"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={-1}
        className="flex h-6 flex-1 cursor-pointer items-end gap-px"
        onClick={handleSeek}
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
