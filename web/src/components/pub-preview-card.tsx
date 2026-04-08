import { FileText } from "lucide-react";
import { useCallback, useState } from "react";
import { getConvexSiteUrl } from "~/lib/convex-url";

interface PubPreviewCardProps {
  slug: string;
  title?: string;
  description?: string;
  themeColor?: string;
  iconUrl?: string;
}

function resolveIconUrl(slug: string, iconUrl: string): string {
  if (
    iconUrl.startsWith("http://") ||
    iconUrl.startsWith("https://") ||
    iconUrl.startsWith("data:")
  )
    return iconUrl;
  const base = `${getConvexSiteUrl()}/serve/${encodeURIComponent(slug)}/`;
  return new URL(iconUrl, base).href;
}

export function PubPreviewCard({
  slug,
  title,
  description,
  themeColor,
  iconUrl,
}: PubPreviewCardProps) {
  const hasContent = title || description;
  const resolvedIcon = iconUrl ? resolveIconUrl(slug, iconUrl) : undefined;
  const [iconError, setIconError] = useState(false);
  const handleIconError = useCallback(() => setIconError(true), []);

  return (
    <div className="h-full w-full flex bg-muted/30 overflow-hidden">
      {themeColor ? (
        <div className="w-1.5 shrink-0" style={{ backgroundColor: themeColor }} />
      ) : (
        <div className="w-1.5 shrink-0 bg-border/50" />
      )}
      <div className="flex-1 min-w-0 p-4 flex flex-col justify-center gap-2">
        {hasContent ? (
          <div className="flex items-start gap-3">
            {resolvedIcon && !iconError ? (
              <img
                src={resolvedIcon}
                alt=""
                className="h-8 w-8 rounded-md shrink-0 object-cover"
                onError={handleIconError}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-snug truncate">{title || slug}</p>
              {description ? (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
              <FileText className="h-8 w-8" aria-hidden="true" />
              <span className="text-xs font-medium">{slug}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
