/* TMS 60 parent-side incremental localization runtime.
   Completes dynamic DE/KO UI without rescanning the whole iframe on every mutation. */
'use strict';
(() => {
  if (window.top !== window || window.__TMS_LOCALIZATION_RUNTIME__) return;
  window.__TMS_LOCALIZATION_RUNTIME__ = true;

  const KEY = 'tms60-ui-language-v1';
  const SUPPORTED = new Set(['en','de','ko']);
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();
  let observedDocument = null;
  let observer = null;

  function currentLang() {
    try { const x = localStorage.getItem(KEY); if (SUPPORTED.has(x)) return x; } catch (_) {}
    const x = String(navigator.language || '').toLowerCase();
    return x.startsWith('de') ? 'de' : x.startsWith('ko') ? 'ko' : 'en';
  }

  const BOOKS = {
    '2 Corinthians':['2. Korinther','고린도후서'],'Galatians':['Galater','갈라디아서'],'Romans':['Römer','로마서'],'John':['Johannes','요한복음'],'2 Timothy':['2. Timotheus','디모데후서'],'Joshua':['Josua','여호수아'],'Philippians':['Philipper','빌립보서'],'Matthew':['Matthäus','마태복음'],'Hebrews':['Hebräer','히브리서'],'Isaiah':['Jesaja','이사야'],'1 Peter':['1. Petrus','베드로전서'],'Ephesians':['Epheser','에베소서'],'Titus':['Titus','디도서'],'Revelation':['Offenbarung','요한계시록'],'1 John':['1. Johannes','요한일서'],'1 Corinthians':['1. Korinther','고린도전서'],'Lamentations':['Klagelieder','예레미야애가'],'Numbers':['4. Mose','민수기'],'Psalm':['Psalm','시편'],'Luke':['Lukas','누가복음'],'Mark':['Markus','마가복음'],'Proverbs':['Sprüche','잠언'],'Acts':['Apostelgeschichte','사도행전'],'Leviticus':['3. Mose','레위기']
  };
  const PACKS = {
    'Living the New Life':['Das neue Leben leben','새 생명 안에서 살기'],
    'Proclaiming Christ':['Christus verkündigen','그리스도를 전파하기'],
    'Reliance on God’s Resources':['Aus Gottes Kraft leben','하나님의 자원을 의지하기'],
    "Reliance on God's Resources":['Aus Gottes Kraft leben','하나님의 자원을 의지하기'],
    'Being Christ’s Disciple':['Als Jünger Christi leben','그리스도의 제자로 살기'],
    "Being Christ's Disciple":['Als Jünger Christi leben','그리스도의 제자로 살기'],
    'Growth in Christlikeness':['Christus ähnlicher werden','그리스도를 닮아가기']
  };

  const D = {
    de: {
      'Private and offline':'Privat und offline','No account, network request, advertisement, or tracking. Export backups periodically.':'Kein Konto, keine Werbung und kein Tracking. Exportiere regelmäßig Sicherungen.','Saved locally':'Lokal gespeichert','Open navigation':'Navigation öffnen','Close navigation':'Navigation schließen','Switch color mode':'Farbmodus wechseln','Select progress backup JSON file':'JSON-Sicherungsdatei auswählen',
      'Open any verse immediately. The scheduler recommends reviews, but it never controls what you are allowed to study.':'Öffne jeden Vers sofort. Der Planer empfiehlt Wiederholungen, bestimmt aber nie, was du lernen darfst.','Select a verse and a mode. You can move forward, repeat the same verse, or jump anywhere at any time.':'Wähle einen Vers und einen Lernmodus. Du kannst weitergehen, denselben Vers wiederholen oder jederzeit zu einem anderen Vers springen.','Choose “Recommended learning path” to continue this verse from its current stage, or select any practice mode directly.':'Wähle „Empfohlener Lernweg“, um diesen Vers an seiner aktuellen Stufe fortzusetzen, oder wähle direkt einen Übungsmodus.','Previous verse':'Vorheriger Vers','Next verse':'Nächster Vers',
      'Search verses':'Verse durchsuchen','Filter by pack':'Nach Paket filtern','Filter by status':'Nach Status filtern','Search book, chapter & verse or wording':'Buch, Kapitel, Vers oder Wortlaut suchen','No verses match these filters.':'Keine Verse entsprechen diesen Filtern.','Oral self-checks':'Mündliche Selbstkontrollen','Star':'Markieren','Unstar':'Markierung entfernen',
      'See what you are learning now, what you can already recall, and what has become stable over time.':'Sieh, was du gerade lernst, was du bereits abrufen kannst und was langfristig stabil geworden ist.','Export history CSV':'Verlauf als CSV exportieren','30-day exact':'30-Tage-Genauigkeit','30-DAY EXACT':'30-TAGE-GENAUIGKEIT','Perfect recalls':'Fehlerfreie Abrufe','PERFECT RECALLS':'FEHLERFREIE ABRUFE','Still moving through guided learning stages':'Noch in den geführten Lernstufen','Wording established; building long-term retention':'Wortlaut gefestigt; langfristige Behaltensleistung wird aufgebaut','21+ day interval and two spaced perfect proofs':'Mindestens 21 Tage Intervall und zwei zeitversetzte perfekte Nachweise','Average unaided wording and book, chapter & verse score':'Durchschnittlicher Wert für Wortlaut und Referenz ohne Hilfe','Share of recent unaided checks scored 100%':'Anteil der letzten Prüfungen ohne Hilfe mit 100 %','Verse progress stages':'Fortschrittsstufen eines Verses','Each bar includes learning, maintaining, and stable verses.':'Jeder Balken enthält Verse in den Phasen Lernen, Wiederholen und Stabil.','Pack progress legend':'Legende zum Paketfortschritt','Stage':'Stufe','Last':'Zuletzt','Lapses':'Fehler','No verses currently show weak scores, lapses, or unfinished learning.':'Aktuell zeigen keine Verse schwache Werte, Fehler oder unvollständiges Lernen.','Assisted':'Mit Hilfe','Unaided':'Ohne Hilfe','No reviews recorded yet.':'Noch keine Wiederholungen gespeichert.','Recurring word errors':'Wiederkehrende Wortfehler','Word':'Wort','Errors':'Fehler','Rate':'Quote','Assessment record':'Prüfungsverlauf','No pack assessment completed.':'Noch keine Paketprüfung abgeschlossen.',
      'means you have established the exact wording and the app is scheduling reviews to strengthen it.':'bedeutet, dass der exakte Wortlaut gefestigt ist und die App Wiederholungen zur weiteren Festigung plant.','means the wording has survived longer-term spacing: at least a 21-day interval and two perfect scheduled wording recalls separated by roughly a week. Stable is therefore a retention milestone—not the only progress that counts.':'bedeutet, dass der Wortlaut längere Abstände überstanden hat: mindestens ein 21-Tage-Intervall und zwei perfekte geplante Wortlautabrufe mit ungefähr einer Woche Abstand. Stabil ist damit ein Meilenstein der Behaltensleistung – nicht der einzige Fortschritt, der zählt.',
      'Adjust workload, appearance, scheduling targets, and local backups.':'Passe Arbeitsumfang, Darstellung, Planungsziele und lokale Sicherungen an.','Daily task target':'Tägliches Aufgabenziel','Due work is never hidden merely because it exceeds this target.':'Fällige Aufgaben werden nie ausgeblendet, nur weil sie dieses Ziel überschreiten.','Target completion date':'Zieldatum','Target retention display':'Ziel-Behaltequote','Default missing-word level':'Standard-Lückentextstufe','Shuffle mature reviews':'Reife Wiederholungen mischen','Removes canonical-order cues.':'Entfernt Hinweise durch die kanonische Reihenfolge.','Streak grace days':'Kulanz-Tage für die Serie','Higher targets shorten mature review intervals; the scheduler remains deterministic and offline.':'Höhere Ziele verkürzen die Intervalle reifer Wiederholungen; der Planer bleibt deterministisch und offline.','Study freely.':'Frei lernen.','Guided sessions remain available for recommendations, but the Study tab and Library always let you open any verse immediately.':'Geführte Einheiten bleiben als Empfehlung verfügbar, aber unter Lernen und in der Bibliothek kannst du jederzeit jeden Vers direkt öffnen.',
      'Progress is stored in this browser. Export a JSON backup before clearing browser data or changing devices.':'Der Fortschritt wird in diesem Browser gespeichert. Exportiere eine JSON-Sicherung, bevor du Browserdaten löschst oder das Gerät wechselst.','Export progress':'Fortschritt exportieren','Import backup':'Sicherung importieren','Recover snapshot':'Schnappschuss wiederherstellen','Export review CSV':'Wiederholungen als CSV exportieren','These actions cannot be undone unless you exported a backup or recover a prior automatic snapshot.':'Diese Aktionen können nur rückgängig gemacht werden, wenn du eine Sicherung exportiert hast oder einen früheren automatischen Schnappschuss wiederherstellst.','Reset progress, keep settings':'Fortschritt zurücksetzen, Einstellungen behalten','Reset everything':'Alles zurücksetzen','Assisted learning never proves long-term mastery.':'Unterstütztes Lernen weist keine langfristige Beherrschung nach.','Wording and book, chapter & verse schedules are independent.':'Wortlaut- und Referenzpläne sind unabhängig voneinander.','Failed scheduled cards enter relearning.':'Fehlgeschlagene geplante Karten gehen in die Wiederlernphase.','Successful early extra practice cannot accelerate intervals.':'Erfolgreiche zusätzliche Frühübungen können Intervalle nicht beschleunigen.','Review history is retained for diagnostics.':'Der Wiederholungsverlauf wird für Diagnosen gespeichert.',
      'Light uses white surfaces. Dark uses a deep background tinted by the selected accent.':'Hell verwendet weiße Flächen. Dunkel verwendet einen tiefen, mit der Akzentfarbe getönten Hintergrund.','Interface scale':'Oberflächengröße','The app language changes menus and instructions. Your Bible version is a separate setting.':'Die App-Sprache ändert Menüs und Anweisungen. Die Bibelübersetzung ist eine separate Einstellung.','Exact-recall progress is separate for each translation. Switching versions never marks the same verse mastered in another wording.':'Der Fortschritt für exakten Abruf wird je Übersetzung getrennt gespeichert. Ein Übersetzungswechsel übernimmt keine Beherrschung auf einen anderen Wortlaut.','After the first successful load, this 60-verse translation dataset is cached in this browser for later use.':'Nach dem ersten erfolgreichen Laden werden diese 60 Verse für die spätere Nutzung in diesem Browser zwischengespeichert.',
      'Read slowly, notice the structure, and establish the book, chapter & verse before hiding words.':'Lies langsam, beachte die Struktur und verankere Buch, Kapitel und Vers, bevor Wörter ausgeblendet werden.','I read the verse aloud slowly.':'Ich habe den Vers langsam laut gelesen.','I said the book, chapter & verse before and after the verse.':'Ich habe Buch, Kapitel und Vers vor und nach dem Vers genannt.','I looked away and recalled at least the opening phrase.':'Ich habe weggesehen und mindestens den Anfang des Verses abgerufen.','Browser audio is unavailable; read the verse aloud manually.':'Browser-Audio ist nicht verfügbar; lies den Vers selbst laut.','Recall the verse in your head or say it aloud, then reveal it.':'Rufe den Vers im Kopf ab oder sage ihn laut und zeige ihn danach an.','Recite the complete verse before revealing it.':'Sage den vollständigen Vers auf, bevor du ihn anzeigst.','Type the verse from memory. Exact wording is assessed.':'Tippe den Vers aus dem Gedächtnis. Der genaue Wortlaut wird bewertet.','Expand every initial into the exact verse.':'Ergänze jeden Anfangsbuchstaben zum exakten Vers.','Recall the next phrase before revealing it.':'Rufe den nächsten Satzteil ab, bevor du ihn aufdeckst.','Hidden phrase':'Verdeckter Satzteil','Reveal next phrase':'Nächsten Satzteil zeigen','Complete verse revealed':'Vollständiger Vers angezeigt','Voice':'Stimme','Speech rate':'Sprechtempo','Play':'Abspielen','Pause / resume':'Pause / fortsetzen','Stop':'Stopp','Speech synthesis is unavailable in this browser. Read the verse aloud slowly and repeat it manually.':'Sprachausgabe ist in diesem Browser nicht verfügbar. Lies den Vers langsam laut und wiederhole ihn selbst.','Listen, pause, and repeat each clause aloud.':'Höre zu, pausiere und wiederhole jeden Satzteil laut.','Read and repeat each clause aloud.':'Lies jeden Satzteil laut und wiederhole ihn.','I listened and repeated':'Ich habe zugehört und wiederholt','I read and repeated':'Ich habe gelesen und wiederholt',
      'Expected':'Erwartet','You typed':'Deine Eingabe','Difference':'Unterschied','Differences':'Unterschiede','All words are correct. Punctuation differences are shown below for reference and do not reduce your score.':'Alle Wörter sind korrekt. Unterschiede bei der Zeichensetzung werden nur zur Orientierung gezeigt und senken die Punktzahl nicht.','All words are correct. Check the highlighted capitalization or punctuation difference below.':'Alle Wörter sind korrekt. Prüfe den markierten Unterschied bei Groß-/Kleinschreibung oder Zeichensetzung.','Mon':'Mo','Tue':'Di','Wed':'Mi','Thu':'Do','Fri':'Fr','Sat':'Sa','Sun':'So','due':'fällig'
    },
    ko: {
      'Private and offline':'개인용 · 오프라인','No account, network request, advertisement, or tracking. Export backups periodically.':'계정, 광고, 추적 없이 사용할 수 있습니다. 진행 상황은 정기적으로 백업하세요.','Saved locally':'기기에 저장됨','Open navigation':'메뉴 열기','Close navigation':'메뉴 닫기','Switch color mode':'화면 모드 전환','Select progress backup JSON file':'진행 상황 백업 JSON 파일 선택',
      'Open any verse immediately. The scheduler recommends reviews, but it never controls what you are allowed to study.':'원하는 구절을 즉시 열 수 있습니다. 복습 일정은 추천만 하며 학습할 수 있는 구절을 제한하지 않습니다.','Select a verse and a mode. You can move forward, repeat the same verse, or jump anywhere at any time.':'구절과 학습 방식을 선택하세요. 다음 구절로 넘어가거나 같은 구절을 반복하거나 언제든 원하는 구절로 이동할 수 있습니다.','Choose “Recommended learning path” to continue this verse from its current stage, or select any practice mode directly.':'“추천 학습 과정”을 선택하면 현재 단계부터 이어서 학습할 수 있으며 원하는 연습 방식을 직접 선택할 수도 있습니다.','Previous verse':'이전 구절','Next verse':'다음 구절',
      'Search verses':'구절 검색','Filter by pack':'묶음별 필터','Filter by status':'상태별 필터','Search book, chapter & verse or wording':'성경 책, 장·절 또는 본문 검색','No verses match these filters.':'조건에 맞는 구절이 없습니다.','Oral self-checks':'구두 자가 점검','Star':'즐겨찾기','Unstar':'즐겨찾기 해제',
      'See what you are learning now, what you can already recall, and what has become stable over time.':'현재 학습 중인 구절, 이미 암송할 수 있는 구절, 장기적으로 안정된 구절을 확인하세요.','Export history CSV':'기록 CSV 내보내기','30-day exact':'30일 정확도','30-DAY EXACT':'30일 정확도','Perfect recalls':'완벽 회상','PERFECT RECALLS':'완벽 회상','Still moving through guided learning stages':'추천 학습 단계를 진행 중','Wording established; building long-term retention':'본문 암송 완료 · 장기 기억을 강화하는 중','21+ day interval and two spaced perfect proofs':'21일 이상 간격과 두 번의 완벽한 지연 확인','Average unaided wording and book, chapter & verse score':'도움 없이 수행한 본문 및 장절 평균 점수','Share of recent unaided checks scored 100%':'최근 도움 없는 확인에서 100%를 기록한 비율','Verse progress stages':'구절 진행 단계','Each bar includes learning, maintaining, and stable verses.':'각 막대에는 학습 중, 복습 중, 안정된 구절이 함께 표시됩니다.','Pack progress legend':'묶음 진행 범례','Stage':'단계','Last':'최근','Lapses':'실패','No verses currently show weak scores, lapses, or unfinished learning.':'현재 낮은 점수, 실패 또는 미완료 학습이 있는 구절이 없습니다.','Assisted':'도움 있음','Unaided':'도움 없음','No reviews recorded yet.':'아직 기록된 복습이 없습니다.','Recurring word errors':'반복되는 단어 오류','Word':'단어','Errors':'오류','Rate':'비율','Assessment record':'점검 기록','No pack assessment completed.':'완료한 묶음 점검이 없습니다.',
      'means you have established the exact wording and the app is scheduling reviews to strengthen it.':'은 정확한 본문을 암송했으며 앱이 기억을 강화하기 위한 복습 일정을 제공하는 상태입니다.','means the wording has survived longer-term spacing: at least a 21-day interval and two perfect scheduled wording recalls separated by roughly a week. Stable is therefore a retention milestone—not the only progress that counts.':'은 본문이 장기 간격 복습을 통과한 상태입니다. 최소 21일의 복습 간격과 약 일주일 이상 떨어진 두 번의 완벽한 예정 복습을 충족해야 합니다. 따라서 안정됨은 장기 기억의 한 기준이며 유일한 진행 기준은 아닙니다.',
      'Adjust workload, appearance, scheduling targets, and local backups.':'학습량, 화면 설정, 일정 목표, 로컬 백업을 조정하세요.','Daily task target':'하루 학습 목표','Due work is never hidden merely because it exceeds this target.':'복습할 항목이 목표 수를 넘더라도 숨겨지지 않습니다.','Target completion date':'목표 완료 날짜','Target retention display':'목표 기억 유지율','Default missing-word level':'기본 빈칸 비율','Shuffle mature reviews':'숙달 구절 복습 순서 섞기','Removes canonical-order cues.':'정해진 순서로 인한 힌트를 제거합니다.','Streak grace days':'연속 학습 유예일','Higher targets shorten mature review intervals; the scheduler remains deterministic and offline.':'목표 유지율이 높을수록 숙달 구절의 복습 간격이 짧아집니다. 일정 계산은 오프라인에서 동일한 기준으로 이루어집니다.','Study freely.':'자유롭게 학습하세요.','Guided sessions remain available for recommendations, but the Study tab and Library always let you open any verse immediately.':'추천 학습은 계속 사용할 수 있지만 학습 탭과 전체 구절에서는 언제든 원하는 구절을 바로 열 수 있습니다.',
      'Progress is stored in this browser. Export a JSON backup before clearing browser data or changing devices.':'진행 상황은 이 브라우저에 저장됩니다. 브라우저 데이터를 삭제하거나 기기를 바꾸기 전에 JSON 백업을 내보내세요.','Export progress':'진행 상황 내보내기','Import backup':'백업 가져오기','Recover snapshot':'자동 백업 복원','Export review CSV':'복습 CSV 내보내기','These actions cannot be undone unless you exported a backup or recover a prior automatic snapshot.':'백업을 내보냈거나 이전 자동 백업을 복원할 수 없는 경우 이 작업은 되돌릴 수 없습니다.','Reset progress, keep settings':'진행 상황만 초기화','Reset everything':'모두 초기화','Assisted learning never proves long-term mastery.':'도움이 있는 학습은 장기 숙달의 증거로 인정되지 않습니다.','Wording and book, chapter & verse schedules are independent.':'본문 복습과 장절 복습 일정은 서로 독립적입니다.','Failed scheduled cards enter relearning.':'예정된 복습에 실패하면 다시 학습 단계로 들어갑니다.','Successful early extra practice cannot accelerate intervals.':'예정보다 이른 추가 연습에 성공해도 복습 간격은 빨라지지 않습니다.','Review history is retained for diagnostics.':'복습 기록은 학습 상태 분석을 위해 보관됩니다.',
      'Light uses white surfaces. Dark uses a deep background tinted by the selected accent.':'라이트 모드는 밝은 화면을, 다크 모드는 선택한 강조 색상이 반영된 어두운 화면을 사용합니다.','Interface scale':'화면 크기','The app language changes menus and instructions. Your Bible version is a separate setting.':'앱 언어는 메뉴와 안내 문구를 변경합니다. 성경 번역본은 별도로 설정됩니다.','Exact-recall progress is separate for each translation. Switching versions never marks the same verse mastered in another wording.':'정확 암송 진행 상황은 번역본마다 따로 저장됩니다. 번역본을 바꿔도 다른 문구가 자동으로 숙달 처리되지 않습니다.','After the first successful load, this 60-verse translation dataset is cached in this browser for later use.':'처음 성공적으로 불러온 뒤에는 이 60구절 번역 데이터를 브라우저에 저장하여 이후에도 사용할 수 있습니다.',
      'Read slowly, notice the structure, and establish the book, chapter & verse before hiding words.':'천천히 읽으며 구조를 파악하고 단어를 가리기 전에 성경 책과 장절을 확실히 익히세요.','I read the verse aloud slowly.':'구절을 천천히 소리 내어 읽었습니다.','I said the book, chapter & verse before and after the verse.':'구절 전후에 성경 책과 장절을 말했습니다.','I looked away and recalled at least the opening phrase.':'본문을 보지 않고 최소한 첫 구절 부분을 떠올렸습니다.','Browser audio is unavailable; read the verse aloud manually.':'브라우저 음성을 사용할 수 없습니다. 직접 소리 내어 읽으세요.','Recall the verse in your head or say it aloud, then reveal it.':'머릿속으로 구절을 떠올리거나 소리 내어 말한 뒤 본문을 확인하세요.','Recite the complete verse before revealing it.':'본문을 확인하기 전에 전체 구절을 암송하세요.','Type the verse from memory. Exact wording is assessed.':'기억나는 대로 구절을 입력하세요. 정확한 본문을 기준으로 채점합니다.','Expand every initial into the exact verse.':'각 첫 글자를 바탕으로 정확한 전체 구절을 입력하세요.','Recall the next phrase before revealing it.':'다음 구절 부분을 떠올린 뒤 공개하세요.','Hidden phrase':'가려진 구절','Reveal next phrase':'다음 구절 공개','Complete verse revealed':'전체 구절 공개 완료','Voice':'음성','Speech rate':'말하기 속도','Play':'재생','Pause / resume':'일시정지 / 계속','Stop':'정지','Speech synthesis is unavailable in this browser. Read the verse aloud slowly and repeat it manually.':'이 브라우저에서는 음성 합성을 사용할 수 없습니다. 구절을 천천히 소리 내어 읽고 직접 반복하세요.','Listen, pause, and repeat each clause aloud.':'듣고 멈추면서 각 구절 부분을 소리 내어 따라 하세요.','Read and repeat each clause aloud.':'각 구절 부분을 소리 내어 읽고 반복하세요.','I listened and repeated':'듣고 따라 했습니다','I read and repeated':'읽고 반복했습니다',
      'Expected':'정답','You typed':'입력한 내용','Difference':'차이','Differences':'차이점','All words are correct. Punctuation differences are shown below for reference and do not reduce your score.':'모든 단어가 맞습니다. 문장부호 차이는 참고용으로만 표시되며 점수에는 영향을 주지 않습니다.','All words are correct. Check the highlighted capitalization or punctuation difference below.':'모든 단어가 맞습니다. 강조된 대소문자 또는 문장부호 차이를 확인하세요.','Mon':'월','Tue':'화','Wed':'수','Thu':'목','Fri':'금','Sat':'토','Sun':'일','due':'복습'
    }
  };

  function localizeReference(s,l) {
    if (l === 'en') return String(s);
    let out = String(s);
    for (const [en,names] of Object.entries(BOOKS).sort((a,b)=>b[0].length-a[0].length)) {
      const esc = en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      out = out.replace(new RegExp('(^|\\b)'+esc+'(?=\\s+\\d+:\\d)','g'), (_,p)=>p+names[l==='de'?0:1]);
    }
    return out;
  }
  function localizePack(s,l) { const x=PACKS[s]; return x ? x[l==='de'?0:1] : s; }

  function tr(raw,l) {
    const s=String(raw??''); if (l==='en'||!s.trim()) return s;
    const lead=s.match(/^\s*/)?.[0]||'', trail=s.match(/\s*$/)?.[0]||'', core=s.slice(lead.length,s.length-trail.length);
    const dict=D[l]||{}; if (Object.hasOwn(dict,core)) return lead+dict[core]+trail;
    let m;
    if((m=core.match(/^(\d+)\.\s+(.+\d+:\d+(?:-\d+)?)$/))) return lead+m[1]+'. '+localizeReference(m[2],l)+trail;
    const rr=localizeReference(core,l); if(rr!==core) return lead+rr+trail;
    if((m=core.match(/^e\.g\.\s+(.+\d+:\d+(?:-\d+)?)$/i))) return lead+(l==='de'?'z. B. ':'예: ')+localizeReference(m[1],l)+trail;
    if((m=core.match(/^Pack ([A-E])\s*[·:]\s*(.+)$/))) return lead+(l==='de'?'Paket ':'묶음 ')+m[1]+' · '+localizePack(m[2],l)+trail;
    if((m=core.match(/^Pack ([A-E])$/))) return lead+(l==='de'?'Paket ':'묶음 ')+m[1]+trail;
    if((m=core.match(/^(\d+) verses?$/))) return lead+(l==='de'?m[1]+' '+(+m[1]===1?'Vers':'Verse'):m[1]+'구절')+trail;
    if((m=core.match(/^Verse (\d+) of 60$/))) return lead+(l==='de'?`Vers ${m[1]} von 60`:`60구절 중 ${m[1]}번`)+trail;
    if((m=core.match(/^Task (\d+) of (\d+)$/))) return lead+(l==='de'?`Aufgabe ${m[1]} von ${m[2]}`:`${m[2]}개 중 ${m[1]}번째`)+trail;
    if((m=core.match(/^Exact (.+) recall$/))) return lead+(l==='de'?`Exaktes ${m[1]}-Abrufen`:`${m[1]} 정확 암송`)+trail;
    if((m=core.match(/^Study (.+\d+:\d+(?:-\d+)?)$/))) return lead+(l==='de'?localizeReference(m[1],l)+' lernen':localizeReference(m[1],l)+' 학습')+trail;
    if((m=core.match(/^Continue (.+\d+:\d+(?:-\d+)?)$/))) return lead+(l==='de'?localizeReference(m[1],l)+' weiterlernen':localizeReference(m[1],l)+' 계속 학습')+trail;
    if((m=core.match(/^Study next:\s*(.+)$/))) return lead+(l==='de'?'Als Nächstes lernen: ':'다음 구절 학습: ')+localizeReference(m[1],l)+trail;
    if((m=core.match(/^[☆★]\s*(Starred|Star)$/))) return lead+core[0]+' '+(l==='de'?(m[1]==='Starred'?'Markiert':'Markieren'):(m[1]==='Starred'?'즐겨찾기됨':'즐겨찾기'))+trail;
    if((m=core.match(/^Oral self-checks:\s*(\d+)\/(\d+) passed$/))) return lead+(l==='de'?`Mündliche Selbstkontrollen: ${m[1]}/${m[2]} bestanden`:`구두 자가 점검: ${m[1]}/${m[2]} 통과`)+trail;
    if((m=core.match(/^(\d+) days?$/))) return lead+(l==='de'?m[1]+' '+(+m[1]===1?'Tag':'Tage'):m[1]+'일')+trail;
    if((m=core.match(/^(\d+) min$/))) return lead+(l==='de'?m[1]+' Min.':m[1]+'분')+trail;
    if((m=core.match(/^(\d+)% hidden$/))) return lead+(l==='de'?`${m[1]} % ausgeblendet`:`${m[1]}% 가림`)+trail;
    if((m=core.match(/^(\d+) focused tasks?$/))) return lead+(l==='de'?m[1]+' fokussierte '+(+m[1]===1?'Aufgabe':'Aufgaben'):'집중 과제 '+m[1]+'개')+trail;
    if((m=core.match(/^(\d+) wording · (\d+) reference$/))) return lead+(l==='de'?`${m[1]} Wortlaut · ${m[2]} Referenz`:`본문 ${m[1]} · 장절 ${m[2]}`)+trail;
    if((m=core.match(/^(\d+) wording · (\d+) book, chapter & verse$/))) return lead+(l==='de'?`${m[1]} Wortlaut · ${m[2]} Referenz`:`본문 ${m[1]} · 장절 ${m[2]}`)+trail;
    if((m=core.match(/^(\d+) stable long-term$/))) return lead+(l==='de'?`${m[1]} langfristig stabil`:`장기 안정 ${m[1]}구절`)+trail;
    if((m=core.match(/^(\d+) stable · (\d+) learning · (\d+) unseen$/))) return lead+(l==='de'?`${m[1]} stabil · ${m[2]} in Arbeit · ${m[3]} ungelernt`:`안정 ${m[1]} · 학습 중 ${m[2]} · 미학습 ${m[3]}`)+trail;
    if((m=core.match(/^(\d+) learning · (\d+) maintaining · (\d+) stable$/))) return lead+(l==='de'?`${m[1]} Lernen · ${m[2]} Wiederholen · ${m[3]} stabil`:`학습 중 ${m[1]} · 복습 중 ${m[2]} · 안정됨 ${m[3]}`)+trail;
    if((m=core.match(/^Opening words:\s*(.+)$/))) return lead+(l==='de'?'Anfangswörter: ':'첫 단어: ')+m[1]+trail;
    if((m=core.match(/^Recover snapshot \((\d+)\)$/))) return lead+(l==='de'?`Schnappschuss wiederherstellen (${m[1]})`:`자동 백업 복원 (${m[1]})`)+trail;
    if((m=core.match(/^Schema (\d+) · (\d+) review events · Last saved (.+)$/))) return lead+(l==='de'?`Schema ${m[1]} · ${m[2]} Wiederholungsereignisse · Zuletzt gespeichert ${m[3]}`:`스키마 ${m[1]} · 복습 기록 ${m[2]}개 · 마지막 저장 ${m[3]}`)+trail;
    if((m=core.match(/^Interface scale:\s*(.+)$/))) return lead+(l==='de'?'Oberflächengröße: ':'화면 크기: ')+m[1]+trail;
    if((m=core.match(/^\+(\d+) more$/))) return lead+(l==='de'?`+${m[1]} weitere`:`+${m[1]}개 더`)+trail;
    if((m=core.match(/^(unseen|learning|established|stable|maintaining|due|starred)$/i))) {
      const k=m[1].toLowerCase(), de={unseen:'ungelernt',learning:'Lernen',established:'gefestigt',stable:'stabil',maintaining:'Wiederholen',due:'fällig',starred:'markiert'}, ko={unseen:'미학습',learning:'학습 중',established:'암송됨',stable:'안정됨',maintaining:'복습 중',due:'복습 예정',starred:'즐겨찾기'};
      return lead+(l==='de'?de[k]:ko[k])+trail;
    }
    if((m=core.match(/^(85|90|95|97)% — (lighter workload|balanced|intensive|maximum maintenance)$/))) {
      const de={"lighter workload":'leichtere Belastung',balanced:'ausgewogen',intensive:'intensiv',"maximum maintenance":'maximale Wiederholung'}, ko={"lighter workload":'가벼운 학습량',balanced:'균형',intensive:'집중',"maximum maintenance":'최대 유지'};
      return lead+`${m[1]}% — ${l==='de'?de[m[2]]:ko[m[2]]}`+trail;
    }
    return s;
  }

  function shouldSkip(node) {
    const p=node.parentElement;
    return !p || !!p.closest('script,style,#translation-copyright,.verse-text,.quote-mini,.diff,.char-text,.initials-prompt,.cloze-line');
  }

  function translateTextNode(node,l) {
    if (shouldSkip(node)) return;
    if (!originalText.has(node)) originalText.set(node,node.nodeValue);
    const base=originalText.get(node), next=tr(base,l);
    if (node.nodeValue!==next) node.nodeValue=next;
  }

  function translateElement(root,l) {
    if (!root) return;
    if (root.nodeType===Node.TEXT_NODE) { translateTextNode(root,l); return; }
    if (root.nodeType!==Node.ELEMENT_NODE && root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE && root.nodeType!==Node.DOCUMENT_NODE) return;
    const walker=(root.ownerDocument||root).createTreeWalker(root,NodeFilter.SHOW_TEXT); let n;
    while((n=walker.nextNode())) translateTextNode(n,l);
    root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el=>{
      let rec=originalAttrs.get(el); if(!rec){rec={};originalAttrs.set(el,rec);}
      for(const attr of ['placeholder','aria-label','title']) if(el.hasAttribute(attr)) {
        if(!(attr in rec)) rec[attr]=el.getAttribute(attr);
        const next=tr(rec[attr],l); if(el.getAttribute(attr)!==next) el.setAttribute(attr,next);
      }
    });
  }

  function translateDocument(doc) {
    if (!doc?.body) return;
    const l=currentLang(); doc.documentElement.lang=l;
    translateElement(doc.body,l);
  }

  function attach() {
    const frame=document.getElementById('app-frame');
    const doc=frame?.contentDocument;
    if(!doc?.body) return;
    if(observedDocument===doc) { translateDocument(doc); return; }
    observer?.disconnect(); observedDocument=doc;
    translateDocument(doc);
    observer=new MutationObserver(records=>{
      const l=currentLang();
      for(const record of records) for(const node of record.addedNodes) translateElement(node,l);
    });
    observer.observe(doc.body,{childList:true,subtree:true});
    doc.addEventListener('change',event=>{
      if(event.target?.id==='ui-language-select') requestAnimationFrame(()=>translateDocument(doc));
    },true);
    doc.documentElement.dataset.tmsLocalizationRuntime='loaded';
  }

  const frame=document.getElementById('app-frame');
  if(frame) frame.addEventListener('load',()=>setTimeout(attach,0));
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-ui-language]')) setTimeout(attach,0);
  },true);
  window.addEventListener('storage',event=>{if(event.key===KEY) attach();});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(attach,0),{once:true});
  else setTimeout(attach,0);
})();