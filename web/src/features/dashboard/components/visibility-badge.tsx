import { Globe, Lock } from "lucide-react";
import { Badge } from "~/components/ui/badge";

export function VisibilityBadge({ isPublic }: { isPublic: boolean }) {
  return isPublic ? (
    <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-600/20">
      <Globe className="h-3 w-3" aria-hidden="true" /> public
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-amber-600 border-amber-600/20">
      <Lock className="h-3 w-3" aria-hidden="true" /> private
    </Badge>
  );
}
