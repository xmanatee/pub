import { PREVIEW_SNAPSHOT_SOURCE } from "../../../shared/preview-snapshot-core";

const MIN_WAIT_MS = 500;
const MAX_WAIT_MS = 3000;
const IDLE_MS = 300;
const POLL_MS = 100;

export function buildPreviewSnapshotScript(): string {
  return [
    "<script>",
    "(function(){",
    `var SRC="${PREVIEW_SNAPSHOT_SOURCE}";`,
    `var MIN=${MIN_WAIT_MS},MAX=${MAX_WAIT_MS},IDLE=${IDLE_MS},POLL=${POLL_MS};`,

    // Extract all accessible CSSOM rules (captures CSS-in-JS insertRule styles)
    "function extractCss(){",
    "var out=[],s=document.styleSheets;",
    "for(var i=0;i<s.length;i++){try{var r=s[i].cssRules;",
    "if(r)for(var j=0;j<r.length;j++)out.push(r[j].cssText);",
    "}catch(e){}}return out;}",

    // Replace <canvas> in clone with <img> snapshots from the live DOM
    "function capCanvas(orig,clone){",
    "var oc=orig.querySelectorAll('canvas'),cc=clone.querySelectorAll('canvas');",
    "for(var i=0;i<oc.length&&i<cc.length;i++){try{",
    "var img=document.createElement('img');",
    "img.src=oc[i].toDataURL();img.width=oc[i].width;img.height=oc[i].height;",
    "img.style.cssText=oc[i].style.cssText;img.className=oc[i].className;",
    "cc[i].parentNode.replaceChild(img,cc[i]);",
    "}catch(e){}}}",

    // Check that the page has rendered something visible
    "function hasContent(){",
    "var b=document.body;if(!b)return false;",
    "if(b.innerText.trim().length>0)return true;",
    "return!!b.querySelector('img,svg,canvas,video,picture,table');}",

    // Build and send the snapshot
    "function snap(){",
    "if(!hasContent())return;",
    "var rules=extractCss();",
    "var c=document.documentElement.cloneNode(true);",
    "capCanvas(document.documentElement,c);",
    // Remove scripts
    "c.querySelectorAll('script').forEach(function(e){e.remove()});",
    // Remove noscript (would display in sandbox="")
    "c.querySelectorAll('noscript').forEach(function(e){e.remove()});",
    // Remove inline event handlers (on* attributes)
    "var all=c.querySelectorAll('*');",
    "for(var i=0;i<all.length;i++){var a=all[i].attributes;",
    "for(var j=a.length-1;j>=0;j--){",
    "if(a[j].name.lastIndexOf('on',0)===0)all[i].removeAttribute(a[j].name);}}",
    // Inject extracted CSS rules as a <style> block
    "if(rules.length>0){",
    "var h=c.querySelector('head');",
    "if(!h){h=document.createElement('head');c.insertBefore(h,c.firstChild);}",
    "var st=document.createElement('style');",
    "st.textContent=rules.join('\\n');h.appendChild(st);}",
    // Send to parent
    "parent.postMessage({source:SRC,type:'snapshot',html:c.outerHTML},'*');}",

    // MutationObserver-based idle detection
    "function waitAndSnap(){",
    "var t0=Date.now(),tM=t0;",
    "var target=document.body||document.documentElement;",
    "var obs=new MutationObserver(function(){tM=Date.now();});",
    "obs.observe(target,{childList:true,subtree:true,attributes:true,characterData:true});",
    "function check(){var now=Date.now();",
    "if(now-t0>=MAX){obs.disconnect();snap();return;}",
    "if(now-t0>=MIN&&now-tM>=IDLE){obs.disconnect();snap();return;}",
    `setTimeout(check,POLL);}setTimeout(check,MIN);}`,

    "if(document.readyState==='loading'){",
    "document.addEventListener('DOMContentLoaded',waitAndSnap);",
    "}else{waitAndSnap();}",
    "})();",
    "</script>",
  ].join("");
}

export function injectIntoHead(content: string, injection: string): string {
  const match = content.match(/<\/head\s*>/i);
  if (match?.index !== undefined) {
    return content.slice(0, match.index) + injection + content.slice(match.index);
  }
  return `<head>${injection}</head>${content}`;
}
