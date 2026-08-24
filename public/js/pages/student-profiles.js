/* Student Profiles - searchable list + profile detail + practice generator.
   Sources:
     GET /api/students
     GET /api/students/:id/summary
     GET /api/students/:id/chapter-mastery  (also drives strengths/weaknesses)
     GET /api/students/:id/error-breakdown
     POST /api/practice/generate                                               */
(function () {
  'use strict';

  var els = {
    search: document.getElementById('exi-student-search'),
    classSel: document.getElementById('exi-filter-class'),
    sectionSel: document.getElementById('exi-filter-section'),
    list: document.getElementById('exi-student-list'),
    detail: document.getElementById('exi-student-detail'),
    practiceBar: document.getElementById('exi-practice-bar'),
    practiceCount: document.getElementById('exi-practice-count'),
    practiceBtn: document.getElementById('exi-practice-generate'),
    practiceSlot: document.getElementById('exi-practice-result-slot'),
  };

  var students = [];
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
        fillSelect(els.classSel, res.data.classes || [], 'All classes');
        fillSelect(els.sectionSel, res.data.sections || [], 'All sections');
      })
      .catch(function () {});
  }

  /* ---- list -------------------------------------------------------------- */

  function visibleStudents() {
    var query = els.search.value.trim().toLowerCase();
    return students.filter(function (student) {
      if (query && student.name.toLowerCase().indexOf(query) === -1) return false;
      if (els.classSel.value && String(student['class']) !== els.classSel.value) return false;
      if (els.sectionSel.value && student.section !== els.sectionSel.value) return false;
      return true;
    });
  }

  function skeletonList() {
    var html = '';
    for (var i = 0; i < 7; i++) html += '<div class="exi-skeleton exi-skeleton-row"></div>';
    els.list.innerHTML = html;
  }

  function renderList() {
    var visible = visibleStudents();
    if (!visible.length) {
      els.list.innerHTML =
        '<div class="exi-empty exi-empty--inline">' +
        '<p class="exi-empty-title">No students match</p>' +
        '<p class="exi-empty-text">Adjust the search text or class/section filters.</p>' +
        '</div>';
      return;
    }
    els.list.innerHTML = visible
      .map(function (student) {
        var isActive = student.id === selectedId;
        return (
          '<button type="button" class="exi-list-item' + (isActive ? ' is-selected' : '') +
          '" data-student-id="' + esc(student.id) + '">' +
          '<span class="exi-list-item-main">' +
          '<span class="exi-list-item-title">' + esc(student.name) + '</span>' +
          '<span class="exi-list-item-sub">Class ' + esc(student['class']) +
          ' · Section ' + esc(student.section) + '</span>' +
          '</span>' +
          '<span class="exi-list-item-meta">' + esc(student.id) + '</span>' +
          '</button>'
        );
      })
      .join('');
  }

  function fetchList() {
    skeletonList();
    return window.exiApi
      .get('api/students')
      .then(function (res) {
        students = res.data;
        renderList();
        var hashed = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
        var nextId =
          students.some(function (s) { return s.id === hashed; })
            ? hashed
            : students[0]
            ? students[0].id
            : null;
        if (nextId) selectStudent(nextId);
        else renderPrompt();
      })
      .catch(function (err) {
        els.list.innerHTML =
          '<div class="exi-empty exi-empty--inline">' +
          '<p class="exi-empty-title">Could not load students</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p>' +
          '</div>';
      });
  }

  /* ---- detail ------------------------------------------------------------ */

  function detailSkeleton() {
    var lines = '';
    for (var i = 0; i < 7; i++) lines += '<div class="exi-skeleton exi-skeleton-line"></div>';
    els.detail.innerHTML = '<div class="exi-skeleton exi-skeleton-title"></div>' + lines;
  }

  function renderPrompt() {
    els.practiceBar.hidden = true;
    els.detail.innerHTML =
      '<div class="exi-empty">' +
      '<p class="exi-empty-title">No student selected</p>' +
      '<p class="exi-empty-text">Pick a student from the list to see their profile.</p>' +
      '</div>';
  }

  function statusSlug(label) {
    return String(label || '').toLowerCase().replace(/\s+/g, '-');
  }

  function progressRow(row) {
    var width = Math.max(0, Math.min(100, row.masteryPct));
    return (
      '<div class="exi-progress-row">' +
      '<div class="exi-progress-info">' +
      '<span class="exi-progress-name">' + esc(row.chapterName) + '</span>' +
      '<span class="exi-progress-sub">' + esc(row.subject) + ' · ' + row.questionsAnswered +
      (row.questionsAnswered === 1 ? ' question' : ' questions') + ' answered</span>' +
      '</div>' +
      '<div class="exi-progress-track">' +
      '<div class="exi-progress-fill" style="width:' + width + '%"></div>' +
      '</div>' +
      '<div class="exi-progress-value exi-num">' + fmt(row.marksEarned) + '/' +
      fmt(row.marksPossible) + ' · ' + row.masteryPct + '%</div>' +
      '</div>'
    );
  }

  function flagList(rows, kind) {
    if (!rows.length) {
      return '<li class="exi-flag-item exi-muted">None yet</li>';
    }
    var icon = kind === 'ok' ? 'check' : 'flag';
    return rows
      .map(function (row) {
        return (
          '<li class="exi-flag-item exi-flag--' + kind + '">' +
          '<i data-lucide="' + icon + '"></i>' +
          '<span>' + esc(row.chapterName) + '</span>' +
          '<span class="exi-num">' + row.masteryPct + '%</span>' +
          '</li>'
        );
      })
      .join('');
  }

  function errorBarRow(row) {
    return (
      '<div class="exi-bar-row">' +
      '<div class="exi-bar-row-top"><span>' + esc(row.label) + '</span>' +
      '<span class="exi-num">' + fmt(row.count) + ' · ' + row.pct + '%</span></div>' +
      '<div class="exi-bar-track"><div class="exi-bar-fill" style="width:' +
      Math.max(0, Math.min(100, row.pct)) + '%"></div></div>' +
      '</div>'
    );
  }

  function renderProfile(summaryRes, masteryRes, errorRes) {
    var summary = summaryRes.data;
    var mastery = masteryRes.data;
    var errors = errorRes.data;
    var mCfg = masteryRes.meta.config || {};
    var student = summary.student;
    var readiness = summary.readiness;

    var chips =
      '<span class="exi-chip">Class ' + esc(student['class']) + '</span>' +
      '<span class="exi-chip">Section ' + esc(student.section) + '</span>';

    var t = summary.totals;
    var stats =
      '<dl class="exi-stat-inline">' +
      '<div><dt>Overall score</dt><dd class="exi-num">' + t.scorePct + '%</dd></div>' +
      '<div><dt>Answers</dt><dd class="exi-num">' + fmt(t.answers) + '</dd></div>' +
      '<div><dt>Correct</dt><dd class="exi-num">' + fmt(t.correct) + '</dd></div>' +
      '<div><dt>Mistakes</dt><dd class="exi-num">' + fmt(t.incorrect) + '</dd></div>' +
      '<div><dt>Exams taken</dt><dd class="exi-num">' + fmt(t.examsTaken) + '</dd></div>' +
      '</dl>';

    var readinessBand =
      '<section class="exi-detail-section">' +
      '<h3 class="exi-section-title">Exam readiness</h3>' +
      '<span class="exi-status exi-status--' + statusSlug(readiness.label) + '">' +
      esc(readiness.label) + ' · ' + t.scorePct + '%</span>' +
      '</section>';

    var masterySection;
    if (!mastery.chapters.length) {
      masterySection =
        '<section class="exi-detail-section"><h3 class="exi-section-title">Chapter mastery</h3>' +
        '<p class="exi-muted">No answered exam questions for this student yet.</p></section>';
    } else {
      masterySection =
        '<section class="exi-detail-section"><h3 class="exi-section-title">Chapter mastery</h3>' +
        '<p class="exi-range-note">Weakest first · mastery = earned ÷ possible marks.</p>' +
        mastery.chapters.map(progressRow).join('') +
        '</section>';
    }

    var flagsSection =
      '<section class="exi-detail-section"><h3 class="exi-section-title">Strengths &amp; weaknesses</h3>' +
      '<div class="exi-cols-2">' +
      '<div class="exi-mini-panel">' +
      '<div class="exi-mini-title"><i data-lucide="check"></i>Strong areas · ≥ ' +
      Number(mCfg.strongChapterPct != null ? mCfg.strongChapterPct : 80) + '%</div>' +
      '<ul class="exi-flag-list">' + flagList(mastery.strongAreas, 'ok') + '</ul>' +
      '</div>' +
      '<div class="exi-mini-panel">' +
      '<div class="exi-mini-title"><i data-lucide="flag"></i>Needs improvement · &lt; ' +
      Number(mCfg.weakChapterPct != null ? mCfg.weakChapterPct : 60) + '%</div>' +
      '<ul class="exi-flag-list">' + flagList(mastery.needsImprovement, 'warn') + '</ul>' +
      '</div>' +
      '</div></section>';

    var errorSection;
    if (!errors.totals.mistakes) {
      errorSection =
        '<section class="exi-detail-section"><h3 class="exi-section-title">Error intelligence</h3>' +
        '<p class="exi-muted">No mistakes recorded — nothing to diagnose yet.</p></section>';
    } else {
      var mostCommon = errors.mostCommon
        ? '<p class="exi-range-note">Most common: <strong>' + esc(errors.mostCommon.label) +
          '</strong> (' + fmt(errors.mostCommon.count) + ' of ' + fmt(errors.totals.mistakes) +
          ' mistakes).</p>'
        : '';
      errorSection =
        '<section class="exi-detail-section"><h3 class="exi-section-title">Error intelligence</h3>' +
        mostCommon +
        errors.errorTypes.map(errorBarRow).join('') +
        '</section>';
    }

    els.detail.innerHTML =
      '<header class="exi-detail-head">' +
      '<h2 class="exi-detail-title">' + esc(student.name) + '</h2>' +
      '<div class="exi-chip-row">' + chips +
      '<span class="exi-status exi-status--sm exi-status--' + statusSlug(readiness.label) + '">' +
      esc(readiness.label) + '</span>' +
      '</div>' +
      '</header>' +
      stats +
      readinessBand +
      masterySection +
      flagsSection +
      errorSection;

    window.exiRefreshIcons();
  }

  function selectStudent(id) {
    selectedId = id;
    els.practiceBar.hidden = false;
    els.practiceSlot.innerHTML = '';
    Array.prototype.forEach.call(els.list.querySelectorAll('.exi-list-item'), function (btn) {
      btn.classList.toggle('is-selected', btn.getAttribute('data-student-id') === id);
    });
    try {
      history.replaceState(null, '', '#' + encodeURIComponent(id));
    } catch (_) {}
    detailSkeleton();
    window.Promise.all([
      window.exiApi.get('api/students/' + encodeURIComponent(id) + '/summary'),
      window.exiApi.get('api/students/' + encodeURIComponent(id) + '/chapter-mastery'),
      window.exiApi.get('api/students/' + encodeURIComponent(id) + '/error-breakdown'),
    ])
      .then(function (results) {
        renderProfile(results[0], results[1], results[2]);
      })
      .catch(function (err) {
        els.detail.innerHTML =
          '<div class="exi-empty">' +
          '<p class="exi-empty-title">Could not load this profile</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p>' +
          '</div>';
      });
  }

  /* ---- practice generator ------------------------------------------------- */

  function setPracticeBusy(busy) {
    els.practiceBtn.disabled = busy;
    els.practiceBtn.innerHTML = busy
      ? 'Generating&hellip;'
      : '<i data-lucide="shuffle"></i>Generate Practice Test';
    window.exiRefreshIcons();
  }

  function generatePractice() {
    if (!selectedId) return;
    var count = Math.max(1, parseInt(els.practiceCount.value, 10) || 10);
    setPracticeBusy(true);
    window.exiApi
      .post('api/practice/generate', { studentId: selectedId, questionCount: count })
      .then(function (result) {
        window.exiRenderPractice(els.practiceSlot, result);
        els.practiceSlot.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) {
        els.practiceSlot.innerHTML =
          '<div class="exi-empty"><p class="exi-empty-title">Could not generate a practice set</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p></div>';
      })
      .finally(function () {
        setPracticeBusy(false);
      });
  }

  els.practiceBtn.addEventListener('click', generatePractice);

  /* ---- wiring ------------------------------------------------------------ */

  [els.classSel, els.sectionSel].forEach(function (select) {
    select.addEventListener('change', renderList);
  });

  var searchTimer = null;
  els.search.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 120);
  });

  els.list.addEventListener('click', function (event) {
    var btn = event.target.closest('.exi-list-item');
    if (btn) selectStudent(btn.getAttribute('data-student-id'));
  });

  loadFilterOptions();
  fetchList();
})();
