/* Class Analytics - teacher-facing cohort view.
   Sources:
     GET /api/classes
     GET /api/classes/:id/analytics                                     */
(function () {
  'use strict';

  var els = {
    classSel: document.getElementById('exi-filter-class-section'),
    stats: document.getElementById('exi-ca-stats'),
    mix: document.getElementById('exi-ca-mix'),
    strong: document.getElementById('exi-ca-strong'),
    strongNote: document.getElementById('exi-ca-strong-note'),
    weak: document.getElementById('exi-ca-weak'),
    weakNote: document.getElementById('exi-ca-weak-note'),
    roster: document.getElementById('exi-ca-roster'),
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function statusSlug(label) {
    return String(label || '').toLowerCase().replace(/\s+/g, '-');
  }

  /* ---- loading ------------------------------------------------------------ */

  function skeletonAll() {
    var statHtml = '';
    for (var i = 0; i < 6; i++) {
      statHtml +=
        '<div class="exi-stat">' +
        '<div class="exi-skeleton" style="height:28px;width:60px;margin-bottom:8px;"></div>' +
        '<div class="exi-skeleton" style="height:11px;width:90px;"></div></div>';
    }
    els.stats.innerHTML = statHtml;
    els.mix.innerHTML =
      '<div class="exi-skeleton" style="height:14px;margin-bottom:12px;"></div>' +
      '<div class="exi-skeleton" style="height:16px;width:70%;"></div>';
    els.strong.innerHTML = '<li class="exi-flag-item exi-muted">Loading&hellip;</li>';
    els.weak.innerHTML = '<li class="exi-flag-item exi-muted">Loading&hellip;</li>';
    var rosterRows = '';
    for (var j = 0; j < 6; j++) {
      rosterRows += '<div class="exi-skeleton" style="height:34px;margin:10px 0;"></div>';
    }
    els.roster.innerHTML = rosterRows;
  }

  /* ---- render --------------------------------------------------------------- */

  function renderStats(totals) {
    var cards = [
      { label: 'Average score', value: totals.aggregateScorePct + '%' },
      { label: 'Mean student score', value: totals.meanStudentScorePct + '%' },
      { label: 'Students', value: fmt(totals.students) },
      { label: 'Answers analyzed', value: fmt(totals.answers) },
      { label: 'Exams covered', value: fmt(totals.examsCovered) },
      { label: 'Chapters assessed', value: fmt(totals.chaptersAssessed) },
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

  function renderMix(mix) {
    var totalStudents = mix.reduce(function (sum, band) { return sum + band.count; }, 0);
    if (!totalStudents) {
      els.mix.innerHTML = '<p class="exi-muted">No students in this class yet.</p>';
      return;
    }
    var segments = mix
      .filter(function (band) { return band.count > 0; })
      .map(function (band) {
        var widthPct = Math.round((band.count / totalStudents) * 1000) / 10;
        return (
          '<div class="exi-stack-seg exi-tone-' + statusSlug(band.label) +
          '" style="width:' + widthPct + '%" title="' + esc(band.label) + ': ' + band.count + '"></div>'
        );
      })
      .join('');
    var legend = mix
      .map(function (band) {
        return (
          '<span class="exi-legend-item"><span class="exi-dot exi-tone-' + statusSlug(band.label) +
          '"></span>' + esc(band.label) + ' <span class="exi-num">× ' + fmt(band.count) + '</span></span>'
        );
      })
      .join('');
    els.mix.innerHTML =
      '<div class="exi-stack">' + segments + '</div>' +
      '<div class="exi-legend">' + legend + '</div>';
  }

  function flagItems(rows, kind) {
    if (!rows.length) return '<li class="exi-flag-item exi-muted">None right now</li>';
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

  function renderRoster(roster) {
    if (!roster.length) {
      els.roster.innerHTML =
        '<div class="exi-empty exi-empty--inline"><p class="exi-empty-title">No students found</p></div>';
      return;
    }
    els.roster.innerHTML =
      '<div class="exi-table-wrap"><table class="exi-table">' +
      '<thead><tr><th>Student</th><th class="exi-num">Score</th><th>Readiness</th>' +
      '<th class="exi-num">Marks</th><th class="exi-num">Answers</th></tr></thead><tbody>' +
      roster
        .map(function (row) {
          return (
            '<tr>' +
            '<td class="exi-cell-strong">' + esc(row.name) + '</td>' +
            '<td class="exi-num exi-cell-strong">' + row.scorePct + '%</td>' +
            '<td><span class="exi-status exi-status--sm exi-status--' + statusSlug(row.readiness) + '">' +
            esc(row.readiness) + '</span></td>' +
            '<td class="exi-num">' + fmt(row.marksAwarded) + '/' + fmt(row.marksPossible) + '</td>' +
            '<td class="exi-num">' + fmt(row.answers) + '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table></div>';
  }

  function render(res) {
    var data = res.data;
    var cfg = res.meta.config || {};
    renderStats(data.totals);
    renderMix(data.readinessMix);

    var strongThreshold = Number(cfg.strongChapterPct != null ? cfg.strongChapterPct : 80);
    var weakThreshold = Number(cfg.weakChapterPct != null ? cfg.weakChapterPct : 60);
    els.strongNote.textContent =
      'Class mastery at or above ' + strongThreshold + '% across ' +
      data.totals.students + ' students.';
    els.weakNote.textContent =
      'Class mastery below ' + weakThreshold + '% — weakest listed first.';
    els.strong.innerHTML = flagItems(data.strongAreas, 'ok');
    els.weak.innerHTML = flagItems(data.needsImprovement, 'warn');
    renderRoster(data.roster);
    window.exiRefreshIcons();
  }

  /* ---- wiring ------------------------------------------------------------ */

  function loadClasses() {
    return window.exiApi
      .get('api/classes')
      .then(function (res) {
        if (!res.data.length) {
          els.classSel.innerHTML = '<option value="">No classes yet</option>';
          return null;
        }
        els.classSel.innerHTML = res.data
          .map(function (cls) {
            return (
              '<option value="' + esc(cls.id) + '">Class ' + esc(cls['class']) +
              ' · Section ' + esc(cls.section) + ' (' + cls.studentCount + ')</option>'
            );
          })
          .join('');
        return res.data[0].id;
      });
  }

  function load() {
    var id = els.classSel.value;
    if (!id) return;
    skeletonAll();
    window.exiApi
      .get('api/classes/' + encodeURIComponent(id) + '/analytics')
      .then(render)
      .catch(function (err) {
        els.stats.innerHTML =
          '<div class="exi-stat exi-empty exi-empty--inline" style="grid-column:1/-1;">' +
          '<p class="exi-empty-title">Could not load class analytics</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p>' +
          '</div>';
        els.mix.innerHTML = '';
        els.strong.innerHTML = '';
        els.weak.innerHTML = '';
        els.roster.innerHTML = '';
      });
  }

  els.classSel.addEventListener('change', load);
  loadClasses().then(function (firstId) {
    if (firstId) load();
  });
})();
