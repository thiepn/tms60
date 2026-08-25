'use strict';
(() => {
  if (window.top === window || window.__TMS60_GUIDED_CHAIN_FIX__) return;
  window.__TMS60_GUIDED_CHAIN_FIX__ = '1.0.0';

  const originalCompleteCurrent = completeCurrent;

  function effectiveRating(requestedRating, score, result) {
    let rating = intClamp(requestedRating, 0, 3);
    if (result && score != null) rating = Math.min(rating, maxRatingForScore(score));
    if (session?.exercise?.hintUsed) rating = Math.min(rating, 1);
    return rating;
  }

  function learningStepPasses(stage, requestedRating, score, result) {
    const rating = effectiveRating(requestedRating, score, result);
    if (stage === 0) return true;
    if (stage === 1) return rating >= 2;
    if (stage === 2 || stage === 3) return Number(score) >= 85;
    if (stage === 4) return Number(score) >= 90;
    return false;
  }

  function insertNextGuidedStep(verseId, expectedStage) {
    const progress = state.progress[verseId];
    if (!progress || progress.stage !== expectedStage || progress.stage <= 0 || progress.stage >= 6) return false;
    if (!session?.tasks?.length) return false;

    const alreadyQueued = session.tasks.slice(session.index).some(task =>
      task?.verseId === verseId && task?.guidedChainStage === expectedStage
    );
    if (alreadyQueued) return false;

    const verse = verseById(verseId);
    if (!verse) return false;
    const next = learningTask(verse);
    next.id = uid();
    next.source = 'guided';
    next.guidedChain = true;
    next.guidedChainStage = expectedStage;
    next.label = `Continue · ${next.label}`;

    const len = session.tasks.length;
    const desired = Math.min(len, session.index + 2);
    const candidates = [];
    for (let pos = session.index; pos <= len; pos++) candidates.push(pos);
    candidates.sort((a,b) => Math.abs(a-desired)-Math.abs(b-desired) || a-b);
    const safe = pos =>
      (!session.tasks[pos-1] || session.tasks[pos-1].verseId !== verseId) &&
      (!session.tasks[pos] || session.tasks[pos].verseId !== verseId);
    let pos = candidates.find(safe);
    if (pos == null) pos = candidates[0] ?? len;

    session.tasks.splice(pos, 0, next);
    session.summary = null;
    return true;
  }

  completeCurrent = function(requestedRating, score=null, result=null, options={}) {
    const task = currentTask();
    const verse = currentVerse();
    const oldStage = verse ? state.progress[verse.id]?.stage : null;
    const shouldChain = Boolean(
      task && verse && task.source === 'guided' &&
      Number.isInteger(oldStage) && oldStage >= 0 && oldStage < 5 &&
      learningStepPasses(oldStage, requestedRating, score, result)
    );

    const out = originalCompleteCurrent(requestedRating, score, result, options);

    if (shouldChain && state.progress[verse.id]?.stage === oldStage + 1) {
      if (insertNextGuidedStep(verse.id, oldStage + 1)) renderStudy();
    }
    return out;
  };
})();
