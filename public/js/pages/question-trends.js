/* Question Trends - ranked "most tested concepts".
   Source: GET /api/analytics/concept-trends (aggregate of ExamRecord x Question). */
(function () {
  'use strict';

  var bodyEl = document.getElementById('exi-trends-body');
  var subjectSel = document.getElementById('exi-filter-subject');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function fillSelect(select, values, allLabel) {
    var current = select.value;
    var options = ['<option value="">' + esc(allLabel) + '</option>'];
    values.forEach(function (value) {
      options.push('<option value="' + esc(value) + '">' + esc(value) + '</option>');
    });
    select.innerHTML = options.join('');
    if (values.indexOf(current) !== -1) select.value = current;
  }

  function skeleton() {
    var html = '';
    for (var i = 0; i < 8; i++) {
      html += '<div class="exi-skeleton" style="height:34px;margin:10px 0;"></div>';
    }
    bodyEl.innerHTML = html;
  }

  function trendCell(item) {
    if (item.direction === 'up') {
      var upDelta = item.deltaPct == null ? 'rising' : '+' + item.deltaPct + '%';
      return (
        '<span class="exi-trend exi-trend--up"><i data-lucide="trending-up"></i>' +
        esc(upDelta) + '</span>'
      );
    }
    if (item.direction === 'down') {
      var downDelta = item.deltaPct == null ? 'falling' : item.deltaPct + '%';
      return (
        '<span class="exi-trend exi-trend--down"><i data-lucide="trending-down"></i>' +
        esc(downDelta) + '</span>'
      );
    }
    return '<span class="exi-trend exi-trend--flat"><i data-lucide="minus"></i>stable</span>';
  }

  function rowHtml(item) {
    return (
      '<tr>' +
      '<td class="exi-num">' + item.rank + '</td>' +
      '<td class="exi-cell-strong">' + esc(item.concept) + '</td>' +
      '<td>' + esc(item.subject) + '</td>' +
      '<td class="exi-num">' + fmt(item.bankQuestions) + '</td>' +
      '<td class="exi-num exi-cell-strong">' + fmt(item.appearances) + '</td>' +
      '<td>' + trendCell(item) + '</td>' +
      '</tr>'
    );
  }

  function render(res) {
    if (!res.data.length) {
      bodyEl.innerHTML =
        '<div class="exi-empty exi-empty--inline">' +
        '<p class="exi-empty-title">No concepts found</p>' +
        '<p class="exi-empty-text">No exam records match this subject filter yet.</p>' +
        '</div>';
      return;
    }
    var years = res.meta.yearsTracked || [];
    var yearsLabel = years.length ? years.join(' – ') : '';
    bodyEl.innerHTML =
      (yearsLabel
        ? '<p class="exi-range-note">Exam records covered: <span class="exi-num">' +
          esc(yearsLabel) + '</span>. Trend compares the later vs earlier exam years.</p>'
        : '') +
      '<div class="exi-table-wrap"><table class="exi-table">' +
      '<thead><tr>' +
      '<th class="exi-num">#</th><th>Concept</th><th>Subject</th>' +
      '<th class="exi-num">In bank</th><th class="exi-num">Exam appearances</th><th>Trend</th>' +
      '</tr></thead><tbody>' +
      res.data.map(rowHtml).join('') +
      '</tbody></table></div>';
    window.exiRefreshIcons();
  }

  function load() {
    skeleton();
    var query = subjectSel.value ? '?subject=' + encodeURIComponent(subjectSel.value) : '';
    window.exiApi
      .get('api/analytics/concept-trends' + query)
      .then(render)
      .catch(function (err) {
        bodyEl.innerHTML =
          '<div class="exi-empty exi-empty--inline">' +
          '<p class="exi-empty-title">Could not load concept trends</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p>' +
          '</div>';
      });
  }

  window.exiApi
    .get('api/meta')
    .then(function (res) {
      fillSelect(subjectSel, res.data.subjects, 'All subjects');
    })
    .catch(function () {});

  subjectSel.addEventListener('change', load);
  load();
})();
