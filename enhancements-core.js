/* TMS 60 vNext experience layer: localization, onboarding wizard, smart learning, simplified Today, and PWA hooks. */
'use strict';
(() => {
  const LANG_KEY = 'tms60-ui-language-v1';
  const SUPPORTED = ['en','de','ko'];
  const localeFor = lang => lang === 'de' ? 'de-DE' : lang === 'ko' ? 'ko-KR' : 'en-US';
  const safeGet = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const safeSet = (key,value) => { try { localStorage.setItem(key,value); } catch (_) {} };
  const detectLanguage = () => {
    const stored = safeGet(LANG_KEY);
    if (SUPPORTED.includes(stored)) return stored;
    const raw = String(navigator.language || '').toLowerCase();
    return raw.startsWith('de') ? 'de' : raw.startsWith('ko') ? 'ko' : 'en';
  };
  const setStoredLanguage = lang => { if (SUPPORTED.includes(lang)) safeSet(LANG_KEY,lang); };

  const SHELL_COPY = {
    en:{step:['Language','Bible version','Appearance','How TMS 60 works'],intro:['Choose the language used by the app. You can change it later in Settings.','Choose the Bible wording you want to memorize. Bible version and app language are independent.','Choose the appearance you prefer.','TMS 60 guides one verse from first exposure to exact recall, then brings it back for review.'],back:'Back',next:'Next',start:'Start memorizing',language:'App language',languageHelp:'This changes menus and instructions, not the Bible text.',versionHelp:'Most people memorize one Bible version. If you ever switch, the previous version’s progress stays saved and the new wording uses a separate progress record.',appearance:'Appearance',howTitle:'One version. Sixty verses. A clear learning path.',howItems:['Choose any verse or follow today’s recommendation.','Learn through read, phrase build-up, cloze, initials, and exact typing.','Review verses when they are due. You are never locked out of choosing another verse.'],changeLater:'Bible version, app language, and appearance can all be changed later in Settings.',legal:'Translation licensing and source information remains available in the app.'},
    de:{step:['Sprache','Bibelübersetzung','Darstellung','So funktioniert TMS 60'],intro:['Wähle die Sprache der App. Du kannst sie später in den Einstellungen ändern.','Wähle die Bibelübersetzung, die du auswendig lernen möchtest. Bibelübersetzung und App-Sprache sind unabhängig voneinander.','Wähle die gewünschte Darstellung.','TMS 60 führt einen Vers vom ersten Lesen bis zum exakten Abruf und plant anschließend Wiederholungen.'],back:'Zurück',next:'Weiter',start:'Auswendiglernen starten',language:'App-Sprache',languageHelp:'Dies ändert Menüs und Anweisungen, nicht den Bibeltext.',versionHelp:'Normalerweise lernt man eine Bibelübersetzung. Wenn du später wechselst, bleibt der bisherige Fortschritt gespeichert; die neue Formulierung erhält einen eigenen Fortschritt.',appearance:'Darstellung',howTitle:'Eine Übersetzung. Sechzig Verse. Ein klarer Lernweg.',howItems:['Wähle einen beliebigen Vers oder folge der Empfehlung für heute.','Lerne über Lesen, Satzbausteine, Lückentext, Anfangsbuchstaben und exaktes Tippen.','Wiederhole Verse, wenn sie fällig sind. Du kannst trotzdem jederzeit einen anderen Vers wählen.'],changeLater:'Bibelübersetzung, App-Sprache und Darstellung können später in den Einstellungen geändert werden.',legal:'Lizenz- und Quellenangaben der Übersetzungen bleiben in der App verfügbar.'},
    ko:{step:['언어','성경 번역본','화면 설정','TMS 60 사용 방법'],intro:['앱에서 사용할 언어를 선택하세요. 나중에 설정에서 바꿀 수 있습니다.','암송할 성경 번역본을 선택하세요. 성경 번역본과 앱 언어는 서로 독립적입니다.','원하는 화면 설정을 선택하세요.','TMS 60은 처음 읽기부터 정확한 암송까지 한 구절을 단계적으로 학습하게 하고 이후 복습 일정을 제공합니다.'],back:'뒤로',next:'다음',start:'암송 시작',language:'앱 언어',languageHelp:'메뉴와 안내 문구만 바뀌며 성경 본문은 바뀌지 않습니다.',versionHelp:'보통 한 가지 성경 번역본을 암송합니다. 나중에 번역본을 바꾸더라도 이전 진행 상황은 보존되고 새 번역의 문구는 별도 진행 상황으로 관리됩니다.',appearance:'화면 설정',howTitle:'한 번역본. 60구절. 명확한 학습 과정.',howItems:['원하는 구절을 직접 고르거나 오늘의 추천을 따르세요.','읽기, 구절 나누기, 빈칸, 첫 글자, 정확히 입력하기 순서로 학습하세요.','복습할 때가 되면 다시 연습합니다. 언제든 다른 구절을 선택할 수 있습니다.'],changeLater:'성경 번역본, 앱 언어, 화면 설정은 모두 나중에 설정에서 변경할 수 있습니다.',legal:'번역본의 라이선스 및 출처 정보는 앱에서 계속 확인할 수 있습니다.'}
  };

  function setupPwaShell(){
    if (!document.querySelector('link[rel="manifest"]')) {
      const link=document.createElement('link'); link.rel='manifest'; link.href='manifest.webmanifest'; document.head.appendChild(link);
    }
    const metaPairs=[['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-status-bar-style','black-translucent'],['apple-mobile-web-app-title','TMS 60']];
    for(const [name,content] of metaPairs){if(!document.querySelector(`meta[name="${name}"]`)){const m=document.createElement('meta');m.name=name;m.content=content;document.head.appendChild(m)}}
    if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  function setupShell(){
    setupPwaShell();
    const frame=document.getElementById('app-frame');
    if(frame){
      const inject=()=>{
        try{
          const doc=frame.contentDocument;if(!doc||doc.querySelector('script[data-tms-vnext]'))return;
          const s=doc.createElement('script');s.src=new URL('enhancements.js',location.href).href;s.dataset.tmsVnext='1';doc.head.appendChild(s);
        }catch(_){}
      };
      frame.addEventListener('load',inject);
      if(frame.contentDocument?.readyState==='complete') inject();
    }

    const onboarding=document.getElementById('onboarding');
    if(!onboarding)return;
    const panel=onboarding.querySelector('.onboarding');
    const intro=panel?.querySelector('#onboarding-title + p');
    const versionSection=panel?.querySelector('#version-options')?.closest('.section');
    const modeSection=panel?.querySelector('#mode-options')?.closest('.section');
    const accentSection=panel?.querySelector('#accent-options')?.closest('.section');
    const legal=panel?.querySelector('.legal-note');
    const actions=panel?.querySelector('.actions');
    const finish=document.getElementById('finish-onboarding');
    if(!panel||!intro||!versionSection||!modeSection||!accentSection||!actions||!finish)return;

    if(!panel.querySelector('[data-language-section]')){
      const langSection=document.createElement('div');
      langSection.className='section';langSection.dataset.languageSection='1';
      langSection.innerHTML=`<div class="section-title" data-shell-language-title>App language</div><div class="section-help" data-shell-language-help>This changes menus and instructions, not the Bible text.</div><div class="segment" style="grid-template-columns:repeat(3,1fr)" id="language-options"><button class="choice" type="button" data-ui-language="en">English</button><button class="choice" type="button" data-ui-language="de">Deutsch</button><button class="choice" type="button" data-ui-language="ko">한국어</button></div>`;
      versionSection.before(langSection);
    }
    if(!panel.querySelector('[data-how-section]')){
      const how=document.createElement('div');how.className='section';how.dataset.howSection='1';
      versionSection.parentNode.insertBefore(how,legal||actions);
    }
    if(!panel.querySelector('[data-step-indicator]')){
      const step=document.createElement('div');step.dataset.stepIndicator='1';step.style.cssText='margin-top:18px;color:#8f97a2;font-size:.76rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase';intro.before(step);
    }
    if(!document.getElementById('wizard-back')){
      const back=document.createElement('button');back.id='wizard-back';back.type='button';back.className='start';back.style.cssText='background:transparent;color:#d9dde3;border-color:#454b54;margin-right:8px';actions.prepend(back);
      const next=document.createElement('button');next.id='wizard-next';next.type='button';next.className='start';actions.insertBefore(next,finish);
    }

    let stepIndex=0;
    let lang=detectLanguage();setStoredLanguage(lang);
    const langSection=panel.querySelector('[data-language-section]');
    const howSection=panel.querySelector('[data-how-section]');
    const back=document.getElementById('wizard-back'),next=document.getElementById('wizard-next'),indicator=panel.querySelector('[data-step-indicator]');

    function renderShellStep(){
      const c=SHELL_COPY[lang];
      document.documentElement.lang=lang;
      [langSection,versionSection,modeSection,accentSection,howSection].forEach(x=>x.style.display='none');
      legal.style.display='none';
      if(stepIndex===0)langSection.style.display='grid';
      if(stepIndex===1){versionSection.style.display='grid';legal.style.display='block';}
      if(stepIndex===2){modeSection.style.display='grid';accentSection.style.display='grid';}
      if(stepIndex===3)howSection.style.display='grid';
      indicator.textContent=`${stepIndex+1} / 4 · ${c.step[stepIndex]}`;
      document.getElementById('onboarding-title').textContent=c.step[stepIndex];
      intro.textContent=c.intro[stepIndex];
      panel.querySelector('[data-shell-language-title]').textContent=c.language;
      panel.querySelector('[data-shell-language-help]').textContent=c.languageHelp;
      const vt=versionSection.querySelector('.section-title');if(vt)vt.textContent=c.step[1];
      const vh=versionSection.querySelector('.section-help');if(vh)vh.textContent=c.versionHelp;
      const mt=modeSection.querySelector('.section-title');if(mt)mt.textContent=lang==='de'?'Hell / Dunkel':lang==='ko'?'라이트 / 다크':'Light / dark';
      const at=accentSection.querySelector('.section-title');if(at)at.textContent=lang==='de'?'Akzentfarbe':lang==='ko'?'강조 색상':'Accent';
      howSection.innerHTML=`<div class="section-title" style="font-size:1.05rem">${c.howTitle}</div><div style="display:grid;gap:10px;margin-top:4px">${c.howItems.map((x,i)=>`<div style="display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start"><span style="width:28px;height:28px;border-radius:9px;background:#252930;display:grid;place-items:center;font-weight:800">${i+1}</span><span style="color:#c1c7cf;line-height:1.5">${x}</span></div>`).join('')}</div><div class="section-help" style="margin-top:8px">${c.changeLater}</div>`;
      back.textContent=c.back;next.textContent=c.next;finish.textContent=c.start;
      back.style.display=stepIndex===0?'none':'inline-flex';next.style.display=stepIndex===3?'none':'inline-flex';finish.style.display=stepIndex===3?'inline-flex':'none';
      panel.querySelectorAll('[data-ui-language]').forEach(b=>b.classList.toggle('active',b.dataset.uiLanguage===lang));
    }
    panel.querySelectorAll('[data-ui-language]').forEach(b=>b.addEventListener('click',()=>{lang=b.dataset.uiLanguage;setStoredLanguage(lang);renderShellStep()}));
    back.addEventListener('click',()=>{stepIndex=Math.max(0,stepIndex-1);renderShellStep()});
    next.addEventListener('click',()=>{stepIndex=Math.min(3,stepIndex+1);renderShellStep()});
    const classObserver=new MutationObserver(()=>{if(!onboarding.classList.contains('hidden')){stepIndex=0;lang=detectLanguage();renderShellStep()}});
    classObserver.observe(onboarding,{attributes:true,attributeFilter:['class']});
    renderShellStep();
  }

  const DICT={
    de:{
      'Today':'Heute','Study':'Lernen','Library':'Bibliothek','Progress':'Fortschritt','Settings':'Einstellungen','Exact ESV recall':'Exaktes ESV-Abrufen','Exact NIV recall':'Exaktes NIV-Abrufen','Exact SCH1951 recall':'Exaktes SCH1951-Abrufen','Exact 개역한글 recall':'Exaktes 개역한글-Abrufen',
      'Learn this verse':'Diesen Vers lernen','Start today’s session':'Heutige Einheit starten','Start today\'s session':'Heutige Einheit starten','Study any verse':'Beliebigen Vers lernen','Placement check':'Einstufung','Start guided session':'Geführte Einheit starten','Guided review':'Geführte Wiederholung','Choose any verse':'Beliebigen Vers wählen','What do you want to study?':'Was möchtest du lernen?','Verse':'Vers','Study mode':'Lernmodus','Status':'Status','Recommended learning path':'Empfohlener Lernweg','Flashcard review':'Karteikarten-Wiederholung','Build a multi-verse session':'Einheit mit mehreren Versen erstellen','Browse library':'Bibliothek durchsuchen','Choose your next step':'Nächster Schritt','Current streak':'Aktuelle Serie','Active study days':'Aktive Lerntage','Due now':'Jetzt fällig','Learning':'Lernen','Memorized':'Gelernt','Stable':'Stabil','Established':'Gefestigt','Unseen':'Ungelernt','Maintaining':'Wiederholen','Bible version':'Bibelübersetzung','Memorization text':'Text zum Auswendiglernen','App language':'App-Sprache','Interface language':'App-Sprache','Appearance':'Darstellung','Study plan':'Lernplan','Backup and restore':'Sicherung und Wiederherstellung','Data principles':'Datenprinzipien','Reset':'Zurücksetzen','Light / dark mode':'Hell / Dunkel','Accent color':'Akzentfarbe','Light':'Hell','Dark':'Dunkel','Black / White':'Schwarz / Weiß','Blue':'Blau','Green':'Grün','Red':'Rot','Purple':'Violett','Brown / Beige':'Braun / Beige','Orange':'Orange','Magenta':'Magenta','Start memorizing':'Auswendiglernen starten','Session':'Einheit','Queue':'Warteschlange','Completed':'Erledigt','Remaining':'Verbleibend','Est. time':'Geschätzte Zeit','Keyboard':'Tastatur','Practice session':'Übungseinheit','Guided session':'Geführte Einheit','Learning stage':'Lernstufe','Wording interval':'Text-Intervall','Book, chapter & verse interval':'Buch-Kapitel-Vers-Intervall','Delayed proofs':'Zeitversetzte Nachweise','Study this verse':'Diesen Vers lernen','Type wording':'Text tippen','Recall book, chapter & verse':'Buch, Kapitel und Vers abrufen','Reset verse':'Vers zurücksetzen','Verse library':'Versbibliothek','Search all 60 verses and study any one immediately.':'Durchsuche alle 60 Verse und lerne jeden beliebigen sofort.','Print':'Drucken','Multi-verse practice':'Mehrere Verse üben','All packs':'Alle Pakete','All statuses':'Alle Status','Due':'Fällig','Starred':'Markiert','All scheduled work is complete':'Alle geplanten Aufgaben sind erledigt','Today’s session':'Heutige Einheit','Today\'s session':'Heutige Einheit','Your progress':'Dein Fortschritt','Continue learning':'Weiterlernen','No reviews are due right now.':'Aktuell sind keine Wiederholungen fällig.','Review what is due, then continue the verse you are learning.':'Wiederhole zuerst die fälligen Verse und lerne danach deinen aktuellen Vers weiter.','Keep today simple: review what is due and continue learning one verse.':'Halte es heute einfach: Wiederhole Fälliges und lerne einen Vers weiter.','No locked progression':'Kein gesperrter Fortschritt','Five packs':'Fünf Pakete','Pack progress':'Paketfortschritt','Verses needing attention':'Verse mit Lernbedarf','Recent review history':'Letzte Wiederholungen','Next seven days':'Nächste sieben Tage','How verse progress works':'So funktioniert der Fortschritt','Learn':'Lernen','Review':'Wiederholen','Exact typing':'Exakt tippen','Flashcard recall':'Karteikarten-Abruf','Missing words':'Lücken','First letters':'Anfangsbuchstaben','Book, chapter & verse recall':'Buch, Kapitel und Vers','Phrase build-up':'Satzbausteine','Listen & repeat':'Anhören & nachsprechen','Read and notice':'Lesen und beachten','Build the verse':'Vers zusammensetzen','Hide 40%':'40 % ausblenden','Hide 80%':'80 % ausblenden','Recall from initials':'Mit Anfangsbuchstaben abrufen','Prove exact wording':'Exakten Wortlaut nachweisen','Start learning':'Lernen starten','Continue':'Weiter','Close':'Schließen','Cancel':'Abbrechen','Back':'Zurück','Next':'Weiter','Check answer':'Antwort prüfen','Reveal verse':'Vers anzeigen','Show opening words':'Anfangswörter zeigen','Hint used':'Hinweis verwendet','Listen':'Anhören','Complete familiarization':'Kennenlernen abschließen','Session complete':'Einheit abgeschlossen','Work completed':'Aufgabe abgeschlossen','Tasks':'Aufgaben','Recall average':'Durchschnitt','Perfect recall':'Fehlerfrei','Minutes':'Minuten','Choose another verse':'Anderen Vers wählen','Build next guided session':'Nächste geführte Einheit erstellen','Choose practice':'Übung wählen','End session':'Einheit beenden','Review only':'Nur Wiederholung','Scheduled':'Geplant','Practice':'Übung','Wording due':'Text fällig','Both due':'Beides fällig','Book, chapter & verse due':'Buch, Kapitel und Vers fällig','Not established':'Nicht gefestigt','Not learned':'Nicht gelernt','Known':'Bekannt','Stable wording':'Stabiler Wortlaut','Current':'Aktuell','English':'Englisch','German':'Deutsch','Korean':'Koreanisch',
      'Living the New Life':'Das neue Leben leben','Proclaiming Christ':'Christus verkündigen','Reliance on God’s Resources':'Aus Gottes Kraft leben','Being Christ’s Disciple':'Als Jünger Christi leben','Growth in Christlikeness':'Christus ähnlicher werden'
    },
    ko:{
      'Today':'오늘','Study':'학습','Library':'구절','Progress':'진행','Settings':'설정','Learn this verse':'이 구절 학습','Start today’s session':'오늘 학습 시작','Start today\'s session':'오늘 학습 시작','Study any verse':'구절 직접 선택','Placement check':'실력 확인','Start guided session':'추천 학습 시작','Guided review':'추천 복습','Choose any verse':'구절 선택','What do you want to study?':'어떤 구절을 학습하시겠습니까?','Verse':'구절','Study mode':'학습 방식','Status':'상태','Recommended learning path':'추천 학습 과정','Flashcard review':'플래시카드 복습','Build a multi-verse session':'여러 구절 학습 만들기','Browse library':'전체 구절 보기','Choose your next step':'다음 학습','Current streak':'연속 학습','Active study days':'학습한 날','Due now':'지금 복습','Learning':'학습 중','Memorized':'암송 완료','Stable':'안정됨','Established':'암송됨','Unseen':'미학습','Maintaining':'복습 중','Bible version':'성경 번역본','Memorization text':'암송 본문','App language':'앱 언어','Interface language':'앱 언어','Appearance':'화면 설정','Study plan':'학습 계획','Backup and restore':'백업 및 복원','Data principles':'데이터 원칙','Reset':'초기화','Light / dark mode':'라이트 / 다크 모드','Accent color':'강조 색상','Light':'라이트','Dark':'다크','Black / White':'검정 / 흰색','Blue':'파랑','Green':'초록','Red':'빨강','Purple':'보라','Brown / Beige':'갈색 / 베이지','Orange':'주황','Magenta':'마젠타','Start memorizing':'암송 시작','Session':'학습','Queue':'대기 목록','Completed':'완료','Remaining':'남음','Est. time':'예상 시간','Keyboard':'키보드','Practice session':'연습','Guided session':'추천 학습','Learning stage':'학습 단계','Wording interval':'본문 복습 간격','Book, chapter & verse interval':'장절 복습 간격','Delayed proofs':'지연 확인','Study this verse':'이 구절 학습','Type wording':'본문 입력','Recall book, chapter & verse':'장절 맞히기','Reset verse':'구절 초기화','Verse library':'전체 60구절','Search all 60 verses and study any one immediately.':'60구절을 검색하고 원하는 구절을 바로 학습할 수 있습니다.','Print':'인쇄','Multi-verse practice':'여러 구절 연습','All packs':'전체 묶음','All statuses':'전체 상태','Due':'복습 예정','Starred':'즐겨찾기','All scheduled work is complete':'예정된 학습을 모두 완료했습니다','Today’s session':'오늘 학습','Today\'s session':'오늘 학습','Your progress':'진행 상황','Continue learning':'계속 학습','No reviews are due right now.':'지금 복습할 구절이 없습니다.','Review what is due, then continue the verse you are learning.':'먼저 복습할 구절을 완료한 뒤 현재 학습 중인 구절을 이어서 학습하세요.','Keep today simple: review what is due and continue learning one verse.':'오늘은 복습할 구절을 처리하고 한 구절을 계속 학습하세요.','No locked progression':'강제 잠금 없음','Five packs':'5개 묶음','Pack progress':'묶음별 진행','Verses needing attention':'집중이 필요한 구절','Recent review history':'최근 복습 기록','Next seven days':'앞으로 7일','How verse progress works':'구절 진행 방식','Learn':'학습','Review':'복습','Exact typing':'정확히 입력','Flashcard recall':'플래시카드 회상','Missing words':'빈칸 채우기','First letters':'첫 글자','Book, chapter & verse recall':'장절 회상','Phrase build-up':'구절 나누기','Listen & repeat':'듣고 따라하기','Read and notice':'읽고 구조 파악','Build the verse':'구절 조립','Hide 40%':'40% 가리기','Hide 80%':'80% 가리기','Recall from initials':'첫 글자로 회상','Prove exact wording':'정확한 본문 확인','Start learning':'학습 시작','Continue':'계속','Close':'닫기','Cancel':'취소','Back':'뒤로','Next':'다음','Check answer':'정답 확인','Reveal verse':'구절 보기','Show opening words':'첫 단어 보기','Hint used':'힌트 사용','Listen':'듣기','Complete familiarization':'익숙해지기 완료','Session complete':'학습 완료','Work completed':'학습 완료','Tasks':'과제','Recall average':'평균 점수','Perfect recall':'완벽 회상','Minutes':'분','Choose another verse':'다른 구절 선택','Build next guided session':'다음 추천 학습 만들기','Choose practice':'연습 선택','End session':'학습 종료','Review only':'복습 전용','Scheduled':'예정됨','Practice':'연습','Wording due':'본문 복습','Both due':'둘 다 복습','Book, chapter & verse due':'장절 복습','Not established':'미완료','Not learned':'미학습','Known':'암','Stable wording':'안정된 본문','Current':'현재','English':'영어','German':'독일어','Korean':'한국어',
      'Living the New Life':'새 생명 안에서 살기','Proclaiming Christ':'그리스도를 전파하기','Reliance on God’s Resources':'하나님의 자원을 의지하기','Being Christ’s Disciple':'그리스도의 제자로 살기','Growth in Christlikeness':'그리스도를 닮아가기'
    }
  };

  const BOOKS={
    '2 Corinthians':{de:'2. Korinther',ko:'고린도후서'},'Galatians':{de:'Galater',ko:'갈라디아서'},'Romans':{de:'Römer',ko:'로마서'},'John':{de:'Johannes',ko:'요한복음'},'2 Timothy':{de:'2. Timotheus',ko:'디모데후서'},'Joshua':{de:'Josua',ko:'여호수아'},'Philippians':{de:'Philipper',ko:'빌립보서'},'Matthew':{de:'Matthäus',ko:'마태복음'},'Hebrews':{de:'Hebräer',ko:'히브리서'},'Isaiah':{de:'Jesaja',ko:'이사야'},'1 Peter':{de:'1. Petrus',ko:'베드로전서'},'Ephesians':{de:'Epheser',ko:'에베소서'},'Titus':{de:'Titus',ko:'디도서'},'Revelation':{de:'Offenbarung',ko:'요한계시록'},'1 John':{de:'1. Johannes',ko:'요한일서'},'1 Corinthians':{de:'1. Korinther',ko:'고린도전서'},'Lamentations':{de:'Klagelieder',ko:'예레미야애가'},'Numbers':{de:'4. Mose',ko:'민수기'},'Psalm':{de:'Psalm',ko:'시편'},'Luke':{de:'Lukas',ko:'누가복음'},'Mark':{de:'Markus',ko:'마가복음'},'Proverbs':{de:'Sprüche',ko:'잠언'},'Acts':{de:'Apostelgeschichte',ko:'사도행전'},'Leviticus':{de:'3. Mose',ko:'레위기'}
  };
  function localizeReference(text,lang){
    if(lang==='en')return text;
    for(const [en,names] of Object.entries(BOOKS).sort((a,b)=>b[0].length-a[0].length)){
      if(text===en||text.startsWith(en+' '))return names[lang]+text.slice(en.length);
    }
    return text;
  }
  function canonicalizeLocalizedReference(text){
    let x=String(text||'').trim();
    for(const [en,names] of Object.entries(BOOKS)){
      for(const lang of ['de','ko']){
        const name=names[lang];
        if(x.toLocaleLowerCase(localeFor(lang)).startsWith(name.toLocaleLowerCase(localeFor(lang))))return en+x.slice(name.length);
      }
    }
    return x;
  }

  const originalText=new WeakMap(),originalAttrs=new WeakMap();
  function translateString(raw,lang){
    const s=String(raw??''); if(lang==='en')return s;
    const lead=s.match(/^\s*/)?.[0]||'',trail=s.match(/\s*$/)?.[0]||'',core=s.slice(lead.length,s.length-trail.length);
    const dict=DICT[lang]||{}; if(Object.hasOwn(dict,core))return lead+dict[core]+trail;
    if(/^([1-3] |[A-Za-z]).*\d+:\d/.test(core)||/^\D+\s\d+:\d/.test(core)){
      const localized=localizeReference(core,lang); if(localized!==core)return lead+localized+trail;
    }
    let m;
    if((m=core.match(/^Verse (\d+) of 60$/)))return lead+(lang==='de'?`Vers ${m[1]} von 60`:`60구절 중 ${m[1]}번`)+trail;
    if((m=core.match(/^Pack ([A-E])$/)))return lead+(lang==='de'?`Paket ${m[1]}`:`묶음 ${m[1]}`)+trail;
    if((m=core.match(/^Study (.+)$/)))return lead+(lang==='de'?`${localizeReference(m[1],lang)} lernen`:`${localizeReference(m[1],lang)} 학습`)+trail;
    if((m=core.match(/^Continue (.+)$/)))return lead+(lang==='de'?`${localizeReference(m[1],lang)} weiterlernen`:`${localizeReference(m[1],lang)} 계속`)+trail;
    if((m=core.match(/^Task (\d+) of (\d+)$/)))return lead+(lang==='de'?`Aufgabe ${m[1]} von ${m[2]}`:`${m[2]}개 중 ${m[1]}번째`)+trail;
    if((m=core.match(/^(\d+) days?$/)))return lead+(lang==='de'?`${m[1]} Tage`:`${m[1]}일`)+trail;
    if((m=core.match(/^(\d+) min$/)))return lead+(lang==='de'?`${m[1]} Min.`:`${m[1]}분`)+trail;
    if((m=core.match(/^(\d+) stable$/)))return lead+(lang==='de'?`${m[1]} stabil`:`${m[1]} 안정됨`)+trail;
    if((m=core.match(/^(\d+) established$/)))return lead+(lang==='de'?`${m[1]} gefestigt`:`${m[1]} 암송됨`)+trail;
    return s;
  }
  function shouldSkip(node){const p=node.parentElement;return !p||p.closest('script,style,#translation-copyright,.verse-text,.quote-mini,.diff')}
  function localizeTree(root=document){
    const lang=detectLanguage();document.documentElement.lang=lang;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode())){if(shouldSkip(n))continue;if(!originalText.has(n))originalText.set(n,n.nodeValue);const base=originalText.get(n);const next=translateString(base,lang);if(n.nodeValue!==next)n.nodeValue=next}
    root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el=>{
      let rec=originalAttrs.get(el);if(!rec){rec={};originalAttrs.set(el,rec)}
      for(const attr of ['placeholder','aria-label','title'])if(el.hasAttribute(attr)){if(!(attr in rec))rec[attr]=el.getAttribute(attr);const next=translateString(rec[attr],lang);if(el.getAttribute(attr)!==next)el.setAttribute(attr,next)}
    });
  }

  function setupApp(){
    let currentLang=detectLanguage();setStoredLanguage(currentLang);document.documentElement.lang=currentLang;
    const coreRenderHome=renderHome,coreRenderStudy=renderStudy,coreRenderAll=renderAll,coreStartVerseLearning=startVerseLearning,coreCompleteCurrent=completeCurrent,coreNormalizeReference=normalizeReference;

    normalizeReference=function(value){return coreNormalizeReference(canonicalizeLocalizedReference(value))};

    function smartLearningTask(id){const v=verseById(id);const task=learningTask(v);return {...task,source:'guided',label:`Learn this verse · ${task.label}`}}
    function startSmartLearn(id){
      id=Number(id);if(!validVerseId(id))return false;
      if(hasActiveSession()){toast('Resume or end the active session before starting another verse.','error');switchView('study');return false}
      const p=state.progress[id];if(p.stage===6)return coreStartVerseLearning(id);
      const task=smartLearningTask(id);studyPickerVerseId=id;
      session={type:'smart-learn',tasks:[task],index:0,results:[],completed:[],startedAt:now(),currentStartedAt:now(),exercise:{},config:{filter:'single-learning',mode:'path',selectedVerseId:id,smart:true},summary:null};
      completionLocked=false;switchView('study');return true;
    }
    startVerseLearning=startSmartLearn;

    // Completing a task may advance the verse's learning stage, but it must not
    // append the next stage to the active session. The completion screen already
    // provides an explicit Continue action for users who want another step.
    completeCurrent=function(...args){return coreCompleteCurrent(...args)};

    renderHome=function(){
      const m=metrics(),q=buildGuidedQueue(),next=nextLearningVerse(),dueCount=m.dueW+m.dueR,memorized=m.established,pct=Math.round(100*memorized/60);
      const root=document.getElementById('view-home');
      root.innerHTML=`<div class="page-head"><div><h1>Today</h1><p>Keep today simple: review what is due and continue learning one verse.</p></div><div class="actions"><button class="btn" data-view="study">Study any verse</button><button class="btn primary" data-action="start-guided">Start today’s session</button></div></div>
      <div class="grid metrics"><div class="metric"><div class="metric-label">Due now</div><div class="metric-value">${dueCount}</div><div class="metric-note">${m.dueW} wording · ${m.dueR} reference</div></div><div class="metric"><div class="metric-label">Learning</div><div class="metric-value">${m.learning}</div><div class="metric-note">Verses currently in the learning path</div></div><div class="metric"><div class="metric-label">Memorized</div><div class="metric-value metric-fraction"><span>${memorized}</span><span class="metric-denominator">/ 60</span></div><div class="metric-note">${m.stable} stable long-term</div></div><div class="metric"><div class="metric-label">Current streak</div><div class="metric-value">${streak()}</div><div class="metric-note">Active study days</div></div></div>
      <div class="hero"><article class="card session-card"><div class="eyebrow">Today’s session</div><div class="session-title">${q.length?`${q.length} focused task${q.length===1?'':'s'}`:'All scheduled work is complete'}</div><p class="muted">${q.length?`Review what is due, then continue the verse you are learning. Approximately ${estimatedMinutes(q)} minutes.`:'No reviews are due right now. You can learn a verse or stop for today.'}</p><div class="queue-chips">${q.slice(0,5).map(t=>`<span class="queue-chip">${htmlEsc(t.label)} · ${htmlEsc(verseById(t.verseId).reference)}</span>`).join('')}${q.length>5?`<span class="queue-chip">+${q.length-5} more</span>`:''}</div><button class="btn primary" data-action="${q.length?'start-guided':'open-practice'}">${q.length?'Start today’s session':'Choose practice'}</button></article><div class="hero-side"><article class="card flat"><div class="eyebrow">Continue learning</div>${next?`<div class="next-verse"><div class="verse-number">${next.id}</div><div><strong>${htmlEsc(next.reference)}</strong><div class="muted small-text">${STAGE_LABELS[state.progress[next.id].stage]}</div><div class="quote-mini">${htmlEsc(next.text.slice(0,92))}${next.text.length>92?'…':''}</div></div></div><div class="inline-control-actions"><button class="btn small primary" data-action="start-verse-learning" data-id="${next.id}">Learn this verse</button><button class="btn small" data-view="study">Choose any verse</button></div>`:`<p class="muted">All 60 verses have reached maintenance.</p><button class="btn small primary" data-view="study">Study any verse</button>`}</article><article class="card flat"><div class="eyebrow">Your progress</div><div class="metric-value metric-fraction"><span>${memorized}</span><span class="metric-denominator">/ 60</span></div><div class="progress-track" style="margin:10px 0"><div class="progress-fill" style="width:${pct}%"></div></div><div class="muted small-text">${m.stable} stable · ${m.learning} learning · ${m.unseen} unseen</div></article></div></div>`;
      postProcess();
    };

    renderStudy=function(){
      coreRenderStudy();
      if(session.type==='smart-learn'){
        const root=document.getElementById('view-study'),h=root?.querySelector('.page-head h1'),p=root?.querySelector('.page-head p');
        if(h)h.textContent='Learn this verse';
        if(p&&currentVerse())p.textContent=`${currentVerse().reference} · ${session.index+1} / ${session.tasks.length}`;
      }
      postProcess();
    };

    function installLanguageSettings(){
      const root=document.getElementById('view-settings');if(!root||root.querySelector('[data-ui-language-settings]'))return;
      const firstStack=root.querySelector('.settings-grid .stack');if(!firstStack)return;
      const card=document.createElement('article');card.className='card flat';card.dataset.uiLanguageSettings='1';
      card.innerHTML=`<h2>App language</h2><div class="field"><label for="ui-language-select">Interface language</label><select id="ui-language-select"><option value="en" ${currentLang==='en'?'selected':''}>English</option><option value="de" ${currentLang==='de'?'selected':''}>Deutsch</option><option value="ko" ${currentLang==='ko'?'selected':''}>한국어</option></select><div class="help">The app language changes menus and instructions. Your Bible version is a separate setting.</div></div>`;
      firstStack.insertBefore(card,firstStack.children[1]||null);
    }
    function postProcess(){installLanguageSettings();localizeTree(document)}
    renderAll=function(){coreRenderAll();postProcess()};

    document.addEventListener('change',e=>{if(e.target.id==='ui-language-select'){const lang=e.target.value;if(!SUPPORTED.includes(lang))return;currentLang=lang;setStoredLanguage(lang);document.documentElement.lang=lang;renderAll();const sel=document.getElementById('ui-language-select');if(sel)sel.value=lang}});

    const originalVoiceOptions=voiceOptions;
    voiceOptions=function(){
      const version=safeGet('tms60-active-translation-v1')||'esv',prefix=version==='schlachter1951'?'de':version==='krv1961'?'ko':'en',list=voices.filter(v=>new RegExp('^'+prefix+'(-|_)','i').test(v.lang)),use=list.length?list:voices;
      return use.map(v=>`<option value="${htmlEsc(v.name)}" ${v.name===state.settings.audioVoice?'selected':''}>${htmlEsc(v.name)} (${htmlEsc(v.lang)})</option>`).join('')||originalVoiceOptions();
    };
    speakCurrent=function(){
      const v=currentVerse();if(!v||!speechAvailable()){toast('Speech synthesis is not available in this browser.','error');return}
      speechSynthesis.cancel();const version=safeGet('tms60-active-translation-v1')||'esv',lang=version==='schlachter1951'?'de-DE':version==='krv1961'?'ko-KR':'en-US',u=new SpeechSynthesisUtterance(`${v.reference}. ${v.text}`),sel=document.getElementById('voice-select'),rate=document.getElementById('audio-rate'),name=sel?.value||state.settings.audioVoice;u.lang=lang;u.voice=voices.find(x=>x.name===name)||voices.find(x=>x.lang?.toLowerCase().startsWith(lang.slice(0,2).toLowerCase()))||null;u.rate=clamp(rate?.value||state.settings.audioRate,.6,1.3);const changed=state.settings.audioRate!==u.rate||Boolean(name&&state.settings.audioVoice!==name);state.settings.audioRate=u.rate;if(name)state.settings.audioVoice=name;if(changed)markSettingsChanged();speechSynthesis.speak(u);scheduleSave();
    };

    const observer=new MutationObserver(()=>queueMicrotask(()=>postProcess()));observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
    renderAll();
  }

  if(window.top===window)setupShell();else setupApp();
})();
