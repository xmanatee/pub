import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "~/core/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/15 text-primary",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border bg-transparent text-foreground",
        muted: "bg-muted text-muted-foreground",
        success: "bg-green-500/15 text-green-600 dark:text-green-300",
        warning: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
        destructive: "bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
