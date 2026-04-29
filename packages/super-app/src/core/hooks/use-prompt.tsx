/**
 * Imperative single-input prompt dialog. Replaces `window.prompt`.
 *
 *   const promptUser = usePrompt();
 *   const name = await promptUser({ title: "Folder name", initial: "untitled" });
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
import { Input } from "~/core/ui/input";

export interface PromptOptions {
  title: string;
  description?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PromptContextValue {
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const PromptContext = React.createContext<PromptContextValue | null>(null);

interface PendingPrompt {
  options: PromptOptions;
  resolve: (value: string | null) => void;
}

export function PromptRoot({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingPrompt | null>(null);
  const [value, setValue] = React.useState("");

  React.useEffect(() => {
    if (pending) setValue(pending.options.initial ?? "");
  }, [pending]);

  const prompt = React.useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPending({ options, resolve });
      }),
    [],
  );

  const close = (result: string | null) => {
    if (!pending) return;
    pending.resolve(result);
    setPending(null);
  };

  return (
    <PromptContext.Provider value={{ prompt }}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) close(null);
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                close(value);
              }}
            >
              <Input
                autoFocus
                value={value}
                placeholder={pending.options.placeholder}
                onChange={(e) => setValue(e.target.value)}
              />
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => close(null)}>
                  {pending.options.cancelLabel ?? "Cancel"}
                </Button>
                <Button type="submit" disabled={!value.trim()}>
                  {pending.options.confirmLabel ?? "OK"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </PromptContext.Provider>
  );
}

export function usePrompt(): (opts: PromptOptions) => Promise<string | null> {
  const ctx = React.useContext(PromptContext);
  if (!ctx) throw new Error("usePrompt must be used within <PromptRoot>");
  return ctx.prompt;
}
