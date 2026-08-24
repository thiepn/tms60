/* TMS 60 deterministic localization completion pass.
   No MutationObserver. Runs only after load and actual UI interactions. */
'use strict';
(() => {
  if (window.top !== window || window.__TMS_DETERMINISTIC_I18N__) return;
  window.__TMS_DETERMINISTIC_I18N__ = true;

  const KEY = 'tms60-ui-language-v1';
  const SUPPORTED = new Set(['en','de','ko']);
  let boundDoc = null;
  let scheduled = false;

  function lang() {
    try {
      const value = localStorage.getItem(KEY);
      if (SUPPORTED.has(value)) return value;
    } catch (_) {}
    const n = String(navigator.language || '').toLowerCase();
    return n.startsWith('de') ? 'de' : n.startsWith('ko') ? 'ko' : 'en';
  }

  const T = {
    de: {
      'Unseen':'Ungelernt','unseen':'ungelernt','Read & absorb':'Lesen & aufnehmen','Read and notice':'Lesen und beachten','Listen':'Anhören',
      'End active session':'Aktive Einheit beenden','Remaining tasks will be discarded. Completed reviews and progress are already saved.':'Verbleibende Aufgaben werden verworfen. Abgeschlossene Wiederholungen und Fortschritte sind bereits gespeichert.','Cancel':'Abbrechen','End session':'Einheit beenden','Close dialog':'Dialog schließen',
      'Search book, chapter & verse or wording':'Buch, Kapitel, Vers oder Wortlaut suchen','Assessment record':'Einstufungsverlauf','No pack assessment completed.':'Noch keine Paket-Einstufung abgeschlossen.',
      'Recurring word errors':'Wiederkehrende Wortfehler','Complete exact typing, initials, or cloze checks to build a personal error profile.':'Absolviere exaktes Tippen, Anfangsbuchstaben- oder Lückentextprüfungen, um ein persönliches Fehlerprofil aufzubauen.','Verses needing attention':'Verse mit Lernbedarf','Recent review history':'Letzte Wiederholungen','No reviews recorded yet.':'Noch keine Wiederholungen gespeichert.',
      'Learning stage':'Lernstufe','Wording interval':'Wortlaut-Intervall','Book, chapter & verse interval':'Referenz-Intervall','Delayed proofs':'Zeitversetzte Nachweise','Not established':'Nicht gefestigt','Study this verse':'Diesen Vers lernen','Type wording':'Wortlaut tippen','Recall book, chapter & verse':'Buch, Kapitel und Vers abrufen','Reset verse':'Vers zurücksetzen',
      'Private and offline':'Privat und offline','Saved locally':'Lokal gespeichert','Interface scale':'Oberflächengröße','Print':'Drucken','Multi-verse practice':'Mehrere Verse üben','All packs':'Alle Pakete','All statuses':'Alle Status',
      'Mon':'Mo','Tue':'Di','Wed':'Mi','Thu':'Do','Fri':'Fr','Sat':'Sa','Sun':'So','due':'fällig',
      'Living the New Life':'Das neue Leben leben','Proclaiming Christ':'Christus verkündigen','Reliance on God’s Resources':'Aus Gottes Kraft leben',"Reliance on God's Resources":'Aus Gottes Kraft leben','Being Christ’s Disciple':'Als Jünger Christi leben',"Being Christ's Disciple":'Als Jünger Christi leben','Growth in Christlikeness':'Christus ähnlicher werden',
      'Bundled with TMS 60.':'In TMS 60 enthalten.','These actions cannot be undone unless you exported a backup or recover a prior automatic snapshot.':'Diese Aktionen können nur rückgängig gemacht werden, wenn du eine Sicherung exportiert hast oder einen früheren automatischen Schnappschuss wiederherstellst.',
      'Exact-recall progress is separate for each translation. Switching versions never marks the same verse mastered in another wording.':'Der Fortschritt beim exakten Abruf wird für jede Übersetzung getrennt gespeichert. Ein Wechsel übernimmt die Beherrschung nicht auf einen anderen Wortlaut.','After the first successful load, this 60-verse translation dataset is cached in this browser for later use.':'Nach dem ersten erfolgreichen Laden werden diese 60 Verse für die spätere Nutzung in diesem Browser zwischengespeichert.',
      'Read slowly, notice the structure, and establish the book, chapter & verse before hiding words.':'Lies langsam, beachte die Struktur und präge dir Buch, Kapitel und Vers ein, bevor Wörter ausgeblendet werden.','I read the verse aloud slowly.':'Ich habe den Vers langsam laut gelesen.','I said the book, chapter & verse before and after the verse.':'Ich habe Buch, Kapitel und Vers vor und nach dem Vers genannt.','I looked away and recalled at least the opening phrase.':'Ich habe weggeschaut und mindestens den Versanfang aus dem Gedächtnis abgerufen.','Assisted learning advances the acquisition ladder but does not count as long-term mastery.':'Unterstütztes Lernen bringt dich im Lernprozess weiter, zählt aber nicht als langfristige Beherrschung.',
      'Due work is never hidden merely because it exceeds this target.':'Fällige Aufgaben werden nie ausgeblendet, nur weil sie dieses Ziel überschreiten.','85% — lighter workload':'85% — geringerer Aufwand','90% — balanced':'90% — ausgewogen','95% — intensive':'95% — intensiv','97% — maximum maintenance':'97% — maximale Wiederholung','Higher targets shorten mature review intervals; the scheduler remains deterministic and offline.':'Höhere Ziele verkürzen die Wiederholungsintervalle gefestigter Verse; der Planer bleibt deterministisch und offline.','Removes canonical-order cues.':'Entfernt Hinweise durch die kanonische Reihenfolge.',
      '25% hidden':'25% ausgeblendet','40% hidden':'40% ausgeblendet','60% hidden':'60% ausgeblendet','80% hidden':'80% ausgeblendet'
    },
    ko: {
      'Unseen':'미학습','unseen':'미학습','Read & absorb':'읽고 익히기','Read and notice':'읽고 구조 파악','Listen':'듣기',
      'End active session':'현재 학습 종료','Remaining tasks will be discarded. Completed reviews and progress are already saved.':'남은 과제는 취소됩니다. 완료한 복습과 진행 상황은 이미 저장되었습니다.','Cancel':'취소','End session':'학습 종료','Close dialog':'창 닫기',
      'Search book, chapter & verse or wording':'성경 책, 장·절 또는 본문 검색','Assessment record':'점검 기록','No pack assessment completed.':'완료한 묶음 점검이 없습니다.',
      'Recurring word errors':'반복되는 단어 오류','Complete exact typing, initials, or cloze checks to build a personal error profile.':'정확히 입력하기, 첫 글자 또는 빈칸 채우기 연습을 완료하면 개인 오류 패턴을 확인할 수 있습니다.','Verses needing attention':'집중이 필요한 구절','Recent review history':'최근 복습 기록','No reviews recorded yet.':'아직 기록된 복습이 없습니다.',
      'Learning stage':'학습 단계','Wording interval':'본문 복습 간격','Book, chapter & verse interval':'장절 복습 간격','Delayed proofs':'지연 확인','Not established':'미완료','Study this verse':'이 구절 학습','Type wording':'본문 입력','Recall book, chapter & verse':'장절 맞히기','Reset verse':'구절 초기화',
      'Private and offline':'개인용 · 오프라인','Saved locally':'기기에 저장됨','Interface scale':'화면 크기','Print':'인쇄','Multi-verse practice':'여러 구절 연습','All packs':'전체 묶음','All statuses':'전체 상태',
      'Mon':'월','Tue':'화','Wed':'수','Thu':'목','Fri':'금','Sat':'토','Sun':'일','due':'복습',
      'Living the New Life':'새 생명 안에서 살기','Proclaiming Christ':'그리스도를 전파하기','Reliance on God’s Resources':'하나님의 자원을 의지하기',"Reliance on God's Resources":'하나님의 자원을 의지하기','Being Christ’s Disciple':'그리스도의 제자로 살기',"Being Christ's Disciple":'그리스도의 제자로 살기','Growth in Christlikeness':'그리스도를 닮아가기',
      'Bundled with TMS 60.':'TMS 60에 기본 포함되어 있습니다.','These actions cannot be undone unless you exported a backup or recover a prior automatic snapshot.':'백업을 내보냈거나 이전 자동 백업을 복원할 수 없는 경우 이 작업은 되돌릴 수 없습니다.','Exact-recall progress is separate for each translation. Switching versions never marks the same verse mastered in another wording.':'정확 암송 진행 상황은 번역본마다 따로 저장됩니다. 번역본을 바꿔도 다른 문구가 자동으로 숙달 처리되지 않습니다.','After the first successful load, this 60-verse translation dataset is cached in this browser for later use.':'처음 불러오기에 성공하면 이 60구절 번역 데이터가 이후 사용을 위해 브라우저에 저장됩니다.',
      'Read slowly, notice the structure, and establish the book, chapter & verse before hiding words.':'천천히 읽으며 구조를 파악하고 단어를 가리기 전에 성경 책과 장절을 확실히 익히세요.','I read the verse aloud slowly.':'구절을 천천히 소리 내어 읽었습니다.','I said the book, chapter & verse before and after the verse.':'구절 전후에 성경 책과 장절을 말했습니다.','I looked away and recalled at least the opening phrase.':'본문을 보지 않고 최소한 첫 구절 부분을 떠올렸습니다.','Assisted learning advances the acquisition ladder but does not count as long-term mastery.':'도움을 받는 학습은 학습 단계를 진행시키지만 장기 숙달로 인정되지는 않습니다.',
      'Due work is never hidden merely because it exceeds this target.':'복습할 항목이 목표 수를 넘더라도 숨겨지지 않습니다.','85% — lighter workload':'85% — 가벼운 학습량','90% — balanced':'90% — 균형','95% — intensive':'95% — 집중','97% — maximum maintenance':'97% — 최대 유지','Higher targets shorten mature review intervals; the scheduler remains deterministic and offline.':'목표 기억 유지율이 높을수록 숙달 구절의 복습 간격이 짧아집니다. 일정 계산은 오프라인에서 일관되게 작동합니다.','Removes canonical-order cues.':'정해진 순서로 인한 힌트를 제거합니다.',
      '25% hidden':'25% 숨김','40% hidden':'40% 숨김','60% hidden':'60% 숨김','80% hidden':'80% 숨김'
    }
  };

  const FRAGMENTS = {
    de: [
      ['means you have established the exact wording and the app is scheduling reviews to strengthen it.','bedeutet, dass der exakte Wortlaut gefestigt ist und die App Wiederholungen zur weiteren Festigung plant.'],
      ['means the wording has survived longer-term spacing: at least a 21-day interval and two perfect scheduled wording recalls separated by roughly a week.','bedeutet, dass der Wortlaut längere Abstände überstanden hat: mindestens ein 21-Tage-Intervall und zwei perfekte geplante Wortlautabrufe mit ungefähr einer Woche Abstand.'],
      ['Stable is therefore a retention milestone—not the only progress that counts.','Stabil ist damit ein Meilenstein der Behaltensleistung – nicht der einzige Fortschritt, der zählt.']
    ],
    ko: [
      ['means you have established the exact wording and the app is scheduling reviews to strengthen it.','은 정확한 본문을 암송했으며 앱이 기억을 강화하기 위한 복습 일정을 제공하는 상태입니다.'],
      ['means the wording has survived longer-term spacing: at least a 21-day interval and two perfect scheduled wording recalls separated by roughly a week.','은 본문이 장기 간격 복습을 통과한 상태입니다. 최소 21일의 복습 간격과 약 일주일 이상 떨어진 두 번의 완벽한 예정 복습을 충족해야 합니다.'],
      ['Stable is therefore a retention milestone—not the only progress that counts.','따라서 안정됨은 장기 기억의 한 기준이며 유일한 진행 기준은 아닙니다.']
    ]
  };

  function translate(value, l) {
    const raw = String(value ?? '');
    if (l === 'en' || !raw.trim()) return raw;
    const lead = raw.match(/^\s*/)?.[0] || '';
    const trail = raw.match(/\s*$/)?.[0] || '';
    const core = raw.slice(lead.length, raw.length - trail.length);
    const dict = T[l] || {};
    if (Object.hasOwn(dict, core)) return lead + dict[core] + trail;
    let out = raw;
    for (const [en, target] of Object.entries(dict)) {
      if (en.length >= 5 && out.includes(en)) out = out.split(en).join(target);
    }
    for (const [from, to] of FRAGMENTS[l] || []) if (out.includes(from)) out = out.split(from).join(to);
    out = out.replace(/Interface scale:\s*(\d+)%/g, (_, n) => l === 'de' ? `Oberflächengröße: ${n} %` : `화면 크기: ${n}%`);
    out = out.replace(/Review what is due, then continue the verse you are learning\. Approximately (\d+) minutes?\./g, (_, n) => l === 'de' ? `Wiederhole zuerst das Fällige und lerne danach deinen aktuellen Vers weiter. Ungefähr ${n} ${n === '1' ? 'Minute' : 'Minuten'}.` : `먼저 복습할 내용을 완료한 뒤 현재 학습 중인 구절을 이어서 학습하세요. 약 ${n}분.`);
    return out;
  }

  function skipText(node) {
    const p = node.parentElement;
    return !p || !!p.closest('script,style,#translation-copyright,.verse-text,.quote-mini,.diff,.char-text,.initials-prompt,.cloze-line');
  }

  function translateRoot(root, l) {
    if (!root || l === 'en') return;
    const doc = root.ownerDocument || root;
    const NF = doc.defaultView?.NodeFilter || NodeFilter;
    const walker = doc.createTreeWalker(root, NF.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (skipText(node)) continue;
      const next = translate(node.nodeValue, l);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el => {
      for (const attr of ['placeholder','aria-label','title']) {
        if (!el.hasAttribute(attr)) continue;
        const before = el.getAttribute(attr);
        const after = translate(before, l);
        if (after !== before) el.setAttribute(attr, after);
      }
    });
    root.querySelectorAll?.('option').forEach(option => {
      const after = translate(option.textContent, l);
      if (after !== option.textContent) option.textContent = after;
    });
  }

  function ensureLanguageSelector(doc, l) {
    const settings = doc.getElementById('view-settings');
    const grid = settings?.querySelector('.settings-grid');
    if (!grid) return;
    let card = doc.getElementById('ui-language-settings-card');
    if (card && card.parentElement === grid) return;
    card?.remove();
    const copy = {
      en: ['App language','Interface language','The app language changes menus and instructions. Your Bible version is a separate setting.'],
      de: ['App-Sprache','Oberflächensprache','Die App-Sprache ändert Menüs und Anweisungen. Die Bibelübersetzung ist eine separate Einstellung.'],
      ko: ['앱 언어','인터페이스 언어','앱 언어는 메뉴와 안내 문구를 변경합니다. 성경 번역본은 별도의 설정입니다.']
    }[l] || ['App language','Interface language','The app language changes menus and instructions. Your Bible version is a separate setting.'];
    card = doc.createElement('article');
    card.id = 'ui-language-settings-card';
    card.className = 'card flat';
    card.style.gridColumn = '1 / -1';
    card.innerHTML = `<h2>${copy[0]}</h2><div class="field"><label for="ui-language-select">${copy[1]}</label><select id="ui-language-select"><option value="en">English</option><option value="de">Deutsch</option><option value="ko">한국어</option></select><div class="help">${copy[2]}</div></div>`;
    grid.prepend(card);
    const select = card.querySelector('#ui-language-select');
    select.value = l;
    select.addEventListener('change', () => {
      const next = select.value;
      if (!SUPPORTED.has(next)) return;
      try { localStorage.setItem(KEY, next); } catch (_) {}
      location.reload();
    });
  }

  function run() {
    scheduled = false;
    const frame = document.getElementById('app-frame');
    const doc = frame?.contentDocument;
    if (!doc?.body) return;
    const l = lang();
    doc.documentElement.lang = l;
    ensureLanguageSelector(doc, l);
    translateRoot(doc.body, l);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(run, 0);
    setTimeout(run, 80);
  }

  function bind() {
    const frame = document.getElementById('app-frame');
    const doc = frame?.contentDocument;
    if (!doc?.body) { setTimeout(bind, 120); return; }
    if (boundDoc === doc) { run(); return; }
    boundDoc = doc;
    doc.addEventListener('click', schedule, false);
    doc.addEventListener('change', schedule, false);
    doc.addEventListener('input', event => {
      if (event.target?.id === 'setting-font') schedule();
    }, false);
    frame.addEventListener('load', () => setTimeout(bind, 0), { once: true });
    run();
    setTimeout(run, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
