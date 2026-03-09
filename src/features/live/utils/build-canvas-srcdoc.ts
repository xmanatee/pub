function buildCanvasBridgeScript(): string {
  return [
    "<script>",
    "(function(){",
    "var notifyFailed=false;",
    "var callSeq=0;",
    "var pendingCalls={};",
    'function nextCallId(){callSeq+=1;return"cmd-"+Date.now().toString(36)+"-"+callSeq.toString(36)+"-"+Math.random().toString(36).slice(2,6);}',
    'function notify(payload){if(notifyFailed){return;}payload.source="pubblue-canvas";try{parent.postMessage(payload,"*");}catch(error){notifyFailed=true;console.warn("pubblue canvas bridge postMessage failed",error);}}',
    'function emit(type,details){var payload={type:type};if(details&&typeof details==="object"){for(var key in details){if(Object.prototype.hasOwnProperty.call(details,key)){payload[key]=details[key];}}}notify(payload);}',
    "function clearPending(callId,ok,payload){var pending=pendingCalls[callId];if(!pending){return;}delete pendingCalls[callId];if(pending.timer){clearTimeout(pending.timer);}if(ok){pending.resolve(payload);}else{pending.reject(payload instanceof Error?payload:new Error(payload));}}",
    'function invokeCommand(name,args,options){var callId=nextCallId();var timeoutMs=15000;if(options&&typeof options.timeoutMs==="number"&&options.timeoutMs>0){timeoutMs=options.timeoutMs;}var resultPromise=new Promise(function(resolve,reject){var timer=setTimeout(function(){clearPending(callId,false,"Command timed out after "+timeoutMs+"ms");},timeoutMs);pendingCalls[callId]={resolve:resolve,reject:reject,timer:timer};});emit("command.invoke",{callId:callId,name:name,args:args&&typeof args==="object"?args:{},timeoutMs:timeoutMs});return resultPromise;}',
    'function cancelCommand(callId,reason){if(typeof callId!=="string"||callId.length===0){return;}emit("command.cancel",{callId:callId,reason:typeof reason==="string"?reason:undefined});}',
    'function ensurePubblueApi(){var pubblue=(window.pubblue&&typeof window.pubblue==="object")?window.pubblue:{};pubblue.command=invokeCommand;pubblue.cancelCommand=cancelCommand;pubblue.commands=new Proxy({},{get:function(t,name){if(typeof name!=="string"){return undefined;}return function(args,options){return invokeCommand(name,args,{timeoutMs:options&&options.timeoutMs});};}});window.pubblue=pubblue;}',
    "ensurePubblueApi();",
    'window.addEventListener("error",function(ev){emit("error",{message:ev&&ev.message?ev.message:"Script error",filename:ev&&ev.filename?ev.filename:"",lineno:ev&&typeof ev.lineno==="number"?ev.lineno:0,colno:ev&&typeof ev.colno==="number"?ev.colno:0});});',
    'window.addEventListener("unhandledrejection",function(ev){var reason=ev&&ev.reason;var message=reason&&reason.message?reason.message:String(reason||"Unhandled promise rejection");emit("error",{message:message});});',
    'window.addEventListener("message",function(ev){var data=ev&&ev.data;if(!data||data.source!=="pubblue-parent"){return;}if(data.type==="command.result"){if(data.ok){clearPending(data.callId,true,data.value);}else{var errMessage=data.error&&data.error.message?data.error.message:"Command failed";clearPending(data.callId,false,errMessage);}}});',
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
