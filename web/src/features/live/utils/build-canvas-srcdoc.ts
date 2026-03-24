import {
  CANVAS_TO_PARENT_SOURCE,
  PARENT_TO_CANVAS_SOURCE,
} from "@shared/canvas-bridge-protocol-core";
import {
  COMMAND_PROTOCOL_VERSION,
  DEFAULT_COMMAND_TIMEOUT_MS,
} from "@shared/command-protocol-core";

const COMMAND_RESULT_GRACE_MS = 5_000;
const COMMAND_RESULT_GUARD_MS = 5 * 60_000;

/**
 * Build the canvas bridge script that provides window.pub API inside the iframe.
 *
 * This script is idempotent across document.write() cycles:
 * - The message handler is stored on window and swapped (remove old, add new)
 *   so duplicate listeners never accumulate.
 * - The inject-content handler is re-registered after each document.write() so
 *   subsequent canvas updates are received. sandbox/index.html provides the
 *   initial handler; this script takes over for all later cycles.
 * - The console.error wrapper stores the original once and reuses it.
 * - Assignment-based handlers (onerror, onunhandledrejection) naturally overwrite.
 */
function buildCanvasBridgeScript(): string {
  return [
    "<script>",
    "(function(){",
    "var notifyFailed=false;",
    "var callSeq=0;",
    "var pendingCalls={};",
    'function nextCallId(){callSeq+=1;return"cmd-"+Date.now().toString(36)+"-"+callSeq.toString(36)+"-"+Math.random().toString(36).slice(2,6);}',
    "function clearPending(callId,ok,payload){var pending=pendingCalls[callId];if(!pending){return;}delete pendingCalls[callId];if(pending.timer){clearTimeout(pending.timer);}if(ok){pending.resolve(payload);}else{pending.reject(payload instanceof Error?payload:new Error(payload));}}",
    `function getGuardTimeoutMs(requestedTimeoutMs,defaultTimeoutMs){var effectiveTimeoutMs=typeof requestedTimeoutMs==="number"&&requestedTimeoutMs>0?requestedTimeoutMs:defaultTimeoutMs;return Math.max(effectiveTimeoutMs+${COMMAND_RESULT_GRACE_MS},${COMMAND_RESULT_GUARD_MS});}`,
    `function createPendingCall(callId,requestedTimeoutMs,defaultTimeoutMs,label){var guardTimeoutMs=getGuardTimeoutMs(requestedTimeoutMs,defaultTimeoutMs);var resultPromise=new Promise(function(resolve,reject){var timer=setTimeout(function(){clearPending(callId,false,"Timed out waiting for "+label+" after "+guardTimeoutMs+"ms");},guardTimeoutMs);pendingCalls[callId]={resolve:resolve,reject:reject,timer:timer};});return{guardTimeoutMs:guardTimeoutMs,resultPromise:resultPromise};}`,
    `function notify(payload,transfer){if(notifyFailed){return;}try{parent.postMessage(payload,"*",Array.isArray(transfer)?transfer:[]);}catch(error){notifyFailed=true;console.warn("pub canvas bridge postMessage failed",error);}}`,
    `function emit(type,payload,transfer){notify({source:"${CANVAS_TO_PARENT_SOURCE}",type:type,payload:payload&&typeof payload==="object"?payload:{}},transfer);}`,
    `function invokeCommand(name,args,options){var callId=nextCallId();var requestedTimeoutMs=options&&typeof options.timeoutMs==="number"&&options.timeoutMs>0?options.timeoutMs:undefined;var pending=createPendingCall(callId,requestedTimeoutMs,${DEFAULT_COMMAND_TIMEOUT_MS},"command result");var payload={v:${COMMAND_PROTOCOL_VERSION},callId:callId,name:name,args:args&&typeof args==="object"?args:{}};if(requestedTimeoutMs!==undefined){payload.timeoutMs=requestedTimeoutMs;}emit("command.invoke",payload);return pending.resultPromise;}`,
    `function cancelCommand(callId,reason){if(typeof callId!=="string"||callId.length===0){return;}emit("command.cancel",{v:${COMMAND_PROTOCOL_VERSION},callId:callId,reason:typeof reason==="string"?reason:undefined});}`,
    'function ensurePubApi(){var api=(window.pub&&typeof window.pub==="object")?window.pub:{};api.command=invokeCommand;api.cancelCommand=cancelCommand;api.commands=new Proxy({},{get:function(t,name){if(typeof name!=="string"){return undefined;}return function(args,options){return invokeCommand(name,args,{timeoutMs:options&&options.timeoutMs});};}});window.pub=api;}',
    "ensurePubApi();",

    "function capturePreview(){",
    "var c=document.documentElement.cloneNode(true);",
    "var rules=[];",
    "for(var i=0;i<document.styleSheets.length;i++){try{var r=document.styleSheets[i].cssRules;if(r)for(var j=0;j<r.length;j++)rules.push(r[j].cssText);}catch(e){}}",
    "var oc=document.querySelectorAll('canvas'),cc=c.querySelectorAll('canvas');",
    "for(var i=0;i<oc.length&&i<cc.length;i++){try{var img=document.createElement('img');img.src=oc[i].toDataURL();img.width=oc[i].width;img.height=oc[i].height;img.style.cssText=oc[i].style.cssText;img.className=oc[i].className;cc[i].parentNode.replaceChild(img,cc[i]);}catch(e){}}",
    "for(var el of c.querySelectorAll('script'))el.remove();",
    "for(var el of c.querySelectorAll('noscript'))el.remove();",
    "var all=c.querySelectorAll('*');for(var i=0;i<all.length;i++){var a=all[i].attributes;for(var j=a.length-1;j>=0;j--){if(a[j].name.lastIndexOf('on',0)===0)all[i].removeAttribute(a[j].name);}}",
    "if(rules.length>0){var h=c.querySelector('head');if(!h){h=document.createElement('head');c.insertBefore(h,c.firstChild);}var st=document.createElement('style');st.textContent=rules.join('\\n');h.appendChild(st);}",
    "emit('preview.captured',{html:c.outerHTML});}",

    // Swap handler — window persists across document.write(), so remove the old one first.
    `var handler=function(ev){var data=ev&&ev.data;if(!data||data.source!=="${PARENT_TO_CANVAS_SOURCE}"){return;}if(data.type==="preview.capture"){capturePreview();return;}var payload=data.payload;if(!payload||typeof payload!=="object"){return;}if(data.type==="command.result"){if(payload.ok){clearPending(payload.callId,true,payload.value);}else{var commandErrorMessage=payload.error&&payload.error.message?payload.error.message:"Command failed";clearPending(payload.callId,false,commandErrorMessage);}}};`,
    'if(window.__pubBridgeHandler){window.removeEventListener("message",window.__pubBridgeHandler);}',
    'window.__pubBridgeHandler=handler;window.addEventListener("message",handler);',

    'window.onerror=function(message,source,lineno,colno,error){var resolvedMessage=error&&error.message?error.message:(typeof message==="string"&&message?message:"Script error");emit("error",{message:resolvedMessage,filename:typeof source==="string"?source:"",lineno:typeof lineno==="number"?lineno:0,colno:typeof colno==="number"?colno:0});return false;};',
    'window.onunhandledrejection=function(ev){var reason=ev&&ev.reason;var message=reason&&reason.message?reason.message:String(reason||"Unhandled promise rejection");emit("error",{message:message});};',

    // Store the real console.error once — re-capturing would chain wrappers.
    "if(!window.__pubOrigConsoleError){window.__pubOrigConsoleError=console.error;}",
    'var origConsoleError=window.__pubOrigConsoleError;console.error=function(){origConsoleError.apply(console,arguments);try{var parts=[];for(var i=0;i<arguments.length;i++){parts.push(arguments[i] instanceof Error?arguments[i].message:String(arguments[i]));}var msg=parts.join(" ");if(msg.length>0){emit("console-error",{message:msg});}}catch(e){}};',

    // Re-register inject-content handler — document.write() destroys the one from sandbox/index.html.
    // Uses the same swap pattern as __pubBridgeHandler to prevent duplicate listeners.
    `var injectHandler=function(ev){var d=ev&&ev.data;if(!d||d.source!=="${PARENT_TO_CANVAS_SOURCE}"||d.type!=="inject-content"||typeof d.html!=="string"){return;}document.open();document.write(d.html);document.close();};`,
    'if(window.__pubInjectHandler){window.removeEventListener("message",window.__pubInjectHandler);}',
    'window.__pubInjectHandler=injectHandler;window.addEventListener("message",injectHandler);',

    'emit("ready",{});',
    "})();",
    "</script>",
  ].join("");
}

function injectHead(html: string, script: string): string {
  if (/<head(\s|>)/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}<base target="_blank">${script}`);
  }

  if (/<html(\s|>)/i.test(html)) {
    return html.replace(
      /<html(\s[^>]*)?>/i,
      (match) => `${match}<head><base target="_blank">${script}</head>`,
    );
  }

  return `<!doctype html><html><head><base target="_blank">${script}</head><body>${html}</body></html>`;
}

/** Inject the canvas bridge script (window.pub API) into agent HTML. */
export function buildCanvasSrcDoc(html: string): string {
  return injectHead(html, buildCanvasBridgeScript());
}
