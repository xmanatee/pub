import {
  CANVAS_TO_PARENT_SOURCE,
  PARENT_TO_CANVAS_SOURCE,
} from "@shared/canvas-bridge-protocol-core";
import { MAX_CANVAS_FILE_BYTES } from "@shared/canvas-file-protocol-core";
import {
  COMMAND_PROTOCOL_VERSION,
  DEFAULT_COMMAND_TIMEOUT_MS,
} from "@shared/command-protocol-core";

const DEFAULT_FILE_TIMEOUT_MS = 30_000;
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
    `function normalizeMime(input){return typeof input==="string"&&input.trim().length>0?input.trim():undefined;}`,
    `function normalizeBinaryInput(input){if(input instanceof Blob){return input.arrayBuffer().then(function(bytes){return{bytes:bytes,mime:normalizeMime(input.type)};});}if(input instanceof ArrayBuffer){return Promise.resolve({bytes:input,mime:undefined});}if(typeof ArrayBuffer!=="undefined"&&ArrayBuffer.isView&&ArrayBuffer.isView(input)){return Promise.resolve({bytes:input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength),mime:undefined});}return Promise.reject(new Error("pub.files.upload expects a Blob, ArrayBuffer, or typed array."));}`,
    'function normalizeDownloadInput(input){if(typeof input==="string"&&input.trim().length>0){return{path:input.trim()};}if(input&&typeof input==="object"){var path=typeof input.path==="string"?input.path.trim():"";if(path.length===0){throw new Error("pub.files.download requires a non-empty path.");}var filename=typeof input.filename==="string"&&input.filename.trim().length>0?input.filename.trim():undefined;return{path:path,filename:filename};}throw new Error("pub.files.download expects a path string or { path, filename? }.");}',
    `function invokeCommand(name,args,options){var callId=nextCallId();var requestedTimeoutMs=options&&typeof options.timeoutMs==="number"&&options.timeoutMs>0?options.timeoutMs:undefined;var pending=createPendingCall(callId,requestedTimeoutMs,${DEFAULT_COMMAND_TIMEOUT_MS},"command result");var payload={v:${COMMAND_PROTOCOL_VERSION},callId:callId,name:name,args:args&&typeof args==="object"?args:{}};if(requestedTimeoutMs!==undefined){payload.timeoutMs=requestedTimeoutMs;}emit("command.invoke",payload);return pending.resultPromise;}`,
    `function cancelCommand(callId,reason){if(typeof callId!=="string"||callId.length===0){return;}emit("command.cancel",{v:${COMMAND_PROTOCOL_VERSION},callId:callId,reason:typeof reason==="string"?reason:undefined});}`,
    `function uploadFile(input,options){return normalizeBinaryInput(input).then(function(normalized){var bytes=normalized.bytes;if(!(bytes instanceof ArrayBuffer)||bytes.byteLength===0){throw new Error("pub.files.upload requires non-empty bytes.");}if(bytes.byteLength>${MAX_CANVAS_FILE_BYTES}){throw new Error("pub.files.upload exceeds the "+${MAX_CANVAS_FILE_BYTES}+" byte limit.");}var requestId=nextCallId();var requestedTimeoutMs=options&&typeof options.timeoutMs==="number"&&options.timeoutMs>0?options.timeoutMs:undefined;var pending=createPendingCall(requestId,requestedTimeoutMs,${DEFAULT_FILE_TIMEOUT_MS},"file upload result");var mime=normalizeMime(options&&options.mime)||normalized.mime;emit("file.upload",{requestId:requestId,mime:mime,bytes:bytes},[bytes]);return pending.resultPromise;});}`,
    `function downloadFile(input,options){var resolved=normalizeDownloadInput(input);var requestId=nextCallId();var requestedTimeoutMs=options&&typeof options.timeoutMs==="number"&&options.timeoutMs>0?options.timeoutMs:undefined;var pending=createPendingCall(requestId,requestedTimeoutMs,${DEFAULT_FILE_TIMEOUT_MS},"file download result");var payload={requestId:requestId,path:resolved.path};if(resolved.filename){payload.filename=resolved.filename;}emit("file.download",payload);return pending.resultPromise;}`,
    'function ensurePubApi(){var api=(window.pub&&typeof window.pub==="object")?window.pub:{};var files=(api.files&&typeof api.files==="object")?api.files:{};api.command=invokeCommand;api.cancelCommand=cancelCommand;api.commands=new Proxy({},{get:function(t,name){if(typeof name!=="string"){return undefined;}return function(args,options){return invokeCommand(name,args,{timeoutMs:options&&options.timeoutMs});};}});files.upload=uploadFile;files.download=downloadFile;api.files=files;window.pub=api;}',
    "ensurePubApi();",
    `window.addEventListener("message",function(ev){var data=ev&&ev.data;var payload;if(!data||data.source!=="${PARENT_TO_CANVAS_SOURCE}"||!data.payload||typeof data.payload!=="object"){return;}payload=data.payload;if(data.type==="command.result"){if(payload.ok){clearPending(payload.callId,true,payload.value);}else{var commandErrorMessage=payload.error&&payload.error.message?payload.error.message:"Command failed";clearPending(payload.callId,false,commandErrorMessage);}return;}if(data.type==="file.result"){if(payload.ok){clearPending(payload.requestId,true,payload.file);}else{var fileErrorMessage=payload.error&&payload.error.message?payload.error.message:"File operation failed";clearPending(payload.requestId,false,fileErrorMessage);}}});`,
    'window.addEventListener("error",function(ev){emit("error",{message:ev&&ev.message?ev.message:"Script error",filename:ev&&ev.filename?ev.filename:"",lineno:ev&&typeof ev.lineno==="number"?ev.lineno:0,colno:ev&&typeof ev.colno==="number"?ev.colno:0});});',
    'window.addEventListener("unhandledrejection",function(ev){var reason=ev&&ev.reason;var message=reason&&reason.message?reason.message:String(reason||"Unhandled promise rejection");emit("error",{message:message});});',
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
