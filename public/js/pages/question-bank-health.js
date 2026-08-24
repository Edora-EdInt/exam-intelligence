/* Question Bank Health - totals, coverage and chapter completeness.
   Source: GET /api/analytics/bank-health (target from data/config.json). */
(function () {
  'use strict';

  var els = {
    stats: document.getElementById('exi-bh-stats'),
    coverage: document.getElementById('exi-bh-coverage'),
    completeness: document.getElementById('exi-bh-completeness'),
    target: document.getElementById('exi-bh-target'),
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function skeletonStats() {
    var html = '';
    for (var i = 0; i < 6; i++) {
      html +=
        '<div class="exi-stat">' +
        '<div class="exi-skeleton" style="height:28px;width:60px;margin-bottom:8px;"></div>' +
        '<div class="exi-skeleton" style="height:11px;width:90px;"></div>' +
        '</div>';
    }
    els.stats.innerHTML = html;
  }

  function renderTotals(totals) {
    var cards = [
      { label: 'Total questions', value: fmt(totals.questions) },
      { label: 'Chapters', value: fmt(totals.chapters) },
      { label: 'Subjects', value: fmt(totals.subjects) },
      { label: 'Board × class combos', value: fmt(totals.boardClassCombinations) },
      { label: 'Avg questions / chapter', value: totals.avgQuestionsPerChapter },
      { label: 'Overall completeness', value: totals.overallCompletenessPct + '%' },
    ];
    els.stats.innerHTML = cards
      .map(function (card) {
        return (
          '<div class="exi-stat">' +
          '<div class="exi-stat-value exi-num">' + card.value + '</div>' +
          '<div class="exi-stat-label">' + esc(card.label) + '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function skeletonCoverage() {
    var html = '';
    for (var i = 0; i < 3; i++) {
      html += '<div class="exi-skeleton" style="height:34px;margin:10px 0;"></div>';
    }
    els.coverage.innerHTML = html;
  }

  function renderCoverage(coverage) {
    if (!coverage.length) {
      els.coverage.innerHTML =
        '<div class="exi-empty exi-empty--inline">' +
        '<p class="exi-empty-title">No chapters in the bank yet</p>' +
        '</div>';
      return;
    }
    els.coverage.innerHTML =
      '<div class="exi-table-wrap"><table class="exi-table">' +
      '<thead><tr><th>Board</th><th>Class</th>' +
      '<th class="exi-num">Chapters</th><th class="exi-num">Questions</th></tr></thead>' +
      '<tbody>' +
      coverage
        .map(function (row) {
          return (
            '<tr>' +
            '<td class="exi-cell-strong">' + esc(row.board) + '</td>' +
            '<td>Class ' + esc(row['class']) + '</td>' +
            '<td class="exi-num">' + fmt(row.chapterCount) + '</td>' +
            '<td class="exi-num">' + fmt(row.questionCount) + '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table></div>';
  }

  function skeletonCompleteness() {
    var html = '';
    for (var i = 0; i < 8; i++) {
      html += '<div class="exi-skeleton" style="height:38px;margin:10px 0;"></div>';
    }
    els.completeness.innerHTML = html;
  }

  function progressRow(row) {
    var width = Math.max(0, Math.min(100, row.percent));
    return (
      '<div class="exi-progress-row">' +
      '<div class="exi-progress-info">' +
      '<span class="exi-progress-name">' + esc(row.name) + '</span>' +
      '<span class="exi-progress-sub">' + esc(row.subject) + ' · ' + esc(row.board) + '</span>' +
      '</div>' +
      '<div class="exi-progress-track">' +
      '<div class="exi-progress-fill" style="width:' + width + '%"></div>' +
      '</div>' +
      '<div class="exi-progress-value exi-num">' + row.questionCount + '/' + row.targetQuestions +
      ' · ' + row.percent + '%</div>' +
      '</div>'
    );
  }

  function renderCompleteness(list) {
    if (!list.length) {
      els.completeness.innerHTML =
        '<div class="exi-empty exi-empty--inline">' +
        '<p class="exi-empty-title">No chapters to measure</p>' +
        '</div>';
      return;
    }
    els.completeness.innerHTML = list.map(progressRow).join('');
  }

  function load() {
    skeletonStats();
    skeletonCoverage();
    skeletonCompleteness();
    window.exiApi
      .get('api/analytics/bank-health')
      .then(function (res) {
        renderTotals(res.data.totals);
        renderCoverage(res.data.coverage);
        renderCompleteness(res.data.completeness);
        var target = res.meta && res.meta.config ? res.meta.config.chapterTargetQuestions : null;
        if (els.target && target != null) els.target.textContent = target;
      })
      .catch(function (err) {
        els.stats.innerHTML =
          '<div class="exi-stat exi-empty exi-empty--inline" style="grid-column:1/-1;">' +
          '<p class="exi-empty-title">Could not load bank health</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p>' +
          '</div>';
        els.coverage.innerHTML = '';
        els.completeness.innerHTML = '';
      });
  }

  load();
})();
