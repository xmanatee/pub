import type { ReactNode, SelectHTMLAttributes } from "react";
import { Button, type ButtonProps } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { CONTROL_BAR_STYLES } from "./control-bar-styles";
import type { ControlBarAddon, ControlBarNotificationConfig } from "./control-bar-types";

export function ControlBarPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(CONTROL_BAR_STYLES.controlBar, CONTROL_BAR_STYLES.controlHeight, className)}>
      {children}
    </div>
  );
}

export function ControlBarLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground", className)}>
      {children}
    </span>
  );
}

interface ControlBarIconActionProps
  extends Omit<ButtonProps, "aria-label" | "children" | "size" | "variant"> {
  icon: ReactNode;
  label: string;
  tooltip?: ReactNode;
  variant?: ButtonProps["variant"];
}

export function ControlBarIconAction({
  className,
  icon,
  label,
  tooltip,
  type = "button",
  variant = "ghost",
  ...buttonProps
}: ControlBarIconActionProps) {
  const button = (
    <Button
      type={type}
      variant={variant}
      size="control"
      className={cn(CONTROL_BAR_STYLES.actionButton, className)}
      aria-label={label}
      {...buttonProps}
    >
      {icon}
    </Button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function ControlBarTextAction({
  children,
  className,
  ...buttonProps
}: Omit<ButtonProps, "size" | "variant">) {
  return (
    <Button
      {...buttonProps}
      variant="ghost"
      size="control"
      className={cn("min-w-0 flex-1 truncate text-xs", className)}
    >
      {children}
    </Button>
  );
}

export function ControlBarSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...selectProps } = props;

  return (
    <select
      {...selectProps}
      className={cn(
        "min-w-0 flex-1 truncate rounded-full bg-transparent px-3 text-xs outline-none",
        className,
      )}
    >
      {children}
    </select>
  );
}

interface ControlBarNotificationProps {
  ariaLabel?: string;
  content: ReactNode;
  label: ReactNode;
  labelClassName?: string;
  onClick?: () => void;
}

export function ControlBarNotification({
  ariaLabel,
  content,
  label,
  labelClassName,
  onClick,
}: ControlBarNotificationProps) {
  const body = (
    <div className="truncate px-4 py-2.5 text-sm leading-tight">
      <span className={cn("font-semibold", labelClassName)}>{label}</span>
      <span className="text-muted-foreground">: </span>
      <span className="text-foreground">{content}</span>
    </div>
  );

  if (!onClick) return <div className="w-full overflow-hidden text-left">{body}</div>;

  return (
    <button
      type="button"
      className="w-full overflow-hidden text-left"
      onClick={onClick}
      aria-label={ariaLabel ?? "Open notification"}
    >
      {body}
    </button>
  );
}

export function controlBarNotificationsToAddons(
  notifications: ControlBarNotificationConfig[],
): ControlBarAddon[] {
  return notifications.map((notification) => ({
    key: notification.key,
    priority: notification.priority,
    content: (
      <ControlBarNotification
        ariaLabel={notification.ariaLabel}
        content={notification.content}
        label={notification.label}
        labelClassName={notification.labelClassName}
        onClick={notification.onClick}
      />
    ),
  }));
}
