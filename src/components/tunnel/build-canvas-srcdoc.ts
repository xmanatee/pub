const CANVAS_DEBUG_BRIDGE_SCRIPT = `<script>(function(){const notify=(payload)=>{try{parent.postMessage({source:"pubblue-canvas",...payload},"*")}catch{}};window.addEventListener("error",function(ev){notify({type:"error",message:ev.message||"Script error",filename:ev.filename||"",lineno:ev.lineno||0,colno:ev.colno||0});});window.addEventListener("unhandledrejection",function(ev){const reason=ev.reason;notify({type:"error",message:(reason&&reason.message)?reason.message:String(reason??"Unhandled promise rejection")});});})();</script>`;

function injectHead(html: string): string {
  if (/<head(\s|>)/i.test(html)) {
    return html.replace(
      /<head(\s[^>]*)?>/i,
      (match) => `${match}<base target="_blank">${CANVAS_DEBUG_BRIDGE_SCRIPT}`,
    );
  }

  if (/<html(\s|>)/i.test(html)) {
    return html.replace(
      /<html(\s[^>]*)?>/i,
      (match) => `${match}<head><base target="_blank">${CANVAS_DEBUG_BRIDGE_SCRIPT}</head>`,
    );
  }

  return `<!doctype html><html><head><base target="_blank">${CANVAS_DEBUG_BRIDGE_SCRIPT}</head><body>${html}</body></html>`;
}

export function buildCanvasSrcDoc(html: string): string {
  return injectHead(html);
}
