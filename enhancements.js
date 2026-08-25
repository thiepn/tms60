'use strict';
(() => {
  const current=document.currentScript;
  const BUILD='20260825-guided-due-fix1';
  const assetUrl=name=>{const u=new URL(name,current?.src||location.href);u.searchParams.set('v',BUILD);return u.href};
  const topLevel=window.top===window;

  function injectScript(doc,name,flag,errorMessage){
    if(!doc||doc.querySelector(`script[${flag}]`))return;
    const s=doc.createElement('script');
    s.src=assetUrl(name);
    s.setAttribute(flag,'1');
    s.async=false;
    s.onerror=()=>console.error(errorMessage);
    (doc.head||doc.documentElement).appendChild(s);
  }
  function injectAppLayers(doc){
    injectScript(doc,'rc3-hardening.js','data-tms-rc3-hardening','TMS60 RC3 hardening failed to load.');
    injectScript(doc,'guided-learning-chain.js','data-tms-guided-chain-fix','TMS60 guided-learning chain fix failed to load.');
    injectScript(doc,'qol-fast-recall.js','data-tms-fast-recall-qol','TMS60 fast-recall QoL failed to load.');
    injectScript(doc,'qol-cloze-helpers.js','data-tms-cloze-helpers-qol','TMS60 cloze-helper QoL failed to load.');
    injectScript(doc,'qol-word-navigation.js','data-tms-word-nav-qol','TMS60 word-navigation QoL failed to load.');
  }

  if(topLevel){
    const bindFrame=()=>{
      const frame=document.getElementById('app-frame');
      if(!frame)return;
      frame.addEventListener('load',()=>setTimeout(()=>injectAppLayers(frame.contentDocument),0));
      if(frame.contentDocument?.readyState==='complete')injectAppLayers(frame.contentDocument);
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
      if(frame?.contentDocument)injectAppLayers(frame.contentDocument);
    }else injectAppLayers(document);
  };
  legacy.onerror=()=>console.error('TMS60 legacy experience layer failed to load.');
  (document.head||document.documentElement).appendChild(legacy);
})();
