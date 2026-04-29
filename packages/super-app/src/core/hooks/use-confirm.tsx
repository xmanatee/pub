/**
 * Imperative confirm dialog. Replaces `window.confirm`.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete this?", danger: true })) ...
 */
import * as React from "react";
import { Button } from "~/core/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/ui/dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmRoot({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ options, resolve });
      }),
    [],
  );

  const close = (ok: boolean) => {
    if (!pending) return;
    pending.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        {pending ? (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{pending.options.title}</DialogTitle>
              {pending.options.description ? (
                <DialogDescription>{pending.options.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                {pending.options.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={pending.options.danger ? "destructive" : "default"}
                onClick={() => close(true)}
                autoFocus
              >
                {pending.options.confirmLabel ?? "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmRoot>");
  return ctx.confirm;
}
