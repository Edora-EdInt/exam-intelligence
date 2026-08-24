/* EdInt Intelligence - shared shell: sidebar navigation, theme toggle,
   collapse toggle, lucide icon refresh.
   A page opts in by setting <body data-exi-page="page-id"> and providing a
   <div class="exi-app"> container; the shell injects itself as its first
   child. Pages are iframe-safe: all hrefs/assets are relative. */
(function () {
  'use strict';

  var NAV_GROUPS = [
    {
      label: 'Phase 1 · Question Intelligence',
      items: [
        { id: 'chapter-intelligence', label: 'Chapter Intelligence', icon: 'book-open', href: 'chapter-intelligence.html' },
        { id: 'question-trends', label: 'Question Trends', icon: 'trending-up', href: 'question-trends.html' },
        { id: 'exam-patterns', label: 'Exam Patterns', icon: 'clipboard-list', href: 'exam-patterns.html' },
        { id: 'question-bank-health', label: 'Question Bank Health', icon: 'heart-pulse', href: 'question-bank-health.html' },
      ],
    },
    {
      label: 'Phase 2 · Student Performance',
      items: [
        { id: 'student-profiles', label: 'Student Profiles', icon: 'user', href: 'student-profiles.html' },
        { id: 'class-analytics', label: 'Class Analytics', icon: 'users', href: 'class-analytics.html' },
      ],
    },
    {
      label: 'Phase 3 · Assistant',
      items: [
        { id: 'ai-insights', label: 'AI Insights', icon: 'sparkles', href: 'ai-insights.html' },
        { id: 'practice-generator', label: 'Practice Generator', icon: 'shuffle', href: 'practice-generator.html' },
        { id: 'adaptive-demo', label: 'Adaptive Demo', icon: 'sliders', href: 'adaptive-demo.html' },
      ],
    },
  ];

  var THEME_KEY = 'exi-theme';
  var COLLAPSE_KEY = 'exi-sidebar-collapsed';

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-exi-theme') === 'dark' ? 'dark' : 'light';
  }

  function isCollapsed() {
    return document.documentElement.getAttribute('data-exi-collapsed') === '1';
  }

  function buildSidebar(activePage) {
    var aside = el('aside', 'exi-sidebar');

    var brand = el('a', 'exi-brand');
    brand.href = 'index.html';
    brand.innerHTML =
      '<span class="exi-brand-mark"><i data-lucide="graduation-cap"></i></span>' +
      '<span class="exi-brand-text">' +
      '<span class="exi-brand-name">EdInt Intelligence</span>' +
      '<span class="exi-brand-sub">Assessment Intelligence</span>' +
      '</span>';
    aside.appendChild(brand);

    var nav = el('nav', 'exi-nav');
    NAV_GROUPS.forEach(function (group) {
      nav.appendChild(el('span', 'exi-nav-group-label', group.label));
      group.items.forEach(function (item) {
        var isActive = item.id === activePage;
        var link = el('a', 'exi-nav-item' + (isActive ? ' is-active' : ''));
        link.href = item.href;
        link.title = item.label;
        if (isActive) link.setAttribute('aria-current', 'page');
        link.innerHTML =
          '<i data-lucide="' + item.icon + '"></i>' +
          '<span class="exi-nav-item-text">' + item.label + '</span>';
        nav.appendChild(link);
      });
    });
    aside.appendChild(nav);

    var footer = el('div', 'exi-sidebar-footer');
    var themeBtn = el(
      'button',
      'exi-icon-btn',
      '<i data-lucide="' + (currentTheme() === 'dark' ? 'sun' : 'moon') + '"></i>'
    );
    themeBtn.type = 'button';
    themeBtn.title = 'Toggle light / dark theme';
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-exi-theme', next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (_) {}
      themeBtn.innerHTML = '<i data-lucide="' + (next === 'dark' ? 'sun' : 'moon') + '"></i>';
      window.exiRefreshIcons();
    });

    var collapseBtn = el('button', 'exi-icon-btn', '<i data-lucide="panel-left-close"></i>');
    collapseBtn.type = 'button';
    collapseBtn.title = 'Collapse / expand sidebar';
    collapseBtn.addEventListener('click', function () {
      var next = isCollapsed() ? '0' : '1';
      document.documentElement.setAttribute('data-exi-collapsed', next);
      try {
        localStorage.setItem(COLLAPSE_KEY, next === '1' ? '1' : '0');
      } catch (_) {}
    });

    footer.appendChild(themeBtn);
    footer.appendChild(collapseBtn);
    aside.appendChild(footer);

    return aside;
  }

  function init() {
    try {
      var saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved) {
        document.documentElement.setAttribute('data-exi-collapsed', saved === '1' ? '1' : '0');
      }
    } catch (_) {}

    var activePage = document.body.getAttribute('data-exi-page') || '';
    var mount = document.querySelector('.exi-app');
    if (mount) mount.insertBefore(buildSidebar(activePage), mount.firstChild);
    window.exiRefreshIcons();
  }

  window.exiRefreshIcons = function () {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  };

  window.exiShell = { init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
