/* TMS 60 parent-side incremental localization runtime.
   Localizes dynamic DE/KO UI without whole-document mutation rescans. */
'use strict';
(() => {
  if (window.top !== window || window.__TMS_LOCALIZATION_RUNTIME__) return;
  window.__TMS_LOCALIZATION_RUNTIME__ = true;

  const KEY='tms60-ui-language-v1';
  const SUPPORTED=new Set(['en','de','ko']);
  const originalText=new WeakMap();
  const originalAttrs=new WeakMap();
  let observedDocument=null, observer=null;

  function currentLang(){
    try{const x=localStorage.getItem(KEY);if(SUPPORTED.has(x))return x}catch(_){}
    const x=String(navigator.language||'').toLowerCase();
    return x.startsWith('de')?'de':x.startsWith('ko')?'ko':'en';
  }

  const BOOKS={
    '2 Corinthians':['2. Korinther','고린도후서'],'Galatians':['Galater','갈라디아서'],'Romans':['Römer','로마서'],'John':['Johannes','요한복음'],'2 Timothy':['2. Timotheus','디모데후서'],'Joshua':['Josua','여호수아'],'Philippians':['Philipper','빌립보서'],'Matthew':['Matthäus','마태복음'],'Hebrews':['Hebräer','히브리서'],'Isaiah':['Jesaja','이사야'],'1 Peter':['1. Petrus','베드로전서'],'Ephesians':['Epheser','에베소서'],'Titus':['Titus','디도서'],'Revelation':['Offenbarung','요한계시록'],'1 John':['1. Johannes','요한일서'],'1 Corinthians':['1. Korinther','고린도전서'],'Lamentations':['Klagelieder','예레미야애가'],'Numbers':['4. Mose','민수기'],'Psalm':['Psalm','시편'],'Luke':['Lukas','누가복음'],'Mark':['Markus','마가복음'],'Proverbs':['Sprüche','잠언'],'Acts':['Apostelgeschichte','사도행전'],'Leviticus':['3. Mose','레위기']
  };
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
      'Today':'Heute','Study':'Lernen','Library':'Bibliothek','Verse library':'Versbibliothek','Progress':'Fortschritt','Settings':'Einstellungen',
      'Private and offline':'Privat und offline','No account, network request, advertisement, or tracking. Export backups periodically.':'Kein Konto, keine Werbung und kein Tracking. Exportiere regelmäßig Sicherungen.','Saved locally':'Lokal gespeichert',
      'Study plan':'Lernplan','Backup and restore':'Sicherung und Wiederherstellung','Data principles':'Datenprinzipien','Bible version':'Bibelübersetzung','Memorization text':'Text zum Auswendiglernen','Appearance':'Darstellung','Light / dark mode':'Hell / Dunkel','Light':'Hell','Dark':'Dunkel','Accent color':'Akzentfarbe','Reset':'Zurücksetzen','Interface scale':'Oberflächengröße',
      'Daily task target':'Tägliches Aufgabenziel','Target completion date':'Zieldatum','Target retention display':'Ziel-Behaltequote','Default missing-word level':'Standard-Lückentextstufe','Shuffle mature reviews':'Reife Wiederholungen mischen','Streak grace days':'Kulanz-Tage für die Serie',
      'App language':'App-Sprache','Interface language':'App-Sprache','English':'Englisch','German':'Deutsch','Korean':'Koreanisch','Black / White':'Schwarz / Weiß','Blue':'Blau','Green':'Grün','Red':'Rot','Purple':'Violett','Brown / Beige':'Braun / Beige','Orange':'Orange','Magenta':'Magenta',
      'Export history CSV':'Verlauf als CSV exportieren','Export progress':'Fortschritt exportieren','Import backup':'Sicherung importieren','Recover snapshot':'Schnappschuss wiederherstellen','Export review CSV':'Wiederholungen als CSV exportieren','Reset progress, keep settings':'Fortschritt zurücksetzen, Einstellungen behalten','Reset everything':'Alles zurücksetzen','Bundled with TMS 60.':'In TMS 60 enthalten.',
      'Assisted learning never proves long-term mastery.':'Unterstütztes Lernen weist keine langfristige Beherrschung nach.','Wording and book, chapter & verse schedules are independent.':'Wortlaut- und Referenzpläne sind unabhängig voneinander.','Failed scheduled cards enter relearning.':'Fehlgeschlagene geplante Karten gehen in die Wiederlernphase.','Successful early extra practice cannot accelerate intervals.':'Erfolgreiche zusätzliche Frühübungen können Intervalle nicht beschleunigen.','Review history is retained for diagnostics.':'Der Wiederholungsverlauf wird für Diagnosen gespeichert.',
      'Due now':'Jetzt fällig','DUE NOW':'JETZT FÄLLIG','How verse progress works':'So funktioniert der Versfortschritt','Pack progress':'Paketfortschritt','Next seven days':'Nächste sieben Tage','Verses needing attention':'Verse mit Lernbedarf','Recent review history':'Letzte Wiederholungen','Recurring word errors':'Wiederkehrende Wortfehler','VERSE':'VERS','Stage':'Stufe','Last':'Zuletzt','Lapses':'Fehler',
      'Complete exact typing, initials, or cloze checks to build a personal error profile.':'Absolviere exaktes Tippen, Anfangsbuchstaben- oder Lückentextprüfungen, um ein persönliches Fehlerprofil aufzubauen.','No reviews recorded yet.':'Noch keine Wiederholungen gespeichert.','No verses currently show weak scores, lapses, or unfinished learning.':'Aktuell zeigen keine Verse schwache Werte, Fehler oder unvollständiges Lernen.',
      'Learning':'Lernen','Maintaining':'Wiederholen','Stable':'Stabil','Unseen':'Ungelernt','Established':'Gefestigt','Memorized':'Gelernt','Not established':'Nicht gefestigt','Not learned':'Nicht gelernt',
      'Learning stage':'Lernstufe','Wording interval':'Wortlaut-Intervall','Book, chapter & verse interval':'Referenz-Intervall','Delayed proofs':'Zeitversetzte Nachweise','Study this verse':'Diesen Vers lernen','Type wording':'Wortlaut tippen','Recall book, chapter & verse':'Buch, Kapitel und Vers abrufen','Reset verse':'Vers zurücksetzen',
      'Read & absorb':'Lesen & aufnehmen','Listen':'Anhören','Queue':'Warteschlange','Keyboard':'Tastatur','Session':'Einheit','Completed':'Erledigt','Remaining':'Verbleibend','Est. time':'Geschätzte Zeit',
      'Ctrl/⌘ + Enter checks answers. Space reveals flashcards. Keys 1–4 select a rating after checking.':'Strg/⌘ + Enter prüft Antworten. Leertaste deckt Karteikarten auf. Die Tasten 1–4 wählen nach der Prüfung eine Bewertung.','Assisted learning advances the acquisition ladder but does not count as long-term mastery.':'Unterstütztes Lernen bringt dich im Lernprozess weiter, zählt aber nicht als langfristige Beherrschung.',
      'Search all 60 verses and study any one immediately.':'Durchsuche alle 60 Verse und lerne jeden beliebigen sofort.','Print':'Drucken','Multi-verse practice':'Mehrere Verse üben','All packs':'Alle Pakete','All statuses':'Alle Status',
      'Open any verse immediately. The scheduler recommends reviews, but it never controls what you are allowed to study.':'Öffne jeden Vers sofort. Der Planer empfiehlt Wiederholungen, bestimmt aber nie, was du lernen darfst.','Select a verse and a mode. You can move forward, repeat the same verse, or jump anywhere at any time.':'Wähle einen Vers und einen Lernmodus. Du kannst weitergehen, denselben Vers wiederholen oder jederzeit zu einem anderen Vers springen.','Choose “Recommended learning path” to continue this verse from its current stage, or select any practice mode directly.':'Wähle „Empfohlener Lernweg“, um diesen Vers an seiner aktuellen Stufe fortzusetzen, oder wähle direkt einen Übungsmodus.',
      'See what you are learning now, what you can already recall, and what has become stable over time.':'Sieh, was du gerade lernst, was du bereits abrufen kannst und was langfristig stabil geworden ist.','30-day exact':'30-Tage-Genauigkeit','30-DAY EXACT':'30-TAGE-GENAUIGKEIT','Perfect recalls':'Fehlerfreie Abrufe','PERFECT RECALLS':'FEHLERFREIE ABRUFE','Still moving through guided learning stages':'Noch in den geführten Lernstufen','Wording established; building long-term retention':'Wortlaut gefestigt; langfristige Behaltensleistung wird aufgebaut','21+ day interval and two spaced perfect proofs':'Mindestens 21 Tage Intervall und zwei zeitversetzte perfekte Nachweise','Average unaided wording and book, chapter & verse score':'Durchschnittlicher Wert für Wortlaut und Referenz ohne Hilfe','Share of recent unaided checks scored 100%':'Anteil der letzten Prüfungen ohne Hilfe mit 100 %','Each bar includes learning, maintaining, and stable verses.':'Jeder Balken enthält Verse in den Phasen Lernen, Wiederholen und Stabil.',
      'Adjust workload, appearance, scheduling targets, and local backups.':'Passe Arbeitsumfang, Darstellung, Planungsziele und lokale Sicherungen an.','Progress is stored in this browser. Export a JSON backup before clearing browser data or changing devices.':'Der Fortschritt wird in diesem Browser gespeichert. Exportiere eine JSON-Sicherung, bevor du Browserdaten löschst oder das Gerät wechselst.','Light uses white surfaces. Dark uses a deep background tinted by the selected accent.':'Hell verwendet weiße Flächen. Dunkel verwendet einen tiefen, mit der Akzentfarbe getönten Hintergrund.','Study freely.':'Frei lernen.','Guided sessions remain available for recommendations, but the Study tab and Library always let you open any verse immediately.':'Geführte Einheiten bleiben als Empfehlung verfügbar, aber unter Lernen und in der Bibliothek kannst du jederzeit jeden Vers direkt öffnen.',
      'Living the New Life':'Das neue Leben leben','Proclaiming Christ':'Christus verkündigen','Reliance on God’s Resources':'Aus Gottes Kraft leben',"Reliance on God's Resources":'Aus Gottes Kraft leben','Being Christ’s Disciple':'Als Jünger Christi leben',"Being Christ's Disciple":'Als Jünger Christi leben','Growth in Christlikeness':'Christus ähnlicher werden'
    },
    ko:{
      'Today':'오늘','Study':'학습','Library':'구절','Verse library':'전체 60구절','Progress':'진행','Settings':'설정',
      'Private and offline':'개인용 · 오프라인','No account, network request, advertisement, or tracking. Export backups periodically.':'계정, 광고, 추적 없이 사용할 수 있습니다. 진행 상황은 정기적으로 백업하세요.','Saved locally':'기기에 저장됨',
      'Study plan':'학습 계획','Backup and restore':'백업 및 복원','Data principles':'데이터 원칙','Bible version':'성경 번역본','Memorization text':'암송 본문','Appearance':'화면 설정','Light / dark mode':'라이트 / 다크 모드','Light':'라이트','Dark':'다크','Accent color':'강조 색상','Reset':'초기화','Interface scale':'화면 크기',
      'Daily task target':'하루 학습 목표','Target completion date':'목표 완료 날짜','Target retention display':'목표 기억 유지율','Default missing-word level':'기본 빈칸 비율','Shuffle mature reviews':'숙달 구절 복습 순서 섞기','Streak grace days':'연속 학습 유예일',
      'App language':'앱 언어','Interface language':'앱 언어','English':'영어','German':'독일어','Korean':'한국어','Black / White':'검정 / 흰색','Blue':'파랑','Green':'초록','Red':'빨강','Purple':'보라','Brown / Beige':'갈색 / 베이지','Orange':'주황','Magenta':'마젠타',
      'Export history CSV':'기록 CSV 내보내기','Export progress':'진행 상황 내보내기','Import backup':'백업 가져오기','Recover snapshot':'자동 백업 복원','Export review CSV':'복습 CSV 내보내기','Reset progress, keep settings':'진행 상황만 초기화','Reset everything':'모두 초기화','Bundled with TMS 60.':'TMS 60에 기본 포함되어 있습니다.',
      'Assisted learning never proves long-term mastery.':'도움이 있는 학습은 장기 숙달의 증거로 인정되지 않습니다.','Wording and book, chapter & verse schedules are independent.':'본문 복습과 장절 복습 일정은 서로 독립적입니다.','Failed scheduled cards enter relearning.':'예정된 복습에 실패하면 다시 학습 단계로 들어갑니다.','Successful early extra practice cannot accelerate intervals.':'예정보다 이른 추가 연습에 성공해도 복습 간격은 빨라지지 않습니다.','Review history is retained for diagnostics.':'복습 기록은 학습 상태 분석을 위해 보관됩니다.',
      'Due now':'지금 복습','DUE NOW':'지금 복습','How verse progress works':'구절 진행 방식','Pack progress':'묶음별 진행','Next seven days':'앞으로 7일','Verses needing attention':'집중이 필요한 구절','Recent review history':'최근 복습 기록','Recurring word errors':'반복되는 단어 오류','VERSE':'구절','Stage':'단계','Last':'최근','Lapses':'실패',
      'Complete exact typing, initials, or cloze checks to build a personal error profile.':'정확히 입력하기, 첫 글자 또는 빈칸 채우기 연습을 완료하면 개인 오류 패턴을 확인할 수 있습니다.','No reviews recorded yet.':'아직 기록된 복습이 없습니다.','No verses currently show weak scores, lapses, or unfinished learning.':'현재 낮은 점수, 실패 또는 미완료 학습이 있는 구절이 없습니다.',
      'Learning':'학습 중','Maintaining':'복습 중','Stable':'안정됨','Unseen':'미학습','Established':'암송됨','Memorized':'암송 완료','Not established':'미완료','Not learned':'미학습',
      'Learning stage':'학습 단계','Wording interval':'본문 복습 간격','Book, chapter & verse interval':'장절 복습 간격','Delayed proofs':'지연 확인','Study this verse':'이 구절 학습','Type wording':'본문 입력','Recall book, chapter & verse':'장절 맞히기','Reset verse':'구절 초기화',
      'Read & absorb':'읽고 익히기','Listen':'듣기','Queue':'대기 목록','Keyboard':'키보드','Session':'학습','Completed':'완료','Remaining':'남음','Est. time':'예상 시간',
      'Ctrl/⌘ + Enter checks answers. Space reveals flashcards. Keys 1–4 select a rating after checking.':'Ctrl/⌘ + Enter로 답을 확인합니다. 스페이스바로 플래시카드를 공개합니다. 확인 후 1–4 키로 평가를 선택합니다.','Assisted learning advances the acquisition ladder but does not count as long-term mastery.':'도움을 받는 학습은 학습 단계를 진행시키지만 장기 숙달로 인정되지는 않습니다.',
      'Search all 60 verses and study any one immediately.':'60구절을 검색하고 원하는 구절을 바로 학습할 수 있습니다.','Print':'인쇄','Multi-verse practice':'여러 구절 연습','All packs':'전체 묶음','All statuses':'전체 상태',
      'Open any verse immediately. The scheduler recommends reviews, but it never controls what you are allowed to study.':'원하는 구절을 즉시 열 수 있습니다. 복습 일정은 추천만 하며 학습할 수 있는 구절을 제한하지 않습니다.','Select a verse and a mode. You can move forward, repeat the same verse, or jump anywhere at any time.':'구절과 학습 방식을 선택하세요. 다음 구절로 넘어가거나 같은 구절을 반복하거나 언제든 원하는 구절로 이동할 수 있습니다.','Choose “Recommended learning path” to continue this verse from its current stage, or select any practice mode directly.':'“추천 학습 과정”을 선택하면 현재 단계부터 이어서 학습할 수 있으며 원하는 연습 방식을 직접 선택할 수도 있습니다.',
      'See what you are learning now, what you can already recall, and what has become stable over time.':'현재 학습 중인 구절, 이미 암송할 수 있는 구절, 장기적으로 안정된 구절을 확인하세요.','30-day exact':'30일 정확도','30-DAY EXACT':'30일 정확도','Perfect recalls':'완벽 회상','PERFECT RECALLS':'완벽 회상','Still moving through guided learning stages':'추천 학습 단계를 진행 중','Wording established; building long-term retention':'본문 암송 완료 · 장기 기억을 강화하는 중','21+ day interval and two spaced perfect proofs':'21일 이상 간격과 두 번의 완벽한 지연 확인','Average unaided wording and book, chapter & verse score':'도움 없이 수행한 본문 및 장절 평균 점수','Share of recent unaided checks scored 100%':'최근 도움 없는 확인에서 100%를 기록한 비율','Each bar includes learning, maintaining, and stable verses.':'각 막대에는 학습 중, 복습 중, 안정된 구절이 함께 표시됩니다.',
      'Adjust workload, appearance, scheduling targets, and local backups.':'학습량, 화면 설정, 일정 목표, 로컬 백업을 조정하세요.','Progress is stored in this browser. Export a JSON backup before clearing browser data or changing devices.':'진행 상황은 이 브라우저에 저장됩니다. 브라우저 데이터를 삭제하거나 기기를 바꾸기 전에 JSON 백업을 내보내세요.','Light uses white surfaces. Dark uses a deep background tinted by the selected accent.':'라이트 모드는 밝은 화면을, 다크 모드는 선택한 강조 색상이 반영된 어두운 화면을 사용합니다.','Study freely.':'자유롭게 학습하세요.','Guided sessions remain available for recommendations, but the Study tab and Library always let you open any verse immediately.':'추천 학습은 계속 사용할 수 있지만 학습 탭과 전체 구절에서는 언제든 원하는 구절을 바로 열 수 있습니다.',
      'Living the New Life':'새 생명 안에서 살기','Proclaiming Christ':'그리스도를 전파하기','Reliance on God’s Resources':'하나님의 자원을 의지하기',"Reliance on God's Resources":'하나님의 자원을 의지하기','Being Christ’s Disciple':'그리스도의 제자로 살기',"Being Christ's Disciple":'그리스도의 제자로 살기','Growth in Christlikeness':'그리스도를 닮아가기'
    }
  };

  function localizeReference(s,l){
    if(l==='en')return s;
    let out=String(s);
    for(const [en,names] of Object.entries(BOOKS).sort((a,b)=>b[0].length-a[0].length)){
      const esc=en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      out=out.replace(new RegExp('(^|\\b)'+esc+'(?=\\s+\\d+:\\d)','g'),(_,p)=>p+names[l==='de'?0:1]);
    }
    return out;
  }
  function localizePack(s,l){const x=PACKS[s];return x?x[l==='de'?0:1]:s}

  function tr(raw,l){
    const s=String(raw??'');if(l==='en'||!s.trim())return s;
    const lead=s.match(/^\s*/)?.[0]||'',trail=s.match(/\s*$/)?.[0]||'',core=s.slice(lead.length,s.length-trail.length),dict=D[l]||{};
    if(Object.hasOwn(dict,core))return lead+dict[core]+trail;
    let m;
    if((m=core.match(/^([✓✔])\s*(.+)$/))){const body=tr(m[2],l);return lead+m[1]+' '+body.trim()+trail}
    if((m=core.match(/^(?:Pack|Paket|묶음)\s+([A-E])\s*[·:]\s*(.+)$/))){return lead+(l==='de'?'Paket ':'묶음 ')+m[1]+' · '+localizePack(m[2],l)+trail}
    if((m=core.match(/^(?:Pack|Paket|묶음)\s+([A-E])$/)))return lead+(l==='de'?'Paket ':'묶음 ')+m[1]+trail;
    if((m=core.match(/^(\d+)\.\s+(.+\d+:\d+(?:-\d+)?)$/)))return lead+m[1]+'. '+localizeReference(m[2],l)+trail;
    const rr=localizeReference(core,l);if(rr!==core)return lead+rr+trail;
    if((m=core.match(/^(Unseen|Learning|Maintaining|Stable|Established)\s*·\s*(.+)$/))){const status=tr(m[1],l).trim();return lead+status+' · '+localizeReference(m[2],l)+trail}
    if((m=core.match(/^Review what is due, then continue the verse you are learning\. Approximately (\d+) minutes?\.$/)))return lead+(l==='de'?`Wiederhole zuerst das Fällige und lerne danach deinen aktuellen Vers weiter. Ungefähr ${m[1]} ${m[1]==='1'?'Minute':'Minuten'}.`:`먼저 복습할 내용을 완료한 뒤 현재 학습 중인 구절을 이어서 학습하세요. 약 ${m[1]}분.`)+trail;
    if((m=core.match(/^Interface scale:\s*(\d+)%$/)))return lead+(l==='de'?`Oberflächengröße: ${m[1]} %`:`화면 크기: ${m[1]}%`)+trail;
    if((m=core.match(/^Recover snapshot \((\d+)\)$/)))return lead+(l==='de'?`Schnappschuss wiederherstellen (${m[1]})`:`자동 백업 복원 (${m[1]})`)+trail;
    if((m=core.match(/^(\d+) verses?$/)))return lead+(l==='de'?`${m[1]} ${m[1]==='1'?'Vers':'Verse'}`:`${m[1]}구절`)+trail;
    if((m=core.match(/^Verse (\d+) of 60$/)))return lead+(l==='de'?`Vers ${m[1]} von 60`:`60구절 중 ${m[1]}번`)+trail;
    if((m=core.match(/^Oral self-checks:\s*(\d+)\/(\d+) passed$/)))return lead+(l==='de'?`Mündliche Selbstkontrollen: ${m[1]}/${m[2]} bestanden`:`구두 자가 점검: ${m[1]}/${m[2]} 통과`)+trail;
    if((m=core.match(/^(\d+)% hidden$/)))return lead+(l==='de'?`${m[1]} % ausgeblendet`:`${m[1]}% 가림`)+trail;
    if((m=core.match(/^(\d+) focused tasks?$/)))return lead+(l==='de'?`${m[1]} fokussierte ${m[1]==='1'?'Aufgabe':'Aufgaben'}`:`집중 과제 ${m[1]}개`)+trail;
    if((m=core.match(/^(\d+) wording · (\d+) (?:reference|book, chapter & verse)$/)))return lead+(l==='de'?`${m[1]} Wortlaut · ${m[2]} Referenz`:`본문 ${m[1]} · 장절 ${m[2]}`)+trail;
    if((m=core.match(/^(\d+) learning · (\d+) maintaining · (\d+) stable$/)))return lead+(l==='de'?`${m[1]} Lernen · ${m[2]} Wiederholen · ${m[3]} stabil`:`학습 중 ${m[1]} · 복습 중 ${m[2]} · 안정됨 ${m[3]}`)+trail;
    if((m=core.match(/^Schema (\d+) · (\d+) review events · Last saved (.+)$/)))return lead+(l==='de'?`Schema ${m[1]} · ${m[2]} Wiederholungsereignisse · Zuletzt gespeichert ${m[3]}`:`스키마 ${m[1]} · 복습 기록 ${m[2]}개 · 마지막 저장 ${m[3]}`)+trail;
    if((m=core.match(/^[☆★]\s*(Starred|Star)$/)))return lead+core[0]+' '+(l==='de'?(m[1]==='Starred'?'Markiert':'Markieren'):(m[1]==='Starred'?'즐겨찾기됨':'즐겨찾기'))+trail;
    return s;
  }

  function shouldSkip(node){const p=node.parentElement;return !p||!!p.closest('script,style,#translation-copyright,.verse-text,.quote-mini,.diff,.char-text,.initials-prompt,.cloze-line')}
  function translateTextNode(node,l){
    if(shouldSkip(node))return;
    if(!originalText.has(node))originalText.set(node,node.nodeValue);
    const base=originalText.get(node),next=tr(base,l);if(node.nodeValue!==next)node.nodeValue=next;
  }
  function translateElement(root,l){
    if(!root)return;
    if(root.nodeType===Node.TEXT_NODE){translateTextNode(root,l);return}
    if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
    const doc=root.ownerDocument||root,walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode()))translateTextNode(n,l);
    root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el=>{
      let rec=originalAttrs.get(el);if(!rec){rec={};originalAttrs.set(el,rec)}
      for(const attr of ['placeholder','aria-label','title'])if(el.hasAttribute(attr)){
        if(!(attr in rec))rec[attr]=el.getAttribute(attr);const next=tr(rec[attr],l);if(el.getAttribute(attr)!==next)el.setAttribute(attr,next)
      }
    });
  }
  function translateDocument(doc){if(!doc?.body)return;const l=currentLang();doc.documentElement.lang=l;translateElement(doc.body,l)}

  function attachToFrame(){
    const frame=document.getElementById('app-frame');if(!frame)return;
    const attach=()=>{
      const doc=frame.contentDocument;if(!doc?.body){setTimeout(attach,100);return}
      if(observedDocument===doc)return;
      if(observer)observer.disconnect();observedDocument=doc;translateDocument(doc);
      observer=new MutationObserver(records=>{const l=currentLang();for(const record of records)for(const node of record.addedNodes)translateElement(node,l)});
      observer.observe(doc.body,{childList:true,subtree:true});
      doc.addEventListener('change',event=>{if(event.target?.id==='ui-language-select')requestAnimationFrame(()=>translateDocument(doc))},true);
      doc.addEventListener('click',()=>requestAnimationFrame(()=>translateDocument(doc)),true);
      doc.documentElement.dataset.tmsLocalizationRuntime='loaded';
    };
    frame.addEventListener('load',attach);attach();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attachToFrame,{once:true});else attachToFrame();
})();