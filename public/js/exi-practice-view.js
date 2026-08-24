/* EdInt Intelligence - shared renderer for generated practice sets.
   Used by student-profiles and practice-generator pages so both show the
   exact same list UI. Exposes window.exiRenderPractice(rootEl, result). */
(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function difficultyClass(difficulty) {
    if (difficulty === 'Easy') return 'exi-pill exi-pill--positive';
    if (difficulty === 'Hard') return 'exi-pill exi-pill--negative';
    return 'exi-pill exi-pill--warning';
  }

  window.exiRenderPractice = function (root, result) {
    if (!root) return;
    var data = result.data || {};
    var questions = data.questions || [];
    var focus = data.focusChapters || [];
    var totals = data.totals || {};

    var html = '';
    html += '<div class="exi-practice-head">';
    html += '<h3>Generated Practice Set</h3>';
    html += '<div class="exi-note">Focus chapters: ' +
      focus.map(function (c) {
        return escapeHtml(c.chapterName) + ' (' + c.masteryPct + '%)';
      }).join(' · ') +
      '</div>';
    html += '<div class="exi-practice-stats">' +
      '<span><strong>' + totals.delivered + '</strong> delivered</span>' +
      '<span><strong>' + totals.requested + '</strong> requested</span>' +
      '<span><strong>' + totals.eligiblePoolSize + '</strong> eligible in pool</span>' +
      '<span><strong>' + totals.excludedCorrectInFocus + '</strong> excluded (already mastered)</span>' +
      '</div>';
    html += '</div>';

    html += '<ol class="exi-q-list">';
    questions.forEach(function (q, index) {
      html += '<li class="exi-q-row">' +
        '<div class="exi-q-num">' + (index + 1) + '</div>' +
        '<div class="exi-q-body">' +
        '<p class="exi-q-prompt">' + escapeHtml(q.prompt) + '</p>' +
        '<div class="exi-q-meta">' +
        '<span class="exi-pill">' + escapeHtml(q.subject) + '</span>' +
        '<span class="exi-pill">' + escapeHtml(q.chapterName) + '</span>' +
        '<span class="' + difficultyClass(q.difficulty) + '">' + escapeHtml(q.difficulty) + '</span>' +
        '<span class="exi-pill">' + escapeHtml(q.type) + ' · ' + q.marks + 'm</span>' +
        '<span class="exi-q-concept">' + escapeHtml(q.concept) + '</span>' +
        '</div></div></li>';
    });
    html += '</ol>';

    if (!questions.length) {
      html = '<div class="exi-note">No eligible questions found for this student\'s weakest chapters.</div>';
    }

    root.innerHTML =
      '<section class="exi-panel exi-practice-result" id="exi-practice-result">' +
      html +
      '<p class="exi-note">Selection rule: weakest chapters first, previously-correct questions excluded, weighted toward Medium/Hard. Question text is a placeholder until real content is loaded.</p>' +
      '</section>';
  };
})();
