/* Exam Pattern Intelligence - typical chapter weightage.
   Source: GET /api/analytics/chapter-weightage. */
(function () {
  'use strict';

  var bodyEl = document.getElementById('exi-weightage-body');
  var subjectSel = document.getElementById('exi-filter-subject');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
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
    for (var i = 0; i < 9; i++) {
      html += '<div class="exi-skeleton" style="height:44px;margin:12px 0;"></div>';
    }
    bodyEl.innerHTML = html;
  }

  function pct(value, scale) {
    return Math.round((value / scale) * 10000) / 100;
  }

  function rowHtml(item, scale) {
    var sub =
      esc(item.subject) + ' · ' + esc(item.board) + ' · Class ' + esc(item['class']) +
      ' · seen in ' + item.examsAppearedIn + (item.examsAppearedIn === 1 ? ' exam' : ' exams');

    var track = '';
    var value;
    if (item.minMarks == null) {
      value = '<div class="exi-range-value">&mdash;<span>no exam data yet</span></div>';
    } else {
      var left = pct(item.minMarks, scale);
      var width = Math.max(0.5, pct(item.maxMarks - item.minMarks, scale));
      var avgLeft = pct(item.avgMarks, scale);
      track =
        '<div class="exi-range-track">' +
        '<div class="exi-range-band" style="left:' + left + '%;width:' + width + '%"></div>' +
        '<div class="exi-range-avg" style="left:' + avgLeft + '%"></div>' +
        '</div>';
      value =
        '<div class="exi-range-value exi-num">' + item.minMarks + '&ndash;' + item.maxMarks +
        ' marks<span>avg ' + item.avgMarks +
        (item.avgSharePct == null ? '' : ' · ' + item.avgSharePct + '% of paper') + '</span></div>';
    }

    return (
      '<div class="exi-range-row">' +
      '<div class="exi-range-info">' +
      '<span class="exi-range-name">' + esc(item.name) + '</span>' +
      '<span class="exi-range-sub">' + sub + '</span>' +
      '</div>' +
      track +
      value +
      '</div>'
    );
  }

  function render(res) {
    if (!res.data.length) {
      bodyEl.innerHTML =
        '<div class="exi-empty exi-empty--inline">' +
        '<p class="exi-empty-title">No chapters found</p>' +
        '<p class="exi-empty-text">No chapters match this subject filter.</p>' +
        '</div>';
      return;
    }
    var scale = res.data.reduce(function (max, item) {
      return item.maxMarks != null && item.maxMarks > max ? item.maxMarks : max;
    }, 0);
    if (!scale) {
      bodyEl.innerHTML =
        '<div class="exi-empty exi-empty--inline">' +
        '<p class="exi-empty-title">No exam data yet</p>' +
        '<p class="exi-empty-text">Weightage appears once past exams reference these chapters.</p>' +
        '</div>';
      return;
    }
    bodyEl.innerHTML = res.data.map(function (item) { return rowHtml(item, scale); }).join('');
  }

  function load() {
    skeleton();
    var query = subjectSel.value ? '?subject=' + encodeURIComponent(subjectSel.value) : '';
    window.exiApi
      .get('api/analytics/chapter-weightage' + query)
      .then(render)
      .catch(function (err) {
        bodyEl.innerHTML =
          '<div class="exi-empty exi-empty--inline">' +
          '<p class="exi-empty-title">Could not load chapter weightage</p>' +
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
