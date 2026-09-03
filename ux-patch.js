/* TMS60 patch loader: keep the established UX patch isolated from scoring patches. */
(() => {
  'use strict';
  const current = document.currentScript?.src || location.href;
  const base = new URL('.', current);
  const script = name => `<script src="${new URL(name, base).href}"><\/script>`;
  document.write(script('ux-patch-core.js') + script('recall-reference-fix.js') + script('typo-tolerance.js') + script('typo-scoring-finalizer.js'));
})();
