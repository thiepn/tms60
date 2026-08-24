/* TMS 60 safe localization completion pass.
   No MutationObserver: runs only after load and user interactions. */
'use strict';
(() => {
  if (window.top !== window || window.__TMS_SAFE_I18N_COMPLETION__) return;
  window.__TMS_SAFE_I18N_COMPLETION__ = true;

  const KEY='tms60-ui-language-v1';
  const SUPPORTED=new Set(['en','de','ko']);
  let frameDoc=null, scheduled=false;

  function getLang(){
    try{const x=localStorage.getItem(KEY);if(SUPPORTED.has(x))return x}catch(_){}
    const x=String(navigator.language||'').toLowerCase();
    return x.startsWith('de')?'de':x.startsWith('ko')?'ko':'en';
  }

  const EXACT={
    de:{
      'Unseen':'Ungelernt','unseen':'ungelernt','Read & absorb':'Lesen & aufnehmen','Read and notice':'Lesen und beachten','Listen':'Anhören',
      'End active session':'Aktive Einheit beenden','Remaining tasks will be discarded. Completed reviews and progress are already saved.':'Verbleibende Aufgaben werden verworfen. Abgeschlossene Wiederholungen und Fortschritte sind bereits gespeichert.','Cancel':'Abbrechen','End session':'Einheit beenden','Close dialog':'Dialog schließen',
      'Search book, chapter & verse or wording':'Buch, Kapitel, Vers oder Wortlaut suchen','Assessment record':'Einstufungsverlauf','No pack assessment completed.':'Noch keine Paket-Einstufung abgeschlossen.',
      'Recurring word errors':'Wiederkehrende Wortfehler','Complete exact typing, initials, or cloze checks to build a personal error profile.':'Absolviere exaktes Tippen, Anfangsbuchstaben- oder Lückentextprüfungen, um ein persönliches Fehlerprofil aufzubauen.',
      'Verses needing attention':'Verse mit Lernbedarf','Recent review history':'Letzte Wiederholungen','No reviews recorded yet.':'Noch keine Wiederholungen gespeichert.',
      'Learning stage':'Lernstufe','Wording interval':'Wortlaut-Intervall','Book, chapter & verse interval':'Referenz-Intervall','Delayed proofs':'Zeitversetzte Nachweise','Not established':'Nicht gefestigt','Study this verse':'Diesen Vers lernen','Type wording':'Wortlaut tippen','Recall book, chapter & verse':'Buch, Kapitel und Vers abrufen','Reset verse':'Vers zurücksetzen',
      'Private and offline':'Privat und offline','Saved locally':'Lokal gespeichert','Interface scale':'Oberflächengröße',
      'Print':'Drucken','Multi-verse practice':'Mehrere Verse üben','All packs':'Alle Pakete','All statuses':'Alle Status',
      'Mon':'Mo','Tue':'Di','Wed':'Mi','Thu':'Do','Fri':'Fr','Sat':'Sa','Sun':'So','due':'fällig',
      'Living the New Life':'Das neue Leben leben','Proclaiming Christ':'Christus verkündigen','Reliance on God’s Resources':'Aus Gottes Kraft leben',"Reliance on God's Resources":'Aus Gottes Kraft leben','Being Christ’s Disciple':'Als Jünger Christi leben',"Being Christ's Disciple":'Als Jünger Christi leben','Growth in Christlikeness':'Christus ähnlicher werden',
      'Bundled with TMS 60.':'In TMS 60 enthalten.','These actions cannot be undone unless you exported a backup or recover a prior automatic snapshot.':'Diese Aktionen können nur rückgängig gemacht werden, wenn du eine Sicherung exportiert hast oder einen früheren automatischen Schnappschuss wiederherstellst.',
      'Exact-recall progress is separate for each translation. Switching versions never marks the same verse mastered in another wording.':'Der Fortschritt beim exakten Abruf wird für jede Übersetzung getrennt gespeichert. Ein Wechsel übernimmt die Beherrschung nicht auf einen anderen Wortlaut.',
      'After the first successful load, this 60-verse translation dataset is cached in this browser for later use.':'Nach dem ersten erfolgreichen Laden werden diese 60 Verse für die spätere Nutzung in diesem Browser zwischengespeichert.',
      'Korean Revised Version 1952/1961. Public-domain source distributed by GetBible from Wikisource.':'Korean Revised Version 1952/1961. Gemeinfreie Quelle, über GetBible aus Wikisource bereitgestellt.',
      'Loads automatically through the TMS 60 server-side API.Bible integration. No user API key is required.':'Wird automatisch über die serverseitige API.Bible-Integration von TMS 60 geladen. Nutzer benötigen keinen API-Schlüssel.',
      'Read slowly, notice the structure, and establish the book, chapter & verse before hiding words.':'Lies langsam, beachte die Struktur und präge dir Buch, Kapitel und Vers ein, bevor Wörter ausgeblendet werden.',
      'I read the verse aloud slowly.':'Ich habe den Vers langsam laut gelesen.','I said the book, chapter & verse before and after the verse.':'Ich habe Buch, Kapitel und Vers vor und nach dem Vers genannt.','I looked away and recalled at least the opening phrase.':'Ich habe weggeschaut und mindestens den Anfang des Verses aus dem Gedächtnis abgerufen.',
      'Assisted learning advances the acquisition ladder but does not count as long-term mastery.':'Unterstütztes Lernen bringt dich im Lernprozess weiter, zählt aber nicht als langfristige Beherrschung.',
      'No account, network request, advertisement, or tracking. Export backups periodically.':'Kein Konto, keine Werbung und kein Tracking. Exportiere regelmäßig Sicherungen.'
    },
    ko:{
      'Unseen':'미학습','unseen':'미학습','Read & absorb':'읽고 익히기','Read and notice':'읽고 구조 파악','Listen':'듣기',
      'End active session':'현재 학습 종료','Remaining tasks will be discarded. Completed reviews and progress are already saved.':'남은 과제는 취소됩니다. 완료한 복습과 진행 상황은 이미 저장되었습니다.','Cancel':'취소','End session':'학습 종료','Close dialog':'창 닫기',
      'Search book, chapter & verse or wording':'성경 책, 장·절 또는 본문 검색','Assessment record':'점검 기록','No pack assessment completed.':'완료한 묶음 점검이 없습니다.',
      'Recurring word errors':'반복되는 단어 오류','Complete exact typing, initials, or cloze checks to build a personal error profile.':'정확히 입력하기, 첫 글자 또는 빈칸 채우기 연습을 완료하면 개인 오류 패턴을 확인할 수 있습니다.',
      'Verses needing attention':'집중이 필요한 구절','Recent review history':'최근 복습 기록','No reviews recorded yet.':'아직 기록된 복습이 없습니다.',
      'Learning stage':'학습 단계','Wording interval':'본문 복습 간격','Book, chapter & verse interval':'장절 복습 간격','Delayed proofs':'지연 확인','Not established':'미완료','Study this verse':'이 구절 학습','Type wording':'본문 입력','Recall book, chapter & verse':'장절 맞히기','Reset verse':'구절 초기화',
      'Private and offline':'개인용 · 오프라인','Saved locally':'기기에 저장됨','Interface scale':'화면 크기',
      'Print':'인쇄','Multi-verse practice':'여러 구절 연습','All packs':'전체 묶음','All statuses':'전체 상태',
      'Mon':'월','Tue':'화','Wed':'수','Thu':'목','Fri':'금','Sat':'토','Sun':'일','due':'복습',
      'Living the New Life':'새 생명 안에서 살기','Proclaiming Christ':'그리스도를 전파하기','Reliance on God’s Resources':'하나님의 자원을 의지하기',"Reliance on God's Resources":'하나님의 자원을 의지하기','Being Christ’s Disciple':'그리스도의 제자로 살기',"Being Christ's Disciple":'그리스도의 제자로 살기','Growth in Christlikeness':'그리스도를 닮아가기',
      'Bundled with TMS 60.':'TMS 60에 기본 포함되어 있습니다.','These actions cannot be undone unless you exported a backup or recover a prior automatic snapshot.':'백업을 내보냈거나 이전 자동 백업을 복원할 수 없는 경우 이 작업은 되돌릴 수 없습니다.',
      'Exact-recall progress is separate for each translation. Switching versions never marks the same verse mastered in another wording.':'정확 암송 진행 상황은 번역본마다 따로 저장됩니다. 번역본을 바꿔도 다른 문구가 자동으로 숙달 처리되지 않습니다.',
      'After the first successful load, this 60-verse translation dataset is cached in this browser for later use.':'처음 불러오기에 성공하면 이 60구절 번역 데이터가 이후 사용을 위해 브라우저에 저장됩니다.',
      'Korean Revised Version 1952/1961. Public-domain source distributed by GetBible from Wikisource.':'개역한글 1952/1961. Wikisource의 공개 저작물을 GetBible을 통해 제공합니다.',
      'Loads automatically through the TMS 60 server-side API.Bible integration. No user API key is required.':'TMS 60의 서버 측 API.Bible 연동을 통해 자동으로 불러옵니다. 사용자가 API 키를 입력할 필요가 없습니다.',
      'Read slowly, notice the structure, and establish the book, chapter & verse before hiding words.':'천천히 읽으며 구조를 파악하고 단어를 가리기 전에 성경 책과 장절을 확실히 익히세요.',
      'I read the verse aloud slowly.':'구절을 천천히 소리 내어 읽었습니다.','I said the book, chapter & verse before and after the verse.':'구절 전후에 성경 책과 장절을 말했습니다.','I looked away and recalled at least the opening phrase.':'본문을 보지 않고 최소한 첫 구절 부분을 떠올렸습니다.',
      'Assisted learning advances the acquisition ladder but does not count as long-term mastery.':'도움을 받는 학습은 학습 단계를 진행시키지만 장기 숙달로 인정되지는 않습니다.',
      'No account, network request, advertisement, or tracking. Export backups periodically.':'계정, 광고, 추적 없이 사용할 수 있습니다. 진행 상황은 정기적으로 백업하세요.'
    }
  };

  const FRAGMENTS={
    de:[
      ['means you have established the exact wording and the app is scheduling reviews to strengthen it.','bedeutet, dass der exakte Wortlaut gefestigt ist und die App Wiederholungen zur weiteren Festigung plant.'],
      ['means the wording has survived longer-term spacing: at least a 21-day interval and two perfect scheduled wording recalls separated by roughly a week.','bedeutet, dass der Wortlaut längere Abstände überstanden hat: mindestens ein 21-Tage-Intervall und zwei perfekte geplante Wortlautabrufe mit ungefähr einer Woche Abstand.'],
      ['Stable is therefore a retention milestone—not the only progress that counts.','Stabil ist damit ein Meilenstein der Behaltensleistung – nicht der einzige Fortschritt, der zählt.']
    ],
    ko:[
      ['means you have established the exact wording and the app is scheduling reviews to strengthen it.','은 정확한 본문을 암송했으며 앱이 기억을 강화하기 위한 복습 일정을 제공하는 상태입니다.'],
      ['means the wording has survived longer-term spacing: at least a 21-day interval and two perfect scheduled wording recalls separated by roughly a week.','은 본문이 장기 간격 복습을 통과한 상태입니다. 최소 21일의 복습 간격과 약 일주일 이상 떨어진 두 번의 완벽한 예정 복습을 충족해야 합니다.'],
      ['Stable is therefore a retention milestone—not the only progress that counts.','따라서 안정됨은 장기 기억의 한 기준이며 유일한 진행 기준은 아닙니다.']
    ]
  };

  function translateText(value,lang){
    let s=String(value??'');
    if(lang==='en'||!s.trim())return s;
    const exact=EXACT[lang]||{};
    const lead=s.match(/^\s*/)?.[0]||'',trail=s.match(/\s*$/)?.[0]||'',core=s.slice(lead.length,s.length-trail.length);
    if(Object.hasOwn(exact,core))return lead+exact[core]+trail;
    let out=s;
    for(const [en,target] of Object.entries(exact)){
      if(en.length<5)continue;
      if(out.includes(en))out=out.split(en).join(target);
    }
    for(const [from,to] of FRAGMENTS[lang]||[])if(out.includes(from))out=out.split(from).join(to);
    out=out.replace(/Interface scale:\s*(\d+)%/g,(_,n)=>lang==='de'?`Oberflächengröße: ${n} %`:`화면 크기: ${n}%`);
    out=out.replace(/Review what is due, then continue the verse you are learning\. Approximately (\d+) minutes?\./g,(_,n)=>lang==='de'?`Wiederhole zuerst das Fällige und lerne danach deinen aktuellen Vers weiter. Ungefähr ${n} ${n==='1'?'Minute':'Minuten'}.`:`먼저 복습할 내용을 완료한 뒤 현재 학습 중인 구절을 이어서 학습하세요. 약 ${n}분.`);
    return out;
  }

  function shouldSkip(node){
    const p=node.parentElement;
    return !p||!!p.closest('script,style,#translation-copyright,.verse-text,.quote-mini,.diff,.char-text,.initials-prompt,.cloze-line');
  }

  function translateRoot(root,lang){
    if(!root||lang==='en')return;
    const doc=root.ownerDocument||document;
    const walker=doc.createTreeWalker(root,doc.defaultView.NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode())){
      if(shouldSkip(n))continue;
      const next=translateText(n.nodeValue,lang);
      if(next!==n.nodeValue)n.nodeValue=next;
    }
    root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el=>{
      for(const attr of ['placeholder','aria-label','title'])if(el.hasAttribute(attr)){
        const before=el.getAttribute(attr),after=translateText(before,lang);
        if(after!==before)el.setAttribute(attr,after);
      }
    });
  }

  function ensureLanguageSelector(doc,lang){
    const settings=doc.getElementById('view-settings');
    if(!settings)return;
    let card=doc.getElementById('ui-language-settings-card');
    if(card)return;
    const firstStack=settings.querySelector('.settings-grid .stack');
    if(!firstStack)return;
    const labels={
      en:{title:'App language',label:'Interface language',help:'The app language changes menus and instructions. Your Bible version is a separate setting.'},
      de:{title:'App-Sprache',label:'Oberflächensprache',help:'Die App-Sprache ändert Menüs und Anweisungen. Die Bibelübersetzung ist eine separate Einstellung.'},
      ko:{title:'앱 언어',label:'인터페이스 언어',help:'앱 언어는 메뉴와 안내 문구를 변경합니다. 성경 번역본은 별도로 설정됩니다.'}
    }[lang]||null;
    card=doc.createElement('article');
    card.id='ui-language-settings-card';
    card.className='card flat';
    card.innerHTML=`<h2>${labels?.title||'App language'}</h2><div class="field"><label for="ui-language-select">${labels?.label||'Interface language'}</label><select id="ui-language-select"><option value="en">English</option><option value="de">Deutsch</option><option value="ko">한국어</option></select><div class="help">${labels?.help||''}</div></div>`;
    firstStack.prepend(card);
    const select=card.querySelector('#ui-language-select');
    select.value=lang;
    select.addEventListener('change',()=>{
      const next=select.value;
      if(!SUPPORTED.has(next))return;
      try{localStorage.setItem(KEY,next)}catch(_){}
      location.reload();
    });
  }

  function run(){
    scheduled=false;
    const lang=getLang();
    const frame=document.getElementById('app-frame');
    const doc=frame?.contentDocument;
    if(doc?.body){
      frameDoc=doc;
      ensureLanguageSelector(doc,lang);
      const roots=[doc.querySelector('.view.active'),doc.querySelector('.sidebar'),doc.querySelector('.topbar'),doc.getElementById('modal-root')].filter(Boolean);
      for(const root of roots)translateRoot(root,lang);
    }
    translateRoot(document.body,lang);
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>setTimeout(run,0));
  }

  function bindFrame(){
    const frame=document.getElementById('app-frame');
    const doc=frame?.contentDocument;
    if(!doc?.body){setTimeout(bindFrame,120);return;}
    if(frameDoc!==doc){
      frameDoc=doc;
      doc.addEventListener('click',schedule,true);
      doc.addEventListener('change',schedule,true);
      doc.addEventListener('input',e=>{if(e.target?.id==='setting-font')schedule();},true);
      frame.addEventListener('load',()=>setTimeout(()=>{frameDoc=null;bindFrame();},0));
    }
    schedule();
    setTimeout(schedule,250);
    setTimeout(schedule,900);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindFrame,{once:true});else bindFrame();
  document.addEventListener('click',schedule,true);
})();