/* EdInt Intelligence - pre-paint boot: applies persisted theme + sidebar
   state before first render to avoid flashes. No app logic lives here. */
(function () {
  'use strict';
  try {
    var theme = localStorage.getItem('exi-theme');
    if (!theme) {
      theme =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    }
    document.documentElement.setAttribute('data-exi-theme', theme);
    if (localStorage.getItem('exi-sidebar-collapsed') === '1') {
      document.documentElement.setAttribute('data-exi-collapsed', '1');
    }
  } catch (_) {
    document.documentElement.setAttribute('data-exi-theme', 'light');
  }
})();
