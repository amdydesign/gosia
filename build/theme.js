// Theme before first paint (same keys as PreferencesContext). A file, not inline, so the CSP can forbid inline scripts.
(function () {
  try {
    var t = localStorage.getItem('gonia.theme') || 'auto';
    if (t === 'auto') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#0b0b0d' : '#f3f3ef');
    document.documentElement.dataset.hideAmounts = localStorage.getItem('gonia.hideAmountsDefault') === '1' ? 'true' : 'false';
  } catch {
    // no storage (private mode) - default look
  }
})();
