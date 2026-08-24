/* TMS 60 localization runtime.
   Parent-side, incremental, and resilient across dynamic iframe renders. */
'use strict';
(() => {
  if (window.top !== window || window.__TMS_LOCALIZATION_RUNTIME_V2__) return;
  window.__TMS_LOCALIZATION_RUNTIME_V2__ = true;

  const KEY='tms60-ui-language-v1';
  const SUPPORTED=new Set(['en','de','ko']);
  let frameObserver=null,parentObserver=null,frameDocument=null,refreshRaf=0;

  function currentLang(){
    try{const x=localStorage.getItem(KEY);if(SUPPORTED.has(x))return x}catch(_){}
    const x=String(navigator.language||'').toLowerCase();
    return x.startsWith('de')?'de':x.startsWith('ko')?'ko':'en';
  }
  function setLang(lang){if(!SUPPORTED.has(lang))return;try{localStorage.setItem(KEY,lang)}catch(_){}}

  const BOOKS={
    '2 Corinthians':['2. Korinther','고린도후서'],'Galatians':['Galater','갈라디아서'],'Romans':['Römer','로마서'],'John':['Johannes','요한복음'],
    '2 Timothy':['2. Timotheus','디모데후서'],'Joshua':['Josua','여호수아'],'Philippians':['Philipper','빌립보서'],'Matthew':['Matthäus','마태복음'],
    'Hebrews':['Hebräer','히브리서'],'Isaiah':['Jesaja','이사야'],'1 Peter':['1. Petrus','베드로전서'],'Ephesians':['Epheser','에베소서'],
    'Titus':['Titus','디도서'],'Revelation':['Offenbarung','요한계시록'],'1 John':['1. Johannes','요한일서'],'1 Corinthians':['1. Korinther','고린도전서'],
    'Lamentations':['Klagelieder','예레미야애가'],'Numbers':['4. Mose','민수기'],'Psalm':['Psalm','시편'],'Luke':['Lukas','누가복음'],'Mark':['Markus','마가복음'],
    'Proverbs':['Sprüche','잠언'],'Acts':['Apostelgeschichte','사도행전'],'Leviticus':['3. Mose','레위기']
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
      'Study plan':'Lernplan','Backup and restore':'Sicherung und Wiederherstellung','Data principles':'Datenprinzipien','Bible version':'Bibelübersetzung','Memorization text':'Text zum Auswendiglernen',
      'Appearance':'Darstellung','Light / dark mode':'Hell / Dunkel','Light':'Hell','Dark':'Dunkel','Accent color':'Akzentfarbe','Reset':'Zurücksetzen','Interface scale':'Oberflächengröße',
      'Daily task target':'Tägliches Aufgabenziel','Target completion date':'Zieldatum','Target retention display':'Ziel-Behaltequote','Default missing-word level':'Standard-Lückentextstufe',
      'Shuffle mature reviews':'Reife Wiederholungen mischen','Streak grace days':'Kulanz-Tage für die Serie','App language':'App-Sprache','Interface language':'App-Sprache',
      'The app language changes menus and instructions. Your Bible version is a separate setting.':'Die App-Sprache ändert Menüs und Anweisungen. Die Bibelübersetzung ist eine separate Einstellung.',
      'English':'Englisch','German':'Deutsch','Korean':'Koreanisch','Black / White':'Schwarz / Weiß','Blue':'Blau','Green':'Grün','Red':'Rot','Purple':'Violett','Brown / Beige':'Braun / Beige','Orange':'Orange','Magenta':'Magenta',
      'Export history CSV':'Verlauf als CSV exportieren','Export progress':'Fortschritt exportieren','Import backup':'Sicherung importieren','Recover snapshot':'Schnappschuss wiederherstellen','Export review CSV':'Wiederholungen als CSV exportieren',
      'Reset progress, keep settings':'Fortschritt zurücksetzen, Einstellungen behalten','Reset everything':'Alles zurücksetzen','Bundled with TMS 60.':'In TMS 60 enthalten.',
      'These actions cannot be undone unless you exported a backup or recover a prior automatic snapshot.':'Diese Aktionen können nur rückgängig gemacht werden, wenn du eine Sicherung exportiert hast oder einen früheren automatischen Schnappschuss wiederherstellst.',
      'Assisted learning never proves long-term mastery.':'Unterstütztes Lernen weist keine langfristige Beherrschung nach.',
      'Wording and book, chapter & verse schedules are independent.':'Wortlaut- und Referenzpläne sind unabhängig voneinander.',
      'Failed scheduled cards enter relearning.':'Fehlgeschlagene geplante Karten gehen in die Wiederlernphase.',
      'Successful early extra practice cannot accelerate intervals.':'Erfolgreiche zusätzliche Frühübungen können Intervalle nicht beschleunigen.',
      'Review history is retained for diagnostics.':'Der Wiederholungsverlauf wird für Diagnosen gespeichert.',
      'Due now':'Jetzt fällig','DUE NOW':'JETZT FÄLLIG','How verse progress works':'So funktioniert der Versfortschritt','Pack progress':'Paketfortschritt','Next seven days':'Nächste sieben Tage',
      'Verses needing attention':'Verse mit Lernbedarf','Recent review history':'Letzte Wiederholungen','Recurring word errors':'Wiederkehrende Wortfehler','Assessment record':'Prüfungsverlauf',
      'No pack assessment completed.':'Noch keine Paketprüfung abgeschlossen.','VERSE':'VERS','Stage':'Stufe','Last':'Zuletzt','Lapses':'Fehler',
      'Complete exact typing, initials, or cloze checks to build a personal error profile.':'Absolviere exaktes Tippen, Anfangsbuchstaben- oder Lückentextprüfungen, um ein persönliches Fehlerprofil aufzubauen.',
      'No reviews recorded yet.':'Noch keine Wiederholungen gespeichert.','No verses currently show weak scores, lapses, or unfinished learning.':'Aktuell zeigen keine Verse schwache Werte, Fehler oder unvollständiges Lernen.',
      'Learning':'Lernen','Maintaining':'Wiederholen','Stable':'Stabil','Unseen':'Ungelernt','unseen':'ungelernt','Established':'Gefestigt','Memorized':'Gelernt','Not established':'Nicht gefestigt','Not learned':'Nicht gelernt',
      'Learning stage':'Lernstufe','Wording interval':'Wortlaut-Intervall','Book, chapter & verse interval':'Referenz-Intervall','Delayed proofs':'Zeitversetzte Nachweise',
      'Study this verse':'Diesen Vers lernen','Type wording':'Wortlaut tippen','Recall book, chapter & verse':'Buch, Kapitel und Vers abrufen','Reset verse':'Vers zurücksetzen',
      'Read & absorb':'Lesen & aufnehmen','Read and notice':'Lesen und beachten','Listen':'Anhören','Queue':'Warteschlange','Keyboard':'Tastatur','Session':'Einheit','Completed':'Erledigt','Remaining':'Verbleibend','Est. time':'Geschätzte Zeit',
      'Ctrl/⌘ + Enter checks answers. Space reveals flashcards. Keys 1–4 select a rating after checking.':'Strg/⌘ + Enter prüft Antworten. Leertaste deckt Karteikarten auf. Die Tasten 1–4 wählen nach der Prüfung eine Bewertung.',
      'Assisted learning advances the acquisition ladder but does not count as long-term mastery.':'Unterstütztes Lernen bringt dich im Lernprozess weiter, zählt aber nicht als langfristige Beherrschung.',
      'Read slowly, notice the structure, and establish the book, chapter & verse before hiding words.':'Lies langsam, beachte die Struktur und verankere Buch, Kapitel und Vers, bevor Wörter ausgeblendet werden.',
      'I read the verse aloud slowly.':'Ich habe den Vers langsam laut gelesen.','I said the book, chapter & verse before and after the verse.':'Ich habe Buch, Kapitel und Vers vor und nach dem Vers genannt.',
      'I looked away and recalled at least the opening phrase.':'Ich habe weggesehen und mindestens den Anfang des Verses abgerufen.',
      'Search all 60 verses and study any one immediately.':'Durchsuche alle 60 Verse und lerne jeden beliebigen sofort.','Search book, chapter & verse or wording':'Buch, Kapitel, Vers oder Wortlaut suchen',
      'Print':'Drucken','Multi-verse practice':'Mehrere Verse üben','All packs':'Alle Pakete','All statuses':'Alle Status',
      'Open any verse immediately. The scheduler recommends reviews, but it never controls what you are allowed to study.':'Öffne jeden Vers sofort. Der Planer empfiehlt Wiederholungen, bestimmt aber nie, was du lernen darfst.',
      'Select a verse and a mode. You can move forward, repeat the same verse, or jump anywhere at any time.':'Wähle einen Vers und einen Lernmodus. Du kannst weitergehen, denselben Vers wiederholen oder jederzeit zu einem anderen Vers springen.',
      'Choose “Recommended learning path” to continue this verse from its current stage, or select any practice mode directly.':'Wähle „Empfohlener Lernweg“, um diesen Vers an seiner aktuellen Stufe fortzusetzen, oder wähle direkt einen Übungsmodus.',
      'See what you are learning now, what you can already recall, and what has become stable over time.':'Sieh, was du gerade lernst, was du bereits abrufen kannst und was langfristig stabil geworden ist.',
      '30-day exact':'30-Tage-Genauigkeit','30-DAY EXACT':'30-TAGE-GENAUIGKEIT','Perfect recalls':'Fehlerfreie Abrufe','PERFECT RECALLS':'FEHLERFREIE ABRUFE',
      'Still moving through guided learning stages':'Noch in den geführten Lernstufen','Wording established; building long-term retention':'Wortlaut gefestigt; langfristige Behaltensleistung wird aufgebaut',
      '21+ day interval and two spaced perfect proofs':'Mindestens 21 Tage Intervall und zwei zeitversetzte perfekte Nachweise',
      'Average unaided wording and book, chapter & verse score':'Durchschnittlicher Wert für Wortlaut und Referenz ohne Hilfe','Share of recent unaided checks scored 100%':'Anteil der letzten Prüfungen ohne Hilfe mit 100 %',
      'Each bar includes learning, maintaining, and stable verses.':'Jeder Balken enthält Verse in den Phasen Lernen, Wiederholen und Stabil.',
      'Adjust workload, appearance, scheduling targets, and local backups.':'Passe Arbeitsumfang, Darstellung, Planungsziele und lokale Sicherungen an.',
      'Progress is stored in this browser. Export a JSON backup before clearing browser data or changing devices.':'Der Fortschritt wird in diesem Browser gespeichert. Exportiere eine JSON-Sicherung, bevor du Browserdaten löschst oder das Gerät wechselst.',
      'Light uses white surfaces. Dark uses a deep background tinted by the selected accent.':'Hell verwendet weiße Flächen. Dunkel verwendet einen tiefen, mit der Akzentfarbe getönten Hintergrund.',
      'Study freely.':'Frei lernen.','Guided sessions remain available for recommendations, but the Study tab and Library always let you open any verse immediately.':'Geführte Einheiten bleiben als Empfehlung verfügbar, aber unter Lernen und in der Bibliothek kannst du jederzeit jeden Vers direkt öffnen.',
      'End active session':'Aktive Einheit beenden','Remaining tasks will be discarded. Completed reviews and progress are already saved.':'Verbleibende Aufgaben werden verworfen. Abgeschlossene Wiederholungen und Fortschritte sind bereits gespeichert.',
      'Cancel':'Abbrechen','End session':'Einheit beenden','Close dialog':'Dialog schließen',
      ' means you have established the exact wording and the app is scheduling reviews to strengthen it. ':' bedeutet, dass der exakte Wortlaut gefestigt ist und die App Wiederholungen zur weiteren Festigung plant. ',
      ' means the wording has survived longer-term spacing: at least a 21-day interval and two perfect scheduled wording recalls separated by roughly a week. Stable is therefore a retention milestone—not the only progress that counts.':' bedeutet, dass der Wortlaut längere Abstände überstanden hat: mindestens ein 21-Tage-Intervall und zwei perfekte geplante Wortlautabrufe mit ungefähr einer Woche Abstand. Stabil ist damit ein Meilenstein der Behaltensleistung – nicht der einzige Fortschritt, der zählt.',
      'Exact-recall progress is separate for each translation. Switching versions never marks the same verse mastered in another wording.':'Der Fortschritt beim exakten Abruf wird für jede Übersetzung getrennt gespeichert. Ein Wechsel übernimmt die Beherrschung nicht auf einen anderen Wortlaut.',
      'After the first successful load, this 60-verse translation dataset is cached in this browser for later use.':'Nach dem ersten erfolgreichen Laden werden diese 60 Verse für die spätere Nutzung in diesem Browser zwischengespeichert.',
      'Korean Revised Version 1952/1961. Public-domain source distributed by GetBible from Wikisource.':'Korean Revised Version 1952/1961. Gemeinfreie Quelle, über GetBible aus Wikisource bereitgestellt.',
      'Loads automatically through the TMS 60 server-side API.Bible integration. No user API key is required.':'Wird automatisch über die serverseitige API.Bible-Integration von TMS 60 geladen. Nutzer benötigen keinen API-Schlüssel.',
      'Mon':'Mo','Tue':'Di','Wed':'Mi','Thu':'Do','Fri':'Fr','Sat':'Sa','Sun':'So','due':'fällig'
    },
    ko:{
      'Today':'오늘','Study':'학습','Library':'구절','Verse library':'전체 60구절','Progress':'진행','Settings':'설정',
      'Private and offline':'개인용 · 오프라인','No account, network request, advertisement, or tracking. Export backups periodically.':'계정, 광고, 추적 없이 사용할 수 있습니다. 진행 상황은 정기적으로 백업하세요.','Saved locally':'기기에 저장됨',
      'Study plan':'학습 계획','Backup and restore':'백업 및 복원','Data principles':'데이터 원칙','Bible version':'성경 번역본','Memorization text':'암송 본문',
      'Appearance':'화면 설정','Light / dark mode':'라이트 / 다크 모드','Light':'라이트','Dark':'다크','Accent color':'강조 색상','Reset':'초기화','Interface scale':'화면 크기',
      'Daily task target':'하루 학습 목표','Target completion date':'목표 완료 날짜','Target retention display':'목표 기억 유지율','Default missing-word level':'기본 빈칸 비율',
      'Shuffle mature reviews':'숙달 구절 복습 순서 섞기','Streak grace days':'연속 학습 유예일','App language':'앱 언어','Interface language':'앱 언어',
      'The app language changes menus and instructions. Your Bible version is a separate setting.':'앱 언어는 메뉴와 안내 문구를 변경합니다. 성경 번역본은 별도로 설정됩니다.',
      'English':'영어','German':'독일어','Korean':'한국어','Black / White':'검정 / 흰색','Blue':'파랑','Green':'초록','Red':'빨강','Purple':'보라','Brown / Beige':'갈색 / 베이지','Orange':'주황','Magenta':'마젠타',
      'Export history CSV':'기록 CSV 내보내기','Export progress':'진행 상황 내보내기','Import backup':'백업 가져오기','Recover snapshot':'자동 백업 복원','Export review CSV':'복습 CSV 내보내기',
      'Reset progress, keep settings':'진행 상황만 초기화','Reset everything':'모두 초기화','Bundled with TMS 60.':'TMS 60에 기본 포함되어 있습니다.',
      'These actions cannot be undone unless you exported a backup or recover a prior automatic snapshot.':'백업을 내보냈거나 이전 자동 백업을 복원할 수 없는 경우 이 작업은 되돌릴 수 없습니다.',
      'Assisted learning never proves long-term mastery.':'도움이 있는 학습은 장기 숙달의 증거로 인정되지 않습니다.',
      'Wording and book, chapter & verse schedules are independent.':'본문 복습과 장절 복습 일정은 서로 독립적입니다.',
      'Failed scheduled cards enter relearning.':'예정된 복습에 실패하면 다시 학습 단계로 들어갑니다.',
      'Successful early extra practice cannot accelerate intervals.':'예정보다 이른 추가 연습에 성공해도 복습 간격은 빨라지지 않습니다.',
      'Review history is retained for diagnostics.':'복습 기록은 학습 상태 분석을 위해 보관됩니다.',
      'Due now':'지금 복습','DUE NOW':'지금 복습','How verse progress works':'구절 진행 방식','Pack progress':'묶음별 진행','Next seven days':'앞으로 7일',
      'Verses needing attention':'집중이 필요한 구절','Recent review history':'최근 복습 기록','Recurring word errors':'반복되는 단어 오류','Assessment record':'점검 기록',
      'No pack assessment completed.':'완료한 묶음 점검이 없습니다.','VERSE':'구절','Stage':'단계','Last':'최근','Lapses':'실패',
      'Complete exact typing, initials, or cloze checks to build a personal error profile.':'정확히 입력하기, 첫 글자 또는 빈칸 채우기 연습을 완료하면 개인 오류 패턴을 확인할 수 있습니다.',
      'No reviews recorded yet.':'아직 기록된 복습이 없습니다.','No verses currently show weak scores, lapses, or unfinished learning.':'현재 낮은 점수, 실패 또는 미완료 학습이 있는 구절이 없습니다.',
      'Learning':'학습 중','Maintaining':'복습 중','Stable':'안정됨','Unseen':'미학습','unseen':'미학습','Established':'암송됨','Memorized':'암송 완료','Not established':'미완료','Not learned':'미학습',
      'Learning stage':'학습 단계','Wording interval':'본문 복습 간격','Book, chapter & verse interval':'장절 복습 간격','Delayed proofs':'지연 확인',
      'Study this verse':'이 구절 학습','Type wording':'본문 입력','Recall book, chapter & verse':'장절 맞히기','Reset verse':'구절 초기화',
      'Read & absorb':'읽고 익히기','Read and notice':'읽고 구조 파악','Listen':'듣기','Queue':'대기 목록','Keyboard':'키보드','Session':'학습','Completed':'완료','Remaining':'남음','Est. time':'예상 시간',
      'Ctrl/⌘ + Enter checks answers. Space reveals flashcards. Keys 1–4 select a rating after checking.':'Ctrl/⌘ + Enter로 답을 확인합니다. 스페이스바로 플래시카드를 공개합니다. 확인 후 1–4 키로 평가를 선택합니다.',
      'Assisted learning advances the acquisition ladder but does not count as long-term mastery.':'도움을 받는 학습은 학습 단계를 진행시키지만 장기 숙달로 인정되지는 않습니다.',
      'Read slowly, notice the structure, and establish the book, chapter & verse before hiding words.':'천천히 읽으며 구조를 파악하고 단어를 가리기 전에 성경 책과 장절을 확실히 익히세요.',
      'I read the verse aloud slowly.':'구절을 천천히 소리 내어 읽었습니다.','I said the book, chapter & verse before and after the verse.':'구절 전후에 성경 책과 장절을 말했습니다.',
      'I looked away and recalled at least the opening phrase.':'본문을 보지 않고 최소한 첫 구절 부분을 떠올렸습니다.',
      'Search all 60 verses and study any one immediately.':'60구절을 검색하고 원하는 구절을 바로 학습할 수 있습니다.','Search book, chapter & verse or wording':'성경 책, 장·절 또는 본문 검색',
      'Print':'인쇄','Multi-verse practice':'여러 구절 연습','All packs':'전체 묶음','All statuses':'전체 상태',
      'Open any verse immediately. The scheduler recommends reviews, but it never controls what you are allowed to study.':'원하는 구절을 즉시 열 수 있습니다. 복습 일정은 추천만 하며 학습할 수 있는 구절을 제한하지 않습니다.',
      'Select a verse and a mode. You can move forward, repeat the same verse, or jump anywhere at any time.':'구절과 학습 방식을 선택하세요. 다음 구절로 넘어가거나 같은 구절을 반복하거나 언제든 원하는 구절로 이동할 수 있습니다.',
      'Choose “Recommended learning path” to continue this verse from its current stage, or select any practice mode directly.':'“추천 학습 과정”을 선택하면 현재 단계부터 이어서 학습할 수 있으며 원하는 연습 방식을 직접 선택할 수도 있습니다.',
      'See what you are learning now, what you can already recall, and what has become stable over time.':'현재 학습 중인 구절, 이미 암송할 수 있는 구절, 장기적으로 안정된 구절을 확인하세요.',
      '30-day exact':'30일 정확도','30-DAY EXACT':'30일 정확도','Perfect recalls':'완벽 회상','PERFECT RECALLS':'완벽 회상',
      'Still moving through guided learning stages':'추천 학습 단계를 진행 중','Wording established; building long-term retention':'본문 암송 완료 · 장기 기억을 강화하는 중',
      '21+ day interval and two spaced perfect proofs':'21일 이상 간격과 두 번의 완벽한 지연 확인',
      'Average unaided wording and book, chapter & verse score':'도움 없이 수행한 본문 및 장절 평균 점수','Share of recent unaided checks scored 100%':'최근 도움 없는 확인에서 100%를 기록한 비율',
      'Each bar includes learning, maintaining, and stable verses.':'각 막대에는 학습 중, 복습 중, 안정된 구절이 함께 표시됩니다.',
      'Adjust workload, appearance, scheduling targets, and local backups.':'학습량, 화면 설정, 일정 목표, 로컬 백업을 조정하세요.',
      'Progress is stored in this browser. Export a JSON backup before clearing browser data or changing devices.':'진행 상황은 이 브라우저에 저장됩니다. 브라우저 데이터를 삭제하거나 기기를 바꾸기 전에 JSON 백업을 내보내세요.',
      'Light uses white surfaces. Dark uses a deep background tinted by the selected accent.':'라이트 모드는 밝은 화면을, 다크 모드는 선택한 강조 색상이 반영된 어두운 화면을 사용합니다.',
      'Study freely.':'자유롭게 학습하세요.','Guided sessions remain available for recommendations, but the Study tab and Library always let you open any verse immediately.':'추천 학습은 계속 사용할 수 있지만 학습 탭과 전체 구절에서는 언제든 원하는 구절을 바로 열 수 있습니다.',
      'End active session':'현재 학습 종료','Remaining tasks will be discarded. Completed reviews and progress are already saved.':'남은 과제는 삭제됩니다. 완료한 복습과 진행 상황은 이미 저장되었습니다.',
      'Cancel':'취소','End session':'학습 종료','Close dialog':'대화 상자 닫기',
      ' means you have established the exact wording and the app is scheduling reviews to strengthen it. ':'은 정확한 본문을 암송했으며 앱이 기억을 강화하기 위한 복습 일정을 제공하는 상태입니다. ',
      ' means the wording has survived longer-term spacing: at least a 21-day interval and two perfect scheduled wording recalls separated by roughly a week. Stable is therefore a retention milestone—not the only progress that counts.':'은 본문이 장기 간격 복습을 통과한 상태입니다. 최소 21일의 복습 간격과 약 일주일 이상 떨어진 두 번의 완벽한 예정 복습을 충족해야 합니다. 따라서 안정됨은 장기 기억의 한 기준이며 유일한 진행 기준은 아닙니다.',
      'Exact-recall progress is separate for each translation. Switching versions never marks the same verse mastered in another wording.':'정확 암송 진행 상황은 번역본마다 따로 저장됩니다. 번역본을 바꿔도 다른 번역의 같은 구절이 자동으로 숙달 처리되지 않습니다.',
      'After the first successful load, this 60-verse translation dataset is cached in this browser for later use.':'처음 정상적으로 불러온 뒤에는 이 60구절 번역 데이터가 브라우저에 저장되어 나중에도 사용할 수 있습니다.',
      'Korean Revised Version 1952/1961. Public-domain source distributed by GetBible from Wikisource.':'개역한글 1952/1961. 위키문헌의 퍼블릭 도메인 자료를 GetBible을 통해 제공합니다.',
      'Loads automatically through the TMS 60 server-side API.Bible integration. No user API key is required.':'TMS 60 서버의 API.Bible 연동을 통해 자동으로 불러옵니다. 사용자가 API 키를 입력할 필요가 없습니다.',
      'Mon':'월','Tue':'화','Wed':'수','Thu':'목','Fri':'금','Sat':'토','Sun':'일','due':'복습'
    }
  };

  const REVERSE=new Map();
  for(const lang of ['de','ko'])for(const [en,val] of Object.entries(D[lang]))if(!REVERSE.has(val))REVERSE.set(val,en);
  const PACK_REVERSE=new Map();
  for(const [en,names] of Object.entries(PACKS)){PACK_REVERSE.set(en,en);PACK_REVERSE.set(names[0],en);PACK_REVERSE.set(names[1],en)}

  function canonicalBookReference(text){
    let out=String(text);
    for(const [en,names] of Object.entries(BOOKS).sort((a,b)=>b[0].length-a[0].length)){
      for(const name of names){
        const esc=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        out=out.replace(new RegExp('(^|\\b)'+esc+'(?=\\s+\\d+:\\d)','g'),(_,p)=>p+en);
      }
    }
    return out;
  }
  function localizeReference(text,lang){
    let out=canonicalBookReference(text);
    if(lang==='en')return out;
    for(const [en,names] of Object.entries(BOOKS).sort((a,b)=>b[0].length-a[0].length)){
      const esc=en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      out=out.replace(new RegExp('(^|\\b)'+esc+'(?=\\s+\\d+:\\d)','g'),(_,p)=>p+names[lang==='de'?0:1]);
    }
    return out;
  }
  function translateExact(core,lang){
    let en=core;
    if(REVERSE.has(core))en=REVERSE.get(core);
    if(Object.prototype.hasOwnProperty.call(D.de,en)||Object.prototype.hasOwnProperty.call(D.ko,en)){
      return lang==='en'?en:(D[lang]?.[en]??en);
    }
    return null;
  }
  function statusEnglish(value){
    const x=String(value).trim();
    const map={
      'Unseen':'Unseen','unseen':'Unseen','Ungelernt':'Unseen','ungelernt':'Unseen','미학습':'Unseen',
      'Learning':'Learning','Lernen':'Learning','학습 중':'Learning',
      'Maintaining':'Maintaining','Wiederholen':'Maintaining','복습 중':'Maintaining',
      'Stable':'Stable','Stabil':'Stable','안정됨':'Stable',
      'Established':'Established','Gefestigt':'Established','암송됨':'Established'
    };
    return map[x]||null;
  }
  function packEnglish(value){return PACK_REVERSE.get(String(value).trim())||String(value).trim()}

  function tr(raw,lang){
    const s=String(raw??'');if(!s.trim())return s;
    const lead=s.match(/^\s*/)?.[0]||'',trail=s.match(/\s*$/)?.[0]||'',core=s.slice(lead.length,s.length-trail.length);

    const exact=translateExact(core,lang);if(exact!==null)return lead+exact+trail;

    let m;
    if((m=core.match(/^([✓✔])\s*(.+)$/))){const body=tr(m[2],lang).trim();return lead+m[1]+' '+body+trail}

    if((m=core.match(/^(?:Pack|Paket|묶음)\s+([A-E])\s*[·:]\s*(.+)$/))){
      const enName=packEnglish(m[2]),names=PACKS[enName];
      const label=lang==='de'?'Paket':lang==='ko'?'묶음':'Pack';
      return lead+label+' '+m[1]+' · '+(lang==='en'?enName:(names?names[lang==='de'?0:1]:m[2]))+trail;
    }
    if((m=core.match(/^(?:Pack|Paket|묶음)\s+([A-E])$/))){
      const label=lang==='de'?'Paket':lang==='ko'?'묶음':'Pack';return lead+label+' '+m[1]+trail;
    }

    if((m=core.match(/^(\d+)\.\s+(.+\d+:\d+(?:-\d+)?)$/)))return lead+m[1]+'. '+localizeReference(m[2],lang)+trail;

    const ref=localizeReference(core,lang);if(ref!==core)return lead+ref+trail;

    if((m=core.match(/^(.+?)\s*·\s*(.+\d+:\d+(?:-\d+)?)$/))){
      const st=statusEnglish(m[1]);
      if(st){const status=lang==='en'?st:(D[lang]?.[st]||st);return lead+status+' · '+localizeReference(m[2],lang)+trail}
    }

    if((m=core.match(/^Review what is due, then continue the verse you are learning\. Approximately (\d+) minutes?\.$/))){
      if(lang==='de')return lead+`Wiederhole zuerst das Fällige und lerne danach deinen aktuellen Vers weiter. Ungefähr ${m[1]} ${m[1]==='1'?'Minute':'Minuten'}.`+trail;
      if(lang==='ko')return lead+`먼저 복습할 내용을 완료한 뒤 현재 학습 중인 구절을 이어서 학습하세요. 약 ${m[1]}분.`+trail;
      return s;
    }
    if((m=core.match(/^Interface scale:\s*(\d+)%$/)))return lead+(lang==='de'?`Oberflächengröße: ${m[1]} %`:lang==='ko'?`화면 크기: ${m[1]}%`:`Interface scale: ${m[1]}%`)+trail;
    if((m=core.match(/^Recover snapshot \((\d+)\)$/)))return lead+(lang==='de'?`Schnappschuss wiederherstellen (${m[1]})`:lang==='ko'?`자동 백업 복원 (${m[1]})`:`Recover snapshot (${m[1]})`)+trail;
    if((m=core.match(/^(\d+) verses?$/)))return lead+(lang==='de'?`${m[1]} ${m[1]==='1'?'Vers':'Verse'}`:lang==='ko'?`${m[1]}구절`:`${m[1]} ${m[1]==='1'?'verse':'verses'}`)+trail;
    if((m=core.match(/^Verse (\d+) of 60$/)))return lead+(lang==='de'?`Vers ${m[1]} von 60`:lang==='ko'?`60구절 중 ${m[1]}번`:`Verse ${m[1]} of 60`)+trail;
    if((m=core.match(/^Oral self-checks:\s*(\d+)\/(\d+) passed$/)))return lead+(lang==='de'?`Mündliche Selbstkontrollen: ${m[1]}/${m[2]} bestanden`:lang==='ko'?`구두 자가 점검: ${m[1]}/${m[2]} 통과`:`Oral self-checks: ${m[1]}/${m[2]} passed`)+trail;
    if((m=core.match(/^(\d+)% hidden$/)))return lead+(lang==='de'?`${m[1]} % ausgeblendet`:lang==='ko'?`${m[1]}% 가림`:`${m[1]}% hidden`)+trail;
    if((m=core.match(/^(\d+) focused tasks?$/)))return lead+(lang==='de'?`${m[1]} fokussierte ${m[1]==='1'?'Aufgabe':'Aufgaben'}`:lang==='ko'?`집중 과제 ${m[1]}개`:`${m[1]} focused ${m[1]==='1'?'task':'tasks'}`)+trail;
    if((m=core.match(/^(\d+) wording · (\d+) (?:reference|book, chapter & verse)$/)))return lead+(lang==='de'?`${m[1]} Wortlaut · ${m[2]} Referenz`:lang==='ko'?`본문 ${m[1]} · 장절 ${m[2]}`:`${m[1]} wording · ${m[2]} reference`)+trail;
    if((m=core.match(/^(\d+) learning · (\d+) maintaining · (\d+) stable$/)))return lead+(lang==='de'?`${m[1]} Lernen · ${m[2]} Wiederholen · ${m[3]} stabil`:lang==='ko'?`학습 중 ${m[1]} · 복습 중 ${m[2]} · 안정됨 ${m[3]}`:`${m[1]} learning · ${m[2]} maintaining · ${m[3]} stable`)+trail;
    if((m=core.match(/^Schema (\d+) · (\d+) review events · Last saved (.+)$/)))return lead+(lang==='de'?`Schema ${m[1]} · ${m[2]} Wiederholungsereignisse · Zuletzt gespeichert ${m[3]}`:lang==='ko'?`스키마 ${m[1]} · 복습 기록 ${m[2]}개 · 마지막 저장 ${m[3]}`:core)+trail;
    if((m=core.match(/^[☆★]\s*(Starred|Star)$/)))return lead+core[0]+' '+(lang==='de'?(m[1]==='Starred'?'Markiert':'Markieren'):lang==='ko'?(m[1]==='Starred'?'즐겨찾기됨':'즐겨찾기'):m[1])+trail;

    return s;
  }

  function shouldSkip(node){
    const p=node.parentElement;
    return !p||!!p.closest('script,style,#translation-copyright,.verse-text,.quote-mini,.diff,.char-text,.initials-prompt,.cloze-line');
  }
  function translateTextNode(node,lang){
    if(shouldSkip(node))return;
    const next=tr(node.nodeValue,lang);if(node.nodeValue!==next)node.nodeValue=next;
  }
  function translateAttributes(el,lang){
    for(const attr of ['placeholder','aria-label','title']){
      if(!el.hasAttribute?.(attr))continue;
      const value=el.getAttribute(attr),next=tr(value,lang);if(value!==next)el.setAttribute(attr,next);
    }
  }
  function translateElement(root,lang){
    if(!root)return;
    if(root.nodeType===Node.TEXT_NODE){translateTextNode(root,lang);return}
    if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
    if(root.nodeType===Node.ELEMENT_NODE)translateAttributes(root,lang);
    const doc=root.ownerDocument||root,walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode()))translateTextNode(n,lang);
    root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el=>translateAttributes(el,lang));
  }
  function translateDocument(doc){
    if(!doc?.body)return;
    const lang=currentLang();doc.documentElement.lang=lang;translateElement(doc.body,lang);
  }

  function languageCardHtml(lang){
    return `<h2>App language</h2><div class="field"><label for="ui-language-select">Interface language</label><select id="ui-language-select"><option value="en" ${lang==='en'?'selected':''}>English</option><option value="de" ${lang==='de'?'selected':''}>Deutsch</option><option value="ko" ${lang==='ko'?'selected':''}>한국어</option></select><div class="help">The app language changes menus and instructions. Your Bible version is a separate setting.</div></div>`;
  }
  function ensureLanguageSettings(doc){
    const root=doc?.getElementById?.('view-settings');if(!root)return;
    let card=root.querySelector('[data-ui-language-settings]');
    const firstStack=root.querySelector('.settings-grid .stack');if(!firstStack)return;
    if(!card){
      card=doc.createElement('article');card.className='card flat';card.dataset.uiLanguageSettings='1';card.innerHTML=languageCardHtml(currentLang());
      firstStack.insertBefore(card,firstStack.children[1]||null);
    }
    const select=card.querySelector('#ui-language-select');if(select&&select.value!==currentLang())select.value=currentLang();
    translateElement(card,currentLang());
  }

  function scheduleRefresh(doc){
    if(refreshRaf)return;
    refreshRaf=requestAnimationFrame(()=>{refreshRaf=0;ensureLanguageSettings(doc);translateDocument(doc);translateParent()});
  }

  function observeDocument(doc){
    if(frameObserver)frameObserver.disconnect();
    frameDocument=doc;
    ensureLanguageSettings(doc);
    translateDocument(doc);
    frameObserver=new MutationObserver(records=>{
      const lang=currentLang();let needsEnsure=false;
      for(const record of records){
        if(record.type==='characterData')translateTextNode(record.target,lang);
        else if(record.type==='attributes')translateAttributes(record.target,lang);
        else for(const node of record.addedNodes){translateElement(node,lang);needsEnsure=true}
      }
      if(needsEnsure)requestAnimationFrame(()=>ensureLanguageSettings(doc));
    });
    frameObserver.observe(doc.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});

    doc.addEventListener('change',event=>{
      if(event.target?.id!=='ui-language-select')return;
      const lang=event.target.value;if(!SUPPORTED.has(lang))return;
      setLang(lang);
      requestAnimationFrame(()=>scheduleRefresh(doc));
    },true);
  }

  function attachFrame(){
    const frame=document.getElementById('app-frame');if(!frame)return;
    const attach=()=>{
      const doc=frame.contentDocument;if(!doc?.body){setTimeout(attach,100);return}
      if(frameDocument===doc)return;
      observeDocument(doc);
    };
    frame.addEventListener('load',()=>{frameDocument=null;setTimeout(attach,0)});
    attach();
  }

  function translateParent(){if(document.body)translateElement(document.body,currentLang())}
  function observeParent(){
    translateParent();
    if(parentObserver)parentObserver.disconnect();
    parentObserver=new MutationObserver(records=>{
      const lang=currentLang();
      for(const record of records){
        if(record.type==='characterData')translateTextNode(record.target,lang);
        else if(record.type==='attributes')translateAttributes(record.target,lang);
        else for(const node of record.addedNodes)translateElement(node,lang);
      }
    });
    parentObserver.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{observeParent();attachFrame()},{once:true});
  }else{
    observeParent();attachFrame();
  }
})();