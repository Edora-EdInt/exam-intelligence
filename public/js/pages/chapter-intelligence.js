/* Chapter Intelligence - master/detail.
   List: GET /api/chapters (filterable). Detail: GET /api/chapters/:id/stats. */
(function () {
  'use strict';

  var els = {
    list: document.getElementById('exi-chapter-list'),
    detail: document.getElementById('exi-chapter-detail'),
    subject: document.getElementById('exi-filter-subject'),
    klass: document.getElementById('exi-filter-class'),
    board: document.getElementById('exi-filter-board'),
  };

  var chapters = [];
  var selectedId = null;

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

  function loadFilterOptions() {
    window.exiApi
      .get('api/meta')
      .then(function (res) {
        fillSelect(els.subject, res.data.subjects, 'All subjects');
        fillSelect(els.klass, res.data.classes, 'All classes');
        fillSelect(els.board, res.data.boards, 'All boards');
      })
      .catch(function () {
        /* selects remain on "All" */
      });
  }

  function queryParams() {
    var params = new URLSearchParams();
    if (els.subject.value) params.set('subject', els.subject.value);
    if (els.klass.value) params.set('class', els.klass.value);
    if (els.board.value) params.set('board', els.board.value);
    var query = params.toString();
    return query ? '?' + query : '';
  }

  /* ---- list ------------------------------------------------------------ */

  function skeletonList() {
    var html = '';
    for (var i = 0; i < 6; i++) html += '<div class="exi-skeleton exi-skeleton-row"></div>';
    els.list.innerHTML = html;
  }

  function emptyList() {
    els.list.innerHTML =
      '<div class="exi-empty exi-empty--inline">' +
      '<p class="exi-empty-title">No chapters match these filters</p>' +
      '<p class="exi-empty-text">Try clearing one of the subject, class or board filters.</p>' +
      '</div>';
  }

  function renderList() {
    els.list.innerHTML = chapters
      .map(function (ch) {
        var isActive = ch.id === selectedId;
        return (
          '<button type="button" class="exi-list-item' + (isActive ? ' is-selected' : '') +
          '" data-chapter-id="' + esc(ch.id) + '">' +
          '<span class="exi-list-item-main">' +
          '<span class="exi-list-item-title">' + esc(ch.name) + '</span>' +
          '<span class="exi-list-item-sub">' + esc(ch.subject) + ' · ' + esc(ch.board) +
          ' · Class ' + esc(ch['class']) + '</span>' +
          '</span>' +
          '<span class="exi-list-item-meta exi-num">' + fmt(ch.totalQuestions) + ' Q · ' +
          fmt(ch.totalMarksCoverage) + ' marks</span>' +
          '</button>'
        );
      })
      .join('');
  }

  function loadList() {
    selectedId = null;
    skeletonList();
    window.exiApi
      .get('api/chapters' + queryParams())
      .then(function (res) {
        chapters = res.data;
        if (!chapters.length) {
          emptyList();
          els.detail.innerHTML =
            '<div class="exi-empty">' +
            '<p class="exi-empty-title">No chapter selected</p>' +
            '<p class="exi-empty-text">Adjust the filters to see chapters.</p>' +
            '</div>';
          return;
        }
        renderList();
        var hashed = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
        var nextId = chapters.some(function (c) { return c.id === hashed; })
          ? hashed
          : chapters[0].id;
        selectChapter(nextId);
      })
      .catch(function (err) {
        els.list.innerHTML =
          '<div class="exi-empty exi-empty--inline">' +
          '<p class="exi-empty-title">Could not load chapters</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p>' +
          '</div>';
      });
  }

  /* ---- detail ----------------------------------------------------------- */

  function detailSkeleton() {
    var lines = '';
    for (var i = 0; i < 6; i++) lines += '<div class="exi-skeleton exi-skeleton-line"></div>';
    els.detail.innerHTML = '<div class="exi-skeleton exi-skeleton-title"></div>' + lines;
  }

  function barRow(label, count, pct) {
    var width = Math.max(0, Math.min(100, pct));
    return (
      '<div class="exi-bar-row">' +
      '<div class="exi-bar-row-top"><span>' + esc(label) + '</span>' +
      '<span class="exi-num">' + fmt(count) + ' · ' + pct + '%</span></div>' +
      '<div class="exi-bar-track"><div class="exi-bar-fill" style="width:' + width + '%"></div></div>' +
      '</div>'
    );
  }

  function renderDetail(data) {
    var ch = data.chapter;
    var chips = [ch.subject, ch.board, 'Class ' + ch['class']]
      .map(function (chip) { return '<span class="exi-chip">' + esc(chip) + '</span>'; })
      .join('');

    var typeBars = data.typeDistribution
      .map(function (t) { return barRow(t.key + ' questions', t.count, t.pct); })
      .join('');

    var segments = data.difficultyDistribution
      .map(function (seg) {
        return (
          '<div class="exi-stack-seg exi-tone-' + seg.key.toLowerCase() +
          '" style="width:' + seg.pct + '%" title="' + esc(seg.key) + ': ' + seg.pct + '%"></div>'
        );
      })
      .join('');

    var legend = data.difficultyDistribution
      .map(function (seg) {
        return (
          '<span class="exi-legend-item"><span class="exi-dot exi-tone-' + seg.key.toLowerCase() +
          '"></span>' + esc(seg.key) + ' <span class="exi-num">' + fmt(seg.count) +
          ' (' + seg.pct + '%)</span></span>'
        );
      })
      .join('');

    var hasQuestions = data.questionCount > 0;

    els.detail.innerHTML =
      '<header class="exi-detail-head">' +
      '<h2 class="exi-detail-title">' + esc(ch.name) + '</h2>' +
      '<div class="exi-chip-row">' + chips + '</div>' +
      '</header>' +
      '<dl class="exi-stat-inline">' +
      '<div><dt>Questions</dt><dd class="exi-num">' + fmt(data.questionCount) + '</dd></div>' +
      '<div><dt>Marks coverage</dt><dd class="exi-num">' + fmt(data.totalMarks) + '</dd></div>' +
      '</dl>' +
      '<section class="exi-detail-section">' +
      '<h3 class="exi-section-title">Question type distribution</h3>' +
      (hasQuestions ? typeBars : '<p class="exi-muted">No questions in this chapter yet.</p>') +
      '</section>' +
      '<section class="exi-detail-section">' +
      '<h3 class="exi-section-title">Difficulty mix</h3>' +
      (hasQuestions
        ? '<div class="exi-stack">' + segments + '</div><div class="exi-legend">' + legend + '</div>'
        : '<p class="exi-muted">No questions in this chapter yet.</p>') +
      '</section>';
  }

  function selectChapter(id) {
    selectedId = id;
    Array.prototype.forEach.call(els.list.querySelectorAll('.exi-list-item'), function (btn) {
      btn.classList.toggle('is-selected', btn.getAttribute('data-chapter-id') === id);
    });
    try {
      history.replaceState(null, '', '#' + encodeURIComponent(id));
    } catch (_) {}
    detailSkeleton();
    window.exiApi
      .get('api/chapters/' + encodeURIComponent(id) + '/stats')
      .then(renderDetail)
      .catch(function (err) {
        els.detail.innerHTML =
          '<div class="exi-empty">' +
          '<p class="exi-empty-title">Could not load chapter stats</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p>' +
          '</div>';
      });
  }

  /* ---- wiring ------------------------------------------------------------ */

  [els.subject, els.klass, els.board].forEach(function (select) {
    select.addEventListener('change', loadList);
  });

  els.list.addEventListener('click', function (event) {
    var btn = event.target.closest('.exi-list-item');
    if (btn) selectChapter(btn.getAttribute('data-chapter-id'));
  });

  loadFilterOptions();
  loadList();
})();
