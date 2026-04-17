import { Archive, Ban, BellOff, LogOut, MessageCircle, Settings, X } from "lucide-react";
import type * as React from "react";
import { useAsync, withErrorAlert } from "~/core/pub";
import { ErrorState } from "~/core/shell/error-state";
import { Button } from "~/core/ui/button";
import { Skeleton } from "~/core/ui/skeleton";
import { telegram } from "./client";
import type { TelegramPeerInfo } from "./commands";

export function PeerInfoDrawer({
  dialogId,
  onClose,
  onLeft,
}: {
  dialogId: string;
  onClose: () => void;
  onLeft: () => void;
}) {
  const { state, reload } = useAsync(() => telegram.peer(dialogId), [dialogId]);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    withErrorAlert(async () => {
      await fn();
      reload();
      after?.();
    });

  return (
    <div className="flex h-full w-80 min-h-0 shrink-0 flex-col border-l bg-background">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Settings className="size-4" /> Chat info
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {state.status === "loading" ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : state.status === "error" ? (
          <ErrorState error={state.error} onRetry={reload} />
        ) : (
          <PeerBody peer={state.value} run={run} onLeft={onLeft} dialogId={dialogId} />
        )}
      </div>
    </div>
  );
}

function PeerBody({
  peer,
  run,
  onLeft,
  dialogId,
}: {
  peer: TelegramPeerInfo;
  run: (fn: () => Promise<unknown>, after?: () => void) => Promise<boolean>;
  onLeft: () => void;
  dialogId: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold">{peer.title}</div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{peer.kind}</div>
      </div>
      {peer.username ? <Row label="Username" value={`@${peer.username}`} /> : null}
      {peer.kind === "user" && peer.phone ? <Row label="Phone" value={`+${peer.phone}`} /> : null}
      {peer.kind !== "user" && peer.memberCount !== undefined ? (
        <Row label="Members" value={String(peer.memberCount)} />
      ) : null}
      {peer.about ? (
        <div>
          <div className="field-label mb-1 uppercase tracking-wider text-muted-foreground">
            About
          </div>
          <div className="whitespace-pre-wrap text-sm">{peer.about}</div>
        </div>
      ) : null}
      <div className="space-y-2 pt-2">
        <Action
          icon={<BellOff className="size-4" />}
          label={peer.muted ? "Unmute" : "Mute"}
          onClick={() => run(() => telegram.mute(dialogId, !peer.muted))}
        />
        <Action
          icon={<Archive className="size-4" />}
          label="Archive"
          onClick={() => run(() => telegram.archive(dialogId, true))}
        />
        {peer.kind === "user" ? (
          <Action
            icon={<Ban className="size-4" />}
            label={peer.blocked ? "Unblock" : "Block"}
            danger={!peer.blocked}
            onClick={() =>
              run(() => (peer.blocked ? telegram.unblock(dialogId) : telegram.block(dialogId)))
            }
          />
        ) : (
          <Action
            icon={<LogOut className="size-4" />}
            label="Leave"
            danger
            onClick={() => {
              if (confirm(`Leave ${peer.title}?`)) run(() => telegram.leave(dialogId), onLeft);
            }}
          />
        )}
        <Action
          icon={<MessageCircle className="size-4" />}
          label="Mark all as read"
          onClick={() => run(() => telegram.markRead(dialogId))}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="field-label uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function Action({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={danger ? "outline" : "secondary"}
      className={`w-full justify-start ${danger ? "text-destructive" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span className="ml-2">{label}</span>
    </Button>
  );
}
