/* Translation-qualified, read-only Hub entry. No tokens or progress in links. */
(function(root){
  'use strict';
  const translations=['esv','niv','nlt','hfa','schlachter1951','klb1985','krv1961'];
  function parse(fragment){
    if(typeof fragment!=='string'||fragment.length>160)return null;
    const match=/^#hub=([a-z0-9]+)(?:%3A|:)([1-9]|[1-5][0-9]|60)(?:%3A|:)(wording|reference|learning)$/i.exec(fragment);
    if(!match||!translations.includes(match[1]))return null;
    return Object.freeze({translation:match[1],verseId:Number(match[2]),dimension:match[3].toLowerCase()});
  }
  root.TMSHubEntry={parse};
  if(typeof module!=='undefined')module.exports={parse};
})(typeof window==='undefined'?globalThis:window);
