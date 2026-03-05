const CANVAS_DEBUG_BRIDGE_SCRIPT = [
  "<script>",
  "(function(){",
  "var notifyFailed=false;",
  'function notify(payload){if(notifyFailed){return;}try{parent.postMessage(payload,"*");}catch(error){notifyFailed=true;if(typeof console!=="undefined"&&typeof console.warn==="function"){console.warn("pubblue canvas bridge postMessage failed",error);}}}',
  "function emit(type,details){",
  'var payload={source:"pubblue-canvas",type:type};',
  'if(details&&typeof details==="object"){',
  "for(var key in details){",
  "if(Object.prototype.hasOwnProperty.call(details,key)){payload[key]=details[key];}",
  "}",
  "}",
  "notify(payload);",
  "}",
  'window.addEventListener("error",function(ev){',
  'emit("error",{',
  'message:ev&&ev.message?ev.message:"Script error",',
  'filename:ev&&ev.filename?ev.filename:"",',
  'lineno:ev&&typeof ev.lineno==="number"?ev.lineno:0,',
  'colno:ev&&typeof ev.colno==="number"?ev.colno:0',
  "});",
  "});",
  'window.addEventListener("unhandledrejection",function(ev){',
  "var reason=ev&&ev.reason;",
  'var message=reason&&reason.message?reason.message:String(reason||"Unhandled promise rejection");',
  'emit("error",{message:message});',
  "});",
  "})();",
  "</script>",
].join("");

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
