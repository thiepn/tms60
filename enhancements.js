'use strict';
// Unified final certification trigger — no runtime behavior change.
(() => {
  const current=document.currentScript;
  const BUILD='20260825-stability3';
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
  function appCoreReady(doc){
    const w=doc?.defaultView;
    return Boolean(w &&
      typeof w.completeCurrent==='function' &&
      typeof w.isWordingStable==='function' &&
      typeof w.renderHome==='function' &&
      typeof w.renderStudy==='function' &&
      typeof w.renderAll==='function' &&
      typeof w.learningTask==='function' &&
      typeof w.startVerseLearning==='function' &&
      typeof w.startSession==='function' &&
      typeof w.normalizeReference==='function');
  }
  function injectAppLayersNow(doc){
    injectScript(doc,'rc3-hardening.js','data-tms-rc3-hardening','TMS60 RC3 hardening failed to load.');
    injectScript(doc,'guided-learning-chain.js','data-tms-guided-chain-fix','TMS60 guided-learning chain fix failed to load.');
    injectScript(doc,'qol-fast-recall.js','data-tms-fast-recall-qol','TMS60 fast-recall QoL failed to load.');
    injectScript(doc,'qol-cloze-helpers.js','data-tms-cloze-helpers-qol','TMS60 cloze-helper QoL failed to load.');
    injectScript(doc,'qol-word-navigation.js','data-tms-word-nav-qol','TMS60 word-navigation QoL failed to load.');
  }

  function injectCurrentFrame(attempt=0){
    const frame=document.getElementById('app-frame');
    if(!frame)return;
    const doc=frame.contentDocument;
    if(!doc||!frame.classList.contains('ready'))return;
    if(appCoreReady(doc)){injectAppLayersNow(doc);return;}
    if(attempt<160){
      setTimeout(()=>{
        const liveFrame=document.getElementById('app-frame');
        if(liveFrame===frame && liveFrame.contentDocument===doc && liveFrame.classList.contains('ready')) injectCurrentFrame(attempt+1);
      },25);
      return;
    }
    console.error('TMS60 enhancement layers were not injected because the ready app core was unavailable.');
  }

  function injectDirectDocument(doc,attempt=0){
    if(!doc)return;
    if(appCoreReady(doc)){injectAppLayersNow(doc);return;}
    if(attempt<200)setTimeout(()=>injectDirectDocument(doc,attempt+1),25);
    else console.error('TMS60 enhancement layers were not injected because the app core did not become ready.');
  }

  if(topLevel){
    const bindFrame=()=>{
      const frame=document.getElementById('app-frame');
      if(!frame)return;
      frame.addEventListener('load',()=>setTimeout(()=>injectCurrentFrame(),0));
      new MutationObserver(()=>{
        if(frame.classList.contains('ready'))injectCurrentFrame();
      }).observe(frame,{attributes:true,attributeFilter:['class']});
      injectCurrentFrame();
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindFrame,{once:true});else bindFrame();
  }

  const legacy=document.createElement('script');
  legacy.src=assetUrl('enhancements-legacy.js');
  legacy.dataset.tmsVnextLegacy='1';
  legacy.async=false;
  legacy.onload=()=>{
    if(topLevel)injectCurrentFrame();
    else injectDirectDocument(document);
  };
  legacy.onerror=()=>console.error('TMS60 legacy experience layer failed to load.');
  (document.head||document.documentElement).appendChild(legacy);
})();
