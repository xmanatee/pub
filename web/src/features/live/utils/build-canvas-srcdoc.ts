import {
  CANVAS_TO_PARENT_SOURCE,
  PARENT_TO_CANVAS_SOURCE,
} from "@shared/canvas-bridge-protocol-core";
import { COMMAND_PROTOCOL_VERSION, extractManifestFromHtml } from "@shared/command-protocol-core";

const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_RESULT_GRACE_MS = 5_000;
const COMMAND_RESULT_GUARD_MS = 5 * 60_000;

function buildCanvasBridgeScript(enableCommands: boolean): string {
  const lines = [
    "<script>",
    "(function(){",
    "var notifyFailed=false;",
    `function notify(payload){if(notifyFailed){return;}try{parent.postMessage(payload,"*");}catch(error){notifyFailed=true;console.warn("pub canvas bridge postMessage failed",error);}}`,
    `function emit(type,payload){notify({source:"${CANVAS_TO_PARENT_SOURCE}",type:type,payload:payload&&typeof payload==="object"?payload:{}});}`,
    'window.addEventListener("error",function(ev){emit("error",{message:ev&&ev.message?ev.message:"Script error",filename:ev&&ev.filename?ev.filename:"",lineno:ev&&typeof ev.lineno==="number"?ev.lineno:0,colno:ev&&typeof ev.colno==="number"?ev.colno:0});});',
    'window.addEventListener("unhandledrejection",function(ev){var reason=ev&&ev.reason;var message=reason&&reason.message?reason.message:String(reason||"Unhandled promise rejection");emit("error",{message:message});});',
    'emit("ready",{});',
    "})();",
    "</script>",
  ];

  if (enableCommands) {
    lines.splice(
      3,
      0,
      "var callSeq=0;",
      "var pendingCalls={};",
      'function nextCallId(){callSeq+=1;return"cmd-"+Date.now().toString(36)+"-"+callSeq.toString(36)+"-"+Math.random().toString(36).slice(2,6);}',
      "function clearPending(callId,ok,payload){var pending=pendingCalls[callId];if(!pending){return;}delete pendingCalls[callId];if(pending.timer){clearTimeout(pending.timer);}if(ok){pending.resolve(payload);}else{pending.reject(payload instanceof Error?payload:new Error(payload));}}",
      `function getGuardTimeoutMs(requestedTimeoutMs){var effectiveTimeoutMs=typeof requestedTimeoutMs==="number"&&requestedTimeoutMs>0?requestedTimeoutMs:${DEFAULT_COMMAND_TIMEOUT_MS};return Math.max(effectiveTimeoutMs+${COMMAND_RESULT_GRACE_MS},${COMMAND_RESULT_GUARD_MS});}`,
      `function invokeCommand(name,args,options){var callId=nextCallId();var requestedTimeoutMs=options&&typeof options.timeoutMs==="number"&&options.timeoutMs>0?options.timeoutMs:undefined;var guardTimeoutMs=getGuardTimeoutMs(requestedTimeoutMs);var resultPromise=new Promise(function(resolve,reject){var timer=setTimeout(function(){clearPending(callId,false,"Timed out waiting for command result after "+guardTimeoutMs+"ms");},guardTimeoutMs);pendingCalls[callId]={resolve:resolve,reject:reject,timer:timer};});var payload={v:${COMMAND_PROTOCOL_VERSION},callId:callId,name:name,args:args&&typeof args==="object"?args:{}};if(requestedTimeoutMs!==undefined){payload.timeoutMs=requestedTimeoutMs;}emit("command.invoke",payload);return resultPromise;}`,
      `function cancelCommand(callId,reason){if(typeof callId!=="string"||callId.length===0){return;}emit("command.cancel",{v:${COMMAND_PROTOCOL_VERSION},callId:callId,reason:typeof reason==="string"?reason:undefined});}`,
      'function ensurePubApi(){var api=(window.pub&&typeof window.pub==="object")?window.pub:{};api.command=invokeCommand;api.cancelCommand=cancelCommand;api.commands=new Proxy({},{get:function(t,name){if(typeof name!=="string"){return undefined;}return function(args,options){return invokeCommand(name,args,{timeoutMs:options&&options.timeoutMs});};}});window.pub=api;}',
      "ensurePubApi();",
      `window.addEventListener("message",function(ev){var data=ev&&ev.data;var payload;if(!data||data.source!=="${PARENT_TO_CANVAS_SOURCE}"||data.type!=="command.result"||!data.payload||typeof data.payload!=="object"){return;}payload=data.payload;if(payload.ok){clearPending(payload.callId,true,payload.value);}else{var errMessage=payload.error&&payload.error.message?payload.error.message:"Command failed";clearPending(payload.callId,false,errMessage);}});`,
    );
  }

  return lines.join("");
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
  const hasCommandManifest = extractManifestFromHtml(html) !== null;
  const script = buildCanvasBridgeScript(hasCommandManifest);
  return injectHead(html, script);
}
