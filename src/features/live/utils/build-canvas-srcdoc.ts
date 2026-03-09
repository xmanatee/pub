function buildCanvasBridgeScript(): string {
  return [
    "<script>",
    "(function(){",
    "var notifyFailed=false;",
    "var callSeq=0;",
    "var pendingCalls={};",
    "var manifestRetryTimer=null;",
    "var manifestRetryCount=0;",
    "var manifestBound=false;",
    "var manifestPayload=null;",
    'function nextCallId(){callSeq+=1;return"cmd-"+Date.now().toString(36)+"-"+callSeq.toString(36)+"-"+Math.random().toString(36).slice(2,6);}',
    'function toErrorMessage(error){if(!error){return"Unknown error";}if(error.message){return String(error.message);}return String(error);}',
    'function notify(payload){if(notifyFailed){return;}payload.source="pubblue-canvas";try{parent.postMessage(payload,"*");}catch(error){notifyFailed=true;console.warn("pubblue canvas bridge postMessage failed",error);}}',
    'function emit(type,details){var payload={type:type};if(details&&typeof details==="object"){for(var key in details){if(Object.prototype.hasOwnProperty.call(details,key)){payload[key]=details[key];}}}notify(payload);}',
    "function clearPending(callId,ok,payload){var pending=pendingCalls[callId];if(!pending){return;}delete pendingCalls[callId];if(pending.timer){clearTimeout(pending.timer);}if(ok){pending.resolve(payload);}else{pending.reject(payload instanceof Error?payload:new Error(payload));}}",
    'function invokeCommand(name,args,options){var callId=nextCallId();var timeoutMs=15000;if(options&&typeof options.timeoutMs==="number"&&options.timeoutMs>0){timeoutMs=options.timeoutMs;}var resultPromise=new Promise(function(resolve,reject){var timer=setTimeout(function(){clearPending(callId,false,"Command timed out after "+timeoutMs+"ms");},timeoutMs);pendingCalls[callId]={resolve:resolve,reject:reject,timer:timer};});emit("command.invoke",{callId:callId,name:name,args:args&&typeof args==="object"?args:{},timeoutMs:timeoutMs});return resultPromise;}',
    'function cancelCommand(callId,reason){if(typeof callId!=="string"||callId.length===0){return;}emit("command.cancel",{callId:callId,reason:typeof reason==="string"?reason:undefined});}',
    'function parseManifestFunctions(raw){if(Array.isArray(raw)){return raw.filter(function(entry){return !!entry&&typeof entry==="object";});}if(!raw||typeof raw!=="object"){return [];}var list=[];for(var name in raw){if(!Object.prototype.hasOwnProperty.call(raw,name)){continue;}var value=raw[name];if(!value||typeof value!=="object"){continue;}var entry={name:name};for(var key in value){if(Object.prototype.hasOwnProperty.call(value,key)){entry[key]=value[key];}}list.push(entry);}return list;}',
    'function readCommandManifest(){var node=document.querySelector(\'script[type="application/pubblue-command-manifest+json"]\');if(!node){return null;}var raw=(node.textContent||"").trim();if(raw.length===0){return null;}var parsed=JSON.parse(raw);if(!parsed||typeof parsed!=="object"){return null;}var manifestId=typeof parsed.manifestId==="string"&&parsed.manifestId.length>0?parsed.manifestId:"manifest-"+Date.now().toString(36);var functions=parseManifestFunctions(parsed.functions);return{v:typeof parsed.version==="number"?parsed.version:1,manifestId:manifestId,functions:functions};}',
    "function stopManifestBindingRetry(){if(manifestRetryTimer){clearTimeout(manifestRetryTimer);manifestRetryTimer=null;}}",
    'function emitManifestBind(){if(!manifestPayload||manifestBound){return;}manifestRetryCount+=1;emit("command.bind",manifestPayload);}',
    "function scheduleManifestBindRetry(){if(!manifestPayload||manifestBound){return;}var delay=Math.min(400*Math.pow(1.5,manifestRetryCount),5000);manifestRetryTimer=setTimeout(function(){manifestRetryTimer=null;emitManifestBind();scheduleManifestBindRetry();},delay);}",
    "function startManifestBinding(manifest){manifestPayload=manifest;manifestRetryCount=0;manifestBound=false;emitManifestBind();scheduleManifestBindRetry();}",
    'function applyCommandBindings(bindings){if(!bindings||typeof bindings!=="object"){return;}var pubblue=(window.pubblue&&typeof window.pubblue==="object")?window.pubblue:{};var commandMap={};if(pubblue.commands&&typeof pubblue.commands==="object"){commandMap=pubblue.commands;}var accepted=Array.isArray(bindings.accepted)?bindings.accepted:[];for(var i=0;i<accepted.length;i+=1){var entry=accepted[i];if(!entry||typeof entry!=="object"){continue;}var name=typeof entry.name==="string"?entry.name:"";if(name.length===0){continue;}commandMap[name]=(function(commandName){return function(args,options){return invokeCommand(commandName,args,{timeoutMs:options&&options.timeoutMs});};})(name);}pubblue.commands=commandMap;window.pubblue=pubblue;}',
    'function ensurePubblueApi(){var pubblue=(window.pubblue&&typeof window.pubblue==="object")?window.pubblue:{};pubblue.command=invokeCommand;pubblue.cancelCommand=cancelCommand;if(!pubblue.commands||typeof pubblue.commands!=="object"){pubblue.commands={};}window.pubblue=pubblue;}',
    "ensurePubblueApi();",
    'window.addEventListener("error",function(ev){emit("error",{message:ev&&ev.message?ev.message:"Script error",filename:ev&&ev.filename?ev.filename:"",lineno:ev&&typeof ev.lineno==="number"?ev.lineno:0,colno:ev&&typeof ev.colno==="number"?ev.colno:0});});',
    'window.addEventListener("unhandledrejection",function(ev){var reason=ev&&ev.reason;var message=reason&&reason.message?reason.message:String(reason||"Unhandled promise rejection");emit("error",{message:message});});',
    'window.addEventListener("message",function(ev){var data=ev&&ev.data;if(!data||data.source!=="pubblue-parent"){return;}if(data.type==="command.bind.result"){manifestBound=true;stopManifestBindingRetry();applyCommandBindings(data);}if(data.type==="command.result"){if(data.ok){clearPending(data.callId,true,data.value);}else{var errMessage=data.error&&data.error.message?data.error.message:"Command failed";clearPending(data.callId,false,errMessage);}}});',
    'function tryBindManifest(){try{var manifest=readCommandManifest();if(manifest){startManifestBinding(manifest);}}catch(error){emit("error",{message:"Failed to parse command manifest: "+toErrorMessage(error)});}}',
    'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",tryBindManifest);}else{tryBindManifest();}',
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
  const script = buildCanvasBridgeScript();
  return injectHead(html, script);
}
