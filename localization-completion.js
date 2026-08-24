/* TMS 60 localization completion pass.
   Handles base UI labels and mixed partially-localized strings left after the core/runtime pass. */
'use strict';
(() => {
  if (window.top !== window || window.__TMS_LOCALIZATION_COMPLETION__) return;
  window.__TMS_LOCALIZATION_COMPLETION__ = true;

  const KEY='tms60-ui-language-v1';
  const getLang=()=>{try{const x=localStorage.getItem(KEY);if(['en','de','ko'].includes(x))return x}catch(_){}const x=String(navigator.language||'').toLowerCase();return x.startsWith('de')?'de':x.startsWith('ko')?'ko':'en'};

  const PACKS={
    'Living the New Life':['Das neue Leben leben','새 생명 안에서 살기'],
    'Proclaiming Christ':['Christus verkündigen','그리스도를 전파하기'],
    'Reliance on God’s Resources':['Aus Gottes Kraft leben','하나님의 자원을 의지하기'],
    "Reliance on God's Resources":['Aus Gottes Kraft leben','하나님의 자원을 의지하기'],
    'Being Christ’s Disciple':['Als Jünger Christi leben','그리스도의 제자로 살기'],
    "Being Christ's Disciple":['Als Jünger Christi leben','그리스도의 제자로 살기'],
    'Growth in Christlikeness':['Christus ähnlicher werden','그리스도를 닮아가기']
  };

  const D={
    de:{
      'Today':'Heute','Study':'Lernen','Library':'Bibliothek','Progress':'Fortschritt','Settings':'Einstellungen',
      'Study plan':'Lernplan','Backup and restore':'Sicherung und Wiederherstellung','Data principles':'Datenprinzipien','Bible version':'Bibelübersetzung','Memorization text':'Text zum Auswendiglernen','Appearance':'Darstellung','Light / dark mode':'Hell / Dunkel','Light':'Hell','Dark':'Dunkel','Accent color':'Akzentfarbe','Reset':'Zurücksetzen',
      'App language':'App-Sprache','Interface language':'App-Sprache','English':'Englisch','German':'Deutsch','Korean':'Koreanisch',
      'Due now':'Jetzt fällig','DUE NOW':'JETZT FÄLLIG','How verse progress works':'So funktioniert der Versfortschritt','Pack progress':'Paketfortschritt','Next seven days':'Nächste sieben Tage',
      'Learning':'Lernen','Maintaining':'Wiederholen','Stable':'Stabil','Unseen':'Ungelernt','Established':'Gefestigt','Memorized':'Gelernt',
      'Export history CSV':'Verlauf als CSV exportieren','Export progress':'Fortschritt exportieren','Import backup':'Sicherung importieren','Export review CSV':'Wiederholungen als CSV exportieren',
      'Bundled with TMS 60.':'In TMS 60 enthalten.','Study freely.':'Frei lernen.','Private and offline':'Privat und offline',
      'Light uses white surfaces. Dark uses a deep background tinted by the selected accent.':'Hell verwendet weiße Flächen. Dunkel verwendet einen tiefen, mit der Akzentfarbe getönten Hintergrund.',
      'Black / White':'Schwarz / Weiß','Blue':'Blau','Green':'Grün','Red':'Rot','Purple':'Violett','Brown / Beige':'Braun / Beige','Orange':'Orange','Magenta':'Magenta',
      'Daily task target':'Tägliches Aufgabenziel','Target completion date':'Zieldatum','Target retention display':'Ziel-Behaltequote','Default missing-word level':'Standard-Lückentextstufe','Shuffle mature reviews':'Reife Wiederholungen mischen','Streak grace days':'Kulanz-Tage für die Serie',
      'Reset progress, keep settings':'Fortschritt zurücksetzen, Einstellungen behalten','Reset everything':'Alles zurücksetzen',
      'Assisted learning never proves long-term mastery.':'Unterstütztes Lernen weist keine langfristige Beherrschung nach.','Wording and book, chapter & verse schedules are independent.':'Wortlaut- und Referenzpläne sind unabhängig voneinander.','Failed scheduled cards enter relearning.':'Fehlgeschlagene geplante Karten gehen in die Wiederlernphase.','Successful early extra practice cannot accelerate intervals.':'Erfolgreiche zusätzliche Frühübungen können Intervalle nicht beschleunigen.','Review history is retained for diagnostics.':'Der Wiederholungsverlauf wird für Diagnosen gespeichert.',
      'Living the New Life':'Das neue Leben leben','Proclaiming Christ':'Christus verkündigen','Reliance on God’s Resources':'Aus Gottes Kraft leben',"Reliance on God's Resources":'Aus Gottes Kraft leben','Being Christ’s Disciple':'Als Jünger Christi leben',"Being Christ's Disciple":'Als Jünger Christi leben','Growth in Christlikeness':'Christus ähnlicher werden'
    },
    ko:{
      'Today':'오늘','Study':'학습','Library':'구절','Progress':'진행','Settings':'설정',
      'Study plan':'학습 계획','Backup and restore':'백업 및 복원','Data principles':'데이터 원칙','Bible version':'성경 번역본','Memorization text':'암송 본문','Appearance':'화면 설정','Light / dark mode':'라이트 / 다크 모드','Light':'라이트','Dark':'다크','Accent color':'강조 색상','Reset':'초기화',
      'App language':'앱 언어','Interface language':'앱 언어','English':'영어','German':'독일어','Korean':'한국어',
      'Due now':'지금 복습','DUE NOW':'지금 복습','How verse progress works':'구절 진행 방식','Pack progress':'묶음별 진행','Next seven days':'앞으로 7일',
      'Learning':'학습 중','Maintaining':'복습 중','Stable':'안정됨','Unseen':'미학습','Established':'암송됨','Memorized':'암송 완료',
      'Export history CSV':'기록 CSV 내보내기','Export progress':'진행 상황 내보내기','Import backup':'백업 가져오기','Export review CSV':'복습 CSV 내보내기',
      'Bundled with TMS 60.':'TMS 60에 기본 포함되어 있습니다.','Study freely.':'자유롭게 학습하세요.','Private and offline':'개인용 · 오프라인',
      'Light uses white surfaces. Dark uses a deep background tinted by the selected accent.':'라이트 모드는 밝은 화면을, 다크 모드는 선택한 강조 색상이 반영된 어두운 화면을 사용합니다.',
      'Black / White':'검정 / 흰색','Blue':'파랑','Green':'초록','Red':'빨강','Purple':'보라','Brown / Beige':'갈색 / 베이지','Orange':'주황','Magenta':'마젠타',
      'Daily task target':'하루 학습 목표','Target completion date':'목표 완료 날짜','Target retention display':'목표 기억 유지율','Default missing-word level':'기본 빈칸 비율','Shuffle mature reviews':'숙달 구절 복습 순서 섞기','Streak grace days':'연속 학습 유예일',
      'Reset progress, keep settings':'진행 상황만 초기화','Reset everything':'모두 초기화',
      'Assisted learning never proves long-term mastery.':'도움이 있는 학습은 장기 숙달의 증거로 인정되지 않습니다.','Wording and book, chapter & verse schedules are independent.':'본문 복습과 장절 복습 일정은 서로 독립적입니다.','Failed scheduled cards enter relearning.':'예정된 복습에 실패하면 다시 학습 단계로 들어갑니다.','Successful early extra practice cannot accelerate intervals.':'예정보다 이른 추가 연습에 성공해도 복습 간격은 빨라지지 않습니다.','Review history is retained for diagnostics.':'복습 기록은 학습 상태 분석을 위해 보관됩니다.',
      'Living the New Life':'새 생명 안에서 살기','Proclaiming Christ':'그리스도를 전파하기','Reliance on God’s Resources':'하나님의 자원을 의지하기',"Reliance on God's Resources":'하나님의 자원을 의지하기','Being Christ’s Disciple':'그리스도의 제자로 살기',"Being Christ's Disciple":'그리스도의 제자로 살기','Growth in Christlikeness':'그리스도를 닮아가기'
    }
  };

  function translate(raw,l){
    const s=String(raw??''); if(l==='en'||!s.trim()) return s;
    const lead=s.match(/^\s*/)?.[0]||'',trail=s.match(/\s*$/)?.[0]||'',core=s.slice(lead.length,s.length-trail.length),dict=D[l]||{};
    if(Object.hasOwn(dict,core)) return lead+dict[core]+trail;
    let m;
    if((m=core.match(/^(?:Pack|Paket|묶음)\s+([A-E])\s*[·:]\s*(.+)$/))){
      const pack=PACKS[m[2]];
      if(pack)return lead+(l==='de'?'Paket ':'묶음 ')+m[1]+' · '+pack[l==='de'?0:1]+trail;
    }
    if((m=core.match(/^(?:Pack|Paket|묶음)\s+([A-E])$/)))return lead+(l==='de'?'Paket ':'묶음 ')+m[1]+trail;
    return s;
  }

  function skip(node){const p=node.parentElement;return !p||!!p.closest('script,style,#translation-copyright,.verse-text,.quote-mini,.diff,.char-text,.initials-prompt,.cloze-line')}
  function applyNode(node,l){
    if(node.nodeType===Node.TEXT_NODE){if(skip(node))return;const x=translate(node.nodeValue,l);if(x!==node.nodeValue)node.nodeValue=x;return}
    if(node.nodeType!==Node.ELEMENT_NODE&&node.nodeType!==Node.DOCUMENT_NODE&&node.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
    const doc=node.ownerDocument||node;const w=doc.createTreeWalker(node,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))applyNode(n,l);
    node.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el=>{for(const a of ['placeholder','aria-label','title'])if(el.hasAttribute(a)){const v=el.getAttribute(a),x=translate(v,l);if(x!==v)el.setAttribute(a,x)}});
  }
  function attach(){
    const frame=document.getElementById('app-frame'),doc=frame?.contentDocument;if(!doc?.body){setTimeout(attach,120);return}
    const run=()=>{const l=getLang();doc.documentElement.lang=l;if(l!=='en')applyNode(doc.body,l)};run();
    const obs=new MutationObserver(records=>{const l=getLang();if(l==='en')return;for(const r of records)for(const n of r.addedNodes)applyNode(n,l)});obs.observe(doc.body,{childList:true,subtree:true});
    doc.addEventListener('change',e=>{if(e.target?.id==='ui-language-select')requestAnimationFrame(run)},true);
    frame.addEventListener('load',()=>setTimeout(run,0));
  }
  attach();
})();