const TEXT_PREVIEW_STYLES = `<style>
body{margin:0;padding:12px;font-family:system-ui,sans-serif;font-size:11px;line-height:1.5;overflow:hidden;color:#1a1a1a}
pre{background:#f5f5f5;padding:.5em;overflow:hidden;border-radius:3px;font-size:10px}
code{background:#f5f5f5;padding:.1em .3em;border-radius:2px;font-size:10px}
img{max-width:100%;height:auto}
</style>`;

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildTextSrcdoc(content: string, contentType: string) {
  if (contentType === "text")
    return `${TEXT_PREVIEW_STYLES}<pre style="white-space:pre-wrap;font-size:10px">${escapeHtml(content)}</pre>`;
  return `${TEXT_PREVIEW_STYLES}<div>${escapeHtml(content)}</div>`;
}

export function buildHtmlSrcdoc(content: string) {
  return `${TEXT_PREVIEW_STYLES}${content}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(diff / (1000 * 60));
  return `${minutes}m`;
}
