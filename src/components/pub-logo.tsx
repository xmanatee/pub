import { cn } from "~/lib/utils";

/**
 * Pub logo — Geometric "P" in a circle.
 * Works at all sizes: favicon (16px), nav (24px), hero (48px+).
 * The "P" bowl opens rightward, suggesting output flowing out (sharing/visualizing).
 */
export function PubLogo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-label="Pub"
    >
      <circle cx="16" cy="16" r="16" fill="currentColor" className="text-primary" />
      <path
        d="M11 8.5h5.5a5.5 5.5 0 0 1 0 11H14v5h-3V8.5z"
        fill="white"
        className="text-primary-foreground"
      />
      <path d="M14 11h2.5a3 3 0 0 1 0 6H14v-6z" fill="currentColor" className="text-primary" />
    </svg>
  );
}

/**
 * Wordmark for larger contexts: icon + "Pub" text.
 */
export function PubWordmark({
  className,
  iconSize = 24,
}: {
  className?: string;
  iconSize?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <PubLogo size={iconSize} />
      <span className="font-semibold tracking-tight">Pub</span>
    </span>
  );
}
