/**
 * Toast hook + provider. The provider mounts a single Radix `ToastProvider`
 * + `ToastViewport` at app root and exposes `useToast()` to push messages.
 * Replaces every `alert(...)` call in the app.
 */
import * as React from "react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  type ToastVariant,
  ToastViewport,
} from "~/core/ui/toast";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastEntry extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  push: (options: ToastOptions) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastRoot({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<ToastEntry[]>([]);

  const push = React.useCallback((options: ToastOptions) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEntries((prev) => [...prev, { id, ...options }]);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setEntries((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      <ToastProvider swipeDirection="right">
        {children}
        {entries.map((t) => (
          <Toast
            key={t.id}
            variant={t.variant}
            duration={t.durationMs ?? 4000}
            onOpenChange={(open) => {
              if (!open) dismiss(t.id);
            }}
          >
            <div className="flex flex-col gap-0.5">
              <ToastTitle>{t.title}</ToastTitle>
              {t.description ? <ToastDescription>{t.description}</ToastDescription> : null}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastRoot>");
  return ctx;
}

/** Helper: wrap a promise; show error toast on failure. Returns true on success. */
export function useTryToast() {
  const { push } = useToast();
  return React.useCallback(
    async (
      fn: () => Promise<unknown>,
      opts?: { successTitle?: string; errorTitle?: string },
    ): Promise<boolean> => {
      try {
        await fn();
        if (opts?.successTitle) push({ title: opts.successTitle, variant: "success" });
        return true;
      } catch (err) {
        push({
          title: opts?.errorTitle ?? "Something went wrong",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
          durationMs: 6000,
        });
        return false;
      }
    },
    [push],
  );
}
