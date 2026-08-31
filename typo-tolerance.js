/* TMS60 typo-tolerant recall scoring.
 * Whole-word omissions/substitutions remain meaningful errors, while small
 * character-level typing mistakes receive partial credit. A single one-edit
 * typo can earn Good, but never Easy/perfect recall.
 */
(() => {
  'use strict';

  if (window.__TMS60_TYPO_TOLERANCE__) return;

  function chars(value) {
    return [...String(value ?? '').normalize('NFKC')];
  }

  function damerauDistance(left, right) {
    const a = chars(left);
    const b = chars(right);
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp = Array.from({ length: rows }, () => new Uint16Array(cols));
    for (let i = 0; i < rows; i += 1) dp[i][0] = i;
    for (let j = 0; j < cols; j += 1) dp[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let best = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
        if (
          i > 1 && j > 1 &&
          a[i - 1] === b[j - 2] &&
          a[i - 2] === b[j - 1]
        ) {
          best = Math.min(best, dp[i - 2][j - 2] + 1);
        }
        dp[i][j] = best;
      }
    }
    return dp[a.length][b.length];
  }

  function typoMeta(expected, actual) {
    const left = normWord(expected);
    const right = normWord(actual);
    const distance = damerauDistance(left, right);
    const longest = Math.max(chars(left).length, chars(right).length);

    if (distance === 1) return { distance, credit: 0.9, minor: true };
    if (distance === 2 && longest >= 8) return { distance, credit: 0.55, minor: false };
    return { distance, credit: 0, minor: false };
  }

  compareText = function typoAwareCompareText(target, input) {
    const safeTarget = String(target || '').slice(0, MAX_ANSWER_CHARS);
    const safeInput = String(input || '').slice(0, MAX_ANSWER_CHARS);
    const ops = alignWords(safeTarget, safeInput).map(op => {
      if (op.type !== 'wrong') return op;
      const meta = typoMeta(op.target, op.input);
      return meta.credit > 0 ? { ...op, typo: true, minorTypo: meta.minor, editDistance: meta.distance, credit: meta.credit } : op;
    });

    const targetN = wordTokens(safeTarget).length;
    const inputN = wordTokens(safeInput).length;
    const denominator = Math.max(targetN, inputN, 1);
    const creditedWords = ops.reduce((sum, op) => {
      if (op.type === 'ok') return sum + 1;
      if (op.type === 'wrong' && op.typo) return sum + op.credit;
      return sum;
    }, 0);
    const wordScore = targetN ? 100 * creditedWords / denominator : 100;

    const ct = cleanText(safeTarget);
    const ci = cleanText(safeInput);
    const characterExact = ct === ci;
    const punctuationEquivalent = wordTokens(safeTarget).length === wordTokens(safeInput).length &&
      ops.every(op => op.type === 'ok') &&
      punctuationNeutralText(ct) === punctuationNeutralText(ci);
    const exact = characterExact || punctuationEquivalent;
    const charDistance = damerauDistance(ct, ci);
    const charScore = ct.length ? 100 * (1 - charDistance / Math.max(chars(ct).length, chars(ci).length, 1)) : 100;

    const minorTypos = ops.filter(op => op.type === 'wrong' && op.minorTypo).length;
    const fuzzyTypos = ops.filter(op => op.type === 'wrong' && op.typo).length;
    const majorErrors = ops.filter(op => op.type === 'missing' || op.type === 'extra' || (op.type === 'wrong' && !op.typo)).length;

    let score = exact ? 100 : Math.min(99, Math.round(0.8 * wordScore + 0.2 * Math.max(0, charScore)));
    if (!exact && minorTypos === 1 && fuzzyTypos === 1 && majorErrors === 0) score = Math.max(90, score);

    return {
      score: clamp(score, 0, 100),
      wordScore: Math.round(wordScore),
      charScore: Math.round(Math.max(0, charScore)),
      exact,
      characterExact,
      punctuationEquivalent,
      targetText: ct,
      inputText: ci,
      ops,
      typoCount: fuzzyTypos,
      minorTypoCount: minorTypos,
      majorErrorCount: majorErrors,
      wrong: ops.filter(op => op.type === 'wrong').map(op => op.target),
      missing: ops.filter(op => op.type === 'missing').map(op => op.target),
      extra: ops.filter(op => op.type === 'extra').map(op => op.input)
    };
  };

  function splitNormalizedReference(value) {
    const normalized = normalizeReference(value);
    const match = normalized.match(/^(.*?)(\d+):(\d+(?:-\d+)?)$/u);
    if (!match) return null;
    return { normalized, book: match[1], locator: `${match[2]}:${match[3]}` };
  }

  function assessReference(target, input) {
    const expected = splitNormalizedReference(target);
    const entered = splitNormalizedReference(input);
    if (!expected || !entered) return { score: 0, exact: false, typoAccepted: false, editDistance: null };
    if (expected.normalized === entered.normalized) return { score: 100, exact: true, typoAccepted: false, editDistance: 0 };
    if (expected.locator !== entered.locator) return { score: 0, exact: false, typoAccepted: false, editDistance: null };

    const distance = damerauDistance(expected.book, entered.book);
    const longest = Math.max(chars(expected.book).length, chars(entered.book).length);
    if (distance === 1) return { score: 95, exact: false, typoAccepted: true, editDistance: 1 };
    if (distance === 2 && longest >= 8) return { score: 82, exact: false, typoAccepted: false, nearTypo: true, editDistance: 2 };
    return { score: 0, exact: false, typoAccepted: false, editDistance: distance };
  }

  checkReference = function typoAwareCheckReference() {
    const el = document.getElementById('reference-answer');
    if (!el || session.exercise.checked) return;
    session.exercise.answer = String(el.value || '').slice(0, MAX_REFERENCE_CHARS);
    const target = currentVerse().reference;
    const result = assessReference(target, session.exercise.answer);
    session.exercise.result = {
      score: result.score,
      exact: result.exact,
      typoAccepted: result.typoAccepted,
      nearTypo: Boolean(result.nearTypo),
      editDistance: result.editDistance,
      wrong: result.exact ? [] : [target],
      missing: [],
      extra: []
    };
    session.exercise.checked = true;
    renderStudy();
  };

  diffHtml = function typoAwareDiffHtml(result) {
    return result.ops.map(op => {
      if (op.type === 'ok') return `<span class="tok-ok">${htmlEsc(op.target)}</span>`;
      if (op.type === 'wrong' && op.typo) {
        const label = op.minorTypo ? 'Minor typo' : 'Close spelling';
        return `<span class="tok-typo" title="${label}; entered: ${htmlEsc(op.input)}">${htmlEsc(op.target)}</span>`;
      }
      if (op.type === 'wrong') return `<span class="tok-wrong" title="Entered: ${htmlEsc(op.input)}">${htmlEsc(op.target)}</span>`;
      if (op.type === 'missing') return `<span class="tok-missing">${htmlEsc(op.target)}</span>`;
      return `<span class="tok-extra">+${htmlEsc(op.input)}</span>`;
    }).join(' ');
  };

  function addStyles() {
    if (document.getElementById('tms60-typo-tolerance-style')) return;
    const style = document.createElement('style');
    style.id = 'tms60-typo-tolerance-style';
    style.textContent = `
      .tok-typo{color:var(--warn);text-decoration:underline dotted;text-underline-offset:3px}
      .typo-credit-note{margin-top:7px;color:var(--muted)}
    `;
    document.head.appendChild(style);
  }

  let feedbackScheduled = false;
  function patchFeedback() {
    feedbackScheduled = false;
    addStyles();

    let currentTaskValue = null;
    try { currentTaskValue = currentTask(); } catch (_) {}
    if (!currentTaskValue || !session?.exercise?.checked) return;

    const root = document.getElementById('view-study');
    const feedback = root?.querySelector('.feedback');
    const result = session.exercise.result;
    if (!root || !feedback || !result) return;

    if (currentTaskValue.mode === 'reference' && result.score < 100) {
      const heading = feedback.querySelector('strong');
      if (result.typoAccepted) {
        feedback.classList.remove('bad', 'good');
        feedback.classList.add('warn');
        if (heading && heading.textContent !== 'Minor typo — accepted') heading.textContent = 'Minor typo — accepted';
        let note = feedback.querySelector('[data-typo-credit-note]');
        if (!note) {
          note = document.createElement('div');
          note.className = 'tiny typo-credit-note';
          note.dataset.typoCreditNote = '1';
          feedback.appendChild(note);
        }
        note.textContent = 'Good is available. Easy is reserved for an exact reference.';
      } else if (result.nearTypo) {
        feedback.classList.remove('bad', 'good');
        feedback.classList.add('warn');
        if (heading && heading.textContent !== 'Close — check spelling') heading.textContent = 'Close — check spelling';
      }
      return;
    }

    if (['typing', 'initials'].includes(currentTaskValue.mode) && result.typoCount > 0) {
      let note = feedback.querySelector('[data-typo-credit-note]');
      if (!note) {
        note = document.createElement('div');
        note.className = 'tiny typo-credit-note';
        note.dataset.typoCreditNote = '1';
        feedback.appendChild(note);
      }
      if (result.minorTypoCount === 1 && result.typoCount === 1 && result.majorErrorCount === 0) {
        note.textContent = '1 minor typo received partial credit. Good is available; Easy still requires exact wording.';
      } else {
        note.textContent = `${result.typoCount} close spelling ${result.typoCount === 1 ? 'match received' : 'matches received'} partial credit; whole-word errors still count normally.`;
      }
    }
  }

  function scheduleFeedbackPatch() {
    if (feedbackScheduled) return;
    feedbackScheduled = true;
    requestAnimationFrame(patchFeedback);
  }

  const studyRoot = document.getElementById('view-study');
  if (studyRoot) new MutationObserver(scheduleFeedbackPatch).observe(studyRoot, { childList: true, subtree: true });

  window.__TMS60_TYPO_TOLERANCE__ = '1.0.0';
  window.__TMS60_TYPO_ASSESS_REFERENCE__ = assessReference;
  window.__TMS60_TYPO_DISTANCE__ = damerauDistance;
  scheduleFeedbackPatch();
})();
