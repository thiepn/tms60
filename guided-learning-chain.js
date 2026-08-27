'use strict';
(() => {
  if (window.top === window || window.__TMS60_GUIDED_CHAIN_FIX__) return;

  // HOTFIX 2026-08-27: a session is a fixed plan. Once the UI says that a
  // session contains N tasks, completing/failing tasks must never increase N.
  // Failed work remains recorded by the scheduler and can return in a future
  // session; a guided verse continues from its new learning stage next time.
  window.__TMS60_GUIDED_CHAIN_FIX__ = '3.0.0';
  window.__TMS60_SESSION_PLAN_STABILITY__ = '2.0.0';

  const nativeInsertTask = typeof insertTask === 'function' ? insertTask : null;
  window.__TMS60_NATIVE_INSERT_TASK__ = nativeInsertTask;

  // Core used this helper to append same-session relearns. That made a session
  // displayed as e.g. 5 tasks grow to 6, 7, 8... while the user was working.
  // Keep the initial queue immutable in length instead.
  insertTask = function fixedSessionInsertTask() {
    return false;
  };

  // Defense in depth for cached or mixed-version app shells: even if an older
  // enhancement layer tries to append work, restore the queue to the exact
  // length it had before the completion began and finish normally.
  const nativeCompleteCurrent = completeCurrent;
  completeCurrent = function fixedSessionCompleteCurrent(...args) {
    const plannedLength = Array.isArray(session?.tasks) ? session.tasks.length : 0;
    const out = nativeCompleteCurrent(...args);
    if (plannedLength && session.tasks.length > plannedLength) {
      session.tasks.splice(plannedLength);
      if (session.index >= plannedLength && !session.summary) finalizeSession();
      renderStudy();
    }
    return out;
  };
})();
