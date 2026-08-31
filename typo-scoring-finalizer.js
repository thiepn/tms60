/* TMS60 final typo-aware scoring hooks.
 * Runs after legacy runtime initialization so character-level typo credit
 * cannot be replaced by older whole-word-only scoring.
 */
(() => {
  'use strict';

  if (window.__TMS60_TYPO_SCORING_FINALIZER__) return;

  function editDistance(a, b) {
    if (typeof window.__TMS60_TYPO_DISTANCE__ === 'function') {
      return window.__TMS60_TYPO_DISTANCE__(a, b);
    }
    const A = [...String(a || '')];
    const B = [...String(b || '')];
    const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
    for (let i = 0; i <= A.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= B.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= A.length; i += 1) {
      for (let j = 1; j <= B.length; j += 1) {
        const cost = A[i - 1] === B[j - 1] ? 0 : 1;
        let best = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) {
          best = Math.min(best, dp[i - 2][j - 2] + 1);
        }
        dp[i][j] = best;
      }
    }
    return dp[A.length][B.length];
  }

  function typoMeta(expected, actual) {
    const left = normWord(expected);
    const right = normWord(actual);
    const distance = editDistance(left, right);
    const longest = Math.max([...left].length, [...right].length);
    if (distance === 1) return { distance, credit: 0.9, minor: true };
    if (distance === 2 && longest >= 8) return { distance, credit: 0.75, minor: false };
    return { distance, credit: 0, minor: false };
  }

  function typoAwareCompareTextFinal(target, input) {
    const safeTarget = String(target || '').slice(0, MAX_ANSWER_CHARS);
    const safeInput = String(input || '').slice(0, MAX_ANSWER_CHARS);
    const ops = alignWords(safeTarget, safeInput).map(op => {
      if (op.type !== 'wrong') return op;
      const meta = typoMeta(op.target, op.input);
      return meta.credit > 0
        ? { ...op, typo: true, minorTypo: meta.minor, editDistance: meta.distance, credit: meta.credit }
        : op;
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
      ops.every(op => op.type === 'ok') && punctuationNeutralText(ct) === punctuationNeutralText(ci);
    const exact = characterExact || punctuationEquivalent;
    const charDistance = editDistance(ct, ci);
    const charScore = ct.length ? 100 * (1 - charDistance / Math.max([...ct].length, [...ci].length, 1)) : 100;

    const typoCount = ops.filter(op => op.type === 'wrong' && op.typo).length;
    const minorTypoCount = ops.filter(op => op.type === 'wrong' && op.minorTypo).length;
    const majorErrorCount = ops.filter(op => op.type === 'missing' || op.type === 'extra' || (op.type === 'wrong' && !op.typo)).length;
    const hasNonMinorTypo = typoCount > minorTypoCount;

    let score = exact ? 100 : Math.min(99, Math.round(0.8 * wordScore + 0.2 * Math.max(0, charScore)));
    if (!exact && minorTypoCount === 1 && typoCount === 1 && majorErrorCount === 0) score = Math.max(90, score);
    if (majorErrorCount > 0 || hasNonMinorTypo) score = Math.min(89, score);

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
      typoCount,
      minorTypoCount,
      majorErrorCount,
      wrong: ops.filter(op => op.type === 'wrong').map(op => op.target),
      missing: ops.filter(op => op.type === 'missing').map(op => op.target),
      extra: ops.filter(op => op.type === 'extra').map(op => op.input)
    };
  }

  function typoAwareCheckClozeFinal() {
    const taskValue = currentTask();
    const verseValue = currentVerse();
    if (!taskValue || !verseValue || session.exercise.checked) return;

    const data = clozeParts(taskValue, verseValue);
    const inputs = [...document.querySelectorAll('.cloze-input')];
    session.exercise.clozeAnswers = inputs.map(input => String(input.value || '').slice(0, MAX_WORD_CHARS));

    let answerIndex = 0;
    let credited = 0;
    let exactCount = 0;
    const testedOps = [];
    const rebuilt = data.parts.map((part, index) => {
      if (!data.hidden.has(index)) return part;
      const value = session.exercise.clozeAnswers[answerIndex++] || '';
      const exact = normWord(value) === normWord(part);
      const meta = exact ? { distance: 0, credit: 1, minor: false } : typoMeta(part, value);
      const typo = !exact && meta.credit > 0;
      if (exact) exactCount += 1;
      credited += exact ? 1 : meta.credit;
      testedOps.push({
        type: exact ? 'ok' : value ? 'wrong' : 'missing',
        target: part,
        input: value,
        typo,
        minorTypo: typo && meta.minor,
        editDistance: typo ? meta.distance : undefined,
        credit: typo ? meta.credit : 0
      });
      return value;
    }).join('');

    const result = typoAwareCompareTextFinal(verseValue.text, rebuilt);
    const testedCount = Math.max(1, data.hidden.size);
    const typoCount = testedOps.filter(op => op.typo).length;
    const minorTypoCount = testedOps.filter(op => op.minorTypo).length;
    const majorErrorCount = testedOps.filter(op => op.type === 'missing' || (op.type === 'wrong' && !op.typo)).length;
    const hasNonMinorTypo = typoCount > minorTypoCount;

    let score = Math.round(100 * credited / testedCount);
    if (minorTypoCount === 1 && typoCount === 1 && majorErrorCount === 0) score = Math.max(90, score);
    if (majorErrorCount > 0 || hasNonMinorTypo) score = Math.min(89, score);

    result.score = clamp(score, 0, 100);
    result.exact = exactCount === data.hidden.size;
    result.testedOps = testedOps;
    result.typoCount = typoCount;
    result.minorTypoCount = minorTypoCount;
    result.majorErrorCount = majorErrorCount;
    session.exercise.result = result;
    session.exercise.checked = true;
    renderStudy();
  }

  function typoAwareDiffHtmlFinal(result) {
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
  }

  function install() {
    window.compareText = typoAwareCompareTextFinal;
    window.checkCloze = typoAwareCheckClozeFinal;
    window.diffHtml = typoAwareDiffHtmlFinal;
    window.__TMS60_TYPO_SCORING_INSTALLS__ = (window.__TMS60_TYPO_SCORING_INSTALLS__ || 0) + 1;
  }

  window.__TMS60_TYPO_SCORING_FINALIZER__ = '1.0.0';
  window.__TMS60_TYPO_WORD_META__ = typoMeta;
  install();
  queueMicrotask(install);
  setTimeout(install, 0);
  if (document.readyState === 'complete') install();
  else window.addEventListener('load', install, { once: true });
})();
