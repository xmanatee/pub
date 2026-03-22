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

    `window.addEventListener("message",function(ev){var data=ev&&ev.data;if(!data||data.source!=="${PARENT_TO_CANVAS_SOURCE}"){return;}if(data.type==="preview.capture"){capturePreview();return;}var payload=data.payload;if(!payload||typeof payload!=="object"){return;}if(data.type==="command.result"){if(payload.ok){clearPending(payload.callId,true,payload.value);}else{var commandErrorMessage=payload.error&&payload.error.message?payload.error.message:"Command failed";clearPending(payload.callId,false,commandErrorMessage);}}});`,
    'window.addEventListener("error",function(ev){emit("error",{message:ev&&ev.message?ev.message:"Script error",filename:ev&&ev.filename?ev.filename:"",lineno:ev&&typeof ev.lineno==="number"?ev.lineno:0,colno:ev&&typeof ev.colno==="number"?ev.colno:0});});',
    'window.addEventListener("unhandledrejection",function(ev){var reason=ev&&ev.reason;var message=reason&&reason.message?reason.message:String(reason||"Unhandled promise rejection");emit("error",{message:message});});',
    'var origConsoleError=console.error;console.error=function(){origConsoleError.apply(console,arguments);try{var parts=[];for(var i=0;i<arguments.length;i++){parts.push(arguments[i] instanceof Error?arguments[i].message:String(arguments[i]));}var msg=parts.join(" ");if(msg.length>0){emit("console-error",{message:msg});}}catch(e){}};',
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

export function buildCanvasSrcDoc(html: string): string {
  return injectHead(html, buildCanvasBridgeScript());
}

/**
 * Build HTML for the sandbox iframe (Service Worker mode).
 * Injects the bridge script (window.pub commands API) + an SW relay script
 * that forwards pub-fs-request messages from the Service Worker to the parent page.
 */
export function buildSandboxHtml(html: string): string {
  const swRelay = [
    "<script>",
    "(function(){",
    'if(!("serviceWorker" in navigator))return;',
    'navigator.serviceWorker.addEventListener("message",function(e){',
    'if(e.data&&e.data.type==="pub-fs-request"){',
    'parent.postMessage(e.data,"*",e.ports);',
    "}",
    "});",
    "})();",
    "</script>",
  ].join("");
  return injectHead(html, buildCanvasBridgeScript() + swRelay);
}
