'use strict';
(() => {
  const current=document.currentScript;
  const BUILD='20260825-rc3-v700';
  const assetUrl=name=>{const u=new URL(name,current?.src||location.href);u.searchParams.set('v',BUILD);return u.href};
  const topLevel=window.top===window;
  function injectHardening(doc){
    if(!doc||doc.querySelector('script[data-tms-rc3-hardening]'))return;
    const s=doc.createElement('script');
    s.src=assetUrl('rc3-hardening.js');
    s.dataset.tmsRc3Hardening='1';
    s.async=false;
    s.onerror=()=>console.error('TMS60 RC3 hardening failed to load.');
    (doc.head||doc.documentElement).appendChild(s);
  }
  if(topLevel){
    const bindFrame=()=>{
      const frame=document.getElementById('app-frame');
      if(!frame)return;
      frame.addEventListener('load',()=>setTimeout(()=>injectHardening(frame.contentDocument),0));
      if(frame.contentDocument?.readyState==='complete')injectHardening(frame.contentDocument);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindFrame,{once:true});else bindFrame();
  }
  const legacy=document.createElement('script');
  legacy.src=assetUrl('enhancements-legacy.js');
  legacy.dataset.tmsVnextLegacy='1';
  legacy.async=false;
  legacy.onload=()=>{
    if(topLevel){
      const frame=document.getElementById('app-frame');
      if(frame?.contentDocument)injectHardening(frame.contentDocument);
    }else injectHardening(document);
  };
  legacy.onerror=()=>console.error('TMS60 legacy experience layer failed to load.');
  (document.head||document.documentElement).appendChild(legacy);
})();