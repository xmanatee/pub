import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/ui/card";
import { ScrollArea } from "~/core/ui/scroll-area";

export function PanelShell({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <div className="text-muted-foreground">{icon}</div>
        <CardTitle className="flex-1 text-sm font-medium">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-2 px-5 pb-5">{children}</div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
