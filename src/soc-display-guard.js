(function () {
  'use strict';
  if (window.__beSocDisplayGuard615) return;
  window.__beSocDisplayGuard615 = true;
  const id = 'be-soc-display-guard-615';
  const duplicate = '[data-be-soc-legend="soc-chart"]';
  // Run before Chart.js, cached SOC data, or the mobile layout is ready.
  // The second selector also overrides the legacy display:contents rule.
  const css = 'html ' + duplicate + ',html [data-be-soc-compact]>' + duplicate +
    '{display:none!important}';
  let queued = false;
  function repair() {
    queued = false;
    const host = document.head || document.documentElement;
    if (!host) return;
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      host.appendChild(style);
    } else if (style.textContent !== css) style.textContent = css;
    document.querySelectorAll(duplicate).forEach(row => row.remove());
  }
  function schedule() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(repair);
  }
  new MutationObserver(records => {
    if (!document.getElementById(id) || records.some(record =>
      record.type === 'attributes' || Array.from(record.addedNodes).some(node =>
        node.nodeType === 1 && (node.matches?.(duplicate) || node.querySelector?.(duplicate))
      )
    )) schedule();
  }).observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-be-soc-legend']});
  document.addEventListener('DOMContentLoaded', repair, {once: true});
  window.addEventListener('pageshow', repair);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) repair(); });
  repair();
})();
