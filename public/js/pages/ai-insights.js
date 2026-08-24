/* AI Insights (Teacher Assistant) - preset questions -> structured,
   rules-based backend answers. No free-form chat: each button maps to one
   endpoint so every answer stays explainable.
   Sources:
     GET /api/insights/class/:id
     GET /api/insights/students-at-risk/:classId
     GET /api/insights/mistake-profile/:classId                              */
(function () {
  'use strict';

  var els = {
    classSel: document.getElementById('exi-class-select'),
    output: document.getElementById('exi-assistant-output'),
    reviseBtn: document.getElementById('exi-preset-revise'),
    riskBtn: document.getElementById('exi-preset-risk'),
    mistakesBtn: document.getElementById('exi-preset-mistakes'),
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  /* ---- shared answer scaffolding ---------------------------------------- */

  var PRESET_META = {
    revise: {
      title: 'Which chapters should I revise before boards?',
      icon: 'flag',
      empty: 'No struggling chapters match the rules for this class right now.',
      ruleNote: 'Rule: chapter class mastery below the struggle threshold AND above-median exam weightage. Severity is high when mastery is far below the threshold or most students are under it.',
    },
    risk: {
      title: 'Which students need attention?',
      icon: 'users',
      empty: 'Every student in this class is in the top readiness band.',
      ruleNote: 'Rule: students outside the top readiness band are listed, weakest first, with their weakest chapters and dominant error type.',
    },
    mistakes: {
      title: 'What kind of mistakes is the class making?',
      icon: 'clipboard-list',
      empty: 'No mistake data available for this class.',
      ruleNote: 'Rule: mistake density per subject = incorrect ÷ analyzed answers; dominant error = most frequent recorded errorType.',
    },
  };

  function answerShell(kind, bodyHtml) {
    var meta = PRESET_META[kind];
    return (
      '<article class="exi-answer">' +
      '<div class="exi-answer-head">' +
      '<h3><i data-lucide="' + meta.icon + '" style="vertical-align:-2px"></i> ' + esc(meta.title) + '</h3>' +
      '<span class="exi-pill">Class ' + esc(els.classSel.value) + '</span>' +
      '</div>' +
      bodyHtml +
      '<p class="exi-rule-note">' + esc(meta.ruleNote) + '</p>' +
      '</article>'
    );
  }

  function renderError(err) {
    els.output.innerHTML =
      '<div class="exi-empty"><p class="exi-empty-title">Query failed</p>' +
      '<p class="exi-empty-text">' + esc(err.message) + '</p></div>';
  }

  function setLoading() {
    els.output.innerHTML =
      '<p class="exi-note" style="margin-bottom:0">Working&hellip;</p>';
  }

  /* ---- renderer 1 · chapters to revise ----------------------------------- */

  function insightCard(insight) {
    var reasons = insight.reasons
      .map(function (reason) {
        return (
          '<li>' + esc(reason.label) +
          '<div class="exi-num">' + esc(reason.value) + '</div>' +
          '<small>' + esc(reason.detail) + '</small></li>'
        );
      })
      .join('');

    var mix = insight.difficultyMix
      .map(function (m) {
        return '<span class="exi-pill exi-q-concept">' + m.level + ' ' + m.pct + '%</span>';
      })
      .join('');

    return (
      '<article class="exi-insight-card exi-insight-card--' + esc(insight.severity) + '">' +
      '<div class="exi-insight-head">' +
      '<div><h3>' + esc(insight.headline) + '</h3>' +
      '<div class="exi-insight-subject">' + esc(insight.subject) + '</div></div>' +
      '<span class="exi-severity exi-severity--' + esc(insight.severity) + '">' + esc(insight.severity) + ' priority</span>' +
      '</div>' +
      '<ul class="exi-reasons">' + reasons + '</ul>' +
      '<div class="exi-mix"><span>Bank difficulty mix:</span>' + mix + '</div>' +
      '<div class="exi-action"><i data-lucide="target"></i>' + esc(insight.recommendedAction) + '</div>' +
      '</article>'
    );
  }

  function renderRevise(res) {
    var insights = res.data || [];
    var rule = res.meta.rule || {};
    if (!insights.length) {
      els.output.innerHTML = answerShell('revise', '<p class="exi-muted">' + esc(PRESET_META.revise.empty) + '</p>');
      window.exiRefreshIcons();
      return;
    }
    var body =
      '<p class="exi-range-note">' + insights.length + ' chapter' + (insights.length === 1 ? '' : 's') +
      ' flagged · struggle threshold &lt; ' + esc(rule.masteryBelowPct) +
      '% mastery with weightage above the median of ' + esc(rule.weightageAboveMedianAvgMarks) + ' marks.</p>' +
      '<div class="exi-insight-list">' + insights.map(insightCard).join('') + '</div>';
    els.output.innerHTML = answerShell('revise', body);
    window.exiRefreshIcons();
  }

  /* ---- renderer 2 · students at risk -------------------------------------- */

  function weakChapterList(chapters) {
    if (!chapters || !chapters.length) return '<small>No chapters under the weak threshold.</small>';
    return (
      '<small>Weakest: ' +
      chapters
        .map(function (c) {
          return esc(c.chapterName) + ' (' + c.masteryPct + '%)';
        })
        .join(' · ') +
      '</small>'
    );
  }

  function renderRisk(res) {
    var rows = res.data || [];
    if (!rows.length) {
      els.output.innerHTML = answerShell('risk', '<p class="exi-muted">' + esc(PRESET_META.risk.empty) + '</p>');
      window.exiRefreshIcons();
      return;
    }
    var items = rows
      .map(function (row, index) {
        var error = row.dominantError
          ? 'Dominant error: ' + esc(row.dominantError.label)
          : 'No dominant error type recorded';
        return (
          '<li>' +
          '<span class="exi-rank">' + (index + 1) + '</span>' +
          '<div class="exi-ranked-main">' +
          '<strong>' + esc(row.name) + '</strong>' +
          weakChapterList(row.weakChapters) +
          '</div>' +
          '<span class="exi-status exi-status--sm exi-status--at-risk">' + esc(row.readiness) + '</span>' +
          '<span class="exi-num">' + row.scorePct + '%</span>' +
          '<small style="min-width:170px;text-align:right">' + error + '</small>' +
          '</li>'
        );
      })
      .join('');
    var body =
      '<p class="exi-range-note">' + rows.length + ' student' + (rows.length === 1 ? '' : 's') +
      ' outside the top readiness band, weakest first.</p>' +
      '<ul class="exi-ranked">' + items + '</ul>';
    els.output.innerHTML = answerShell('risk', body);
    window.exiRefreshIcons();
  }

  /* ---- renderer 3 · mistake profile --------------------------------------- */

  function renderMistakes(res) {
    var payload = res.data || {};
    var subjects = payload.subjects || [];
    if (!subjects.length) {
      els.output.innerHTML = answerShell('mistakes', '<p class="exi-muted">' + esc(PRESET_META.mistakes.empty) + '</p>');
      window.exiRefreshIcons();
      return;
    }

    var blocks = subjects
      .map(function (subject) {
        var bars = subject.errorTypes
          .filter(function (e) { return e.count > 0; })
          .sort(function (a, b) { return b.count - a.count; })
          .map(function (e) {
            return (
              '<li>' +
              '<div class="exi-ranked-main"><strong>' + esc(e.label) + '</strong>' +
              '<small>' + e.count + ' of ' + fmt(subject.mistakes) + ' mistakes</small></div>' +
              '<span class="exi-num">' + e.pctOfMistakes + '%</span>' +
              '</li>'
            );
          })
          .join('');
        if (!bars) bars = '<li><span class="exi-muted">No categorized errors recorded.</span></li>';

        var dominant = subject.dominantError
          ? 'Dominant error: <strong>' + esc(subject.dominantError.label) + '</strong>'
          : 'No dominant error type';
        return (
          '<section class="exi-mini-panel" style="margin-bottom:14px">' +
          '<div class="exi-mini-title"><i data-lucide="book-open"></i>' + esc(subject.subject) + '</div>' +
          '<p class="exi-range-note">' + fmt(subject.mistakes) + ' mistakes in ' +
          fmt(subject.answersAnalyzed) + ' answers · <strong>' + subject.mistakeDensityPct +
          '% density</strong> · ' + dominant + '</p>' +
          '<ul class="exi-ranked">' + bars + '</ul>' +
          '</section>'
        );
      })
      .join('');

    var totals = payload.totals || {};
    var body =
      '<p class="exi-range-note">' + fmt(totals.mistakes) + ' mistakes across ' +
      fmt(totals.answersAnalyzed) + ' analyzed answers.</p>' + blocks;
    els.output.innerHTML = answerShell('mistakes', body);
    window.exiRefreshIcons();
  }

  /* ---- query dispatch ------------------------------------------------------ */

  var QUERIES = {
    revise: {
      run: function () {
        return window.exiApi
          .get('api/insights/class/' + encodeURIComponent(els.classSel.value))
          .then(renderRevise);
      },
      btn: function () { return els.reviseBtn; },
    },
    risk: {
      run: function () {
        return window.exiApi
          .get('api/insights/students-at-risk/' + encodeURIComponent(els.classSel.value))
          .then(renderRisk);
      },
      btn: function () { return els.riskBtn; },
    },
    mistakes: {
      run: function () {
        return window.exiApi
          .get('api/insights/mistake-profile/' + encodeURIComponent(els.classSel.value))
          .then(renderMistakes);
      },
      btn: function () { return els.mistakesBtn; },
    },
  };

  function ask(kind) {
    if (!els.classSel.value) return;
    setLoading();
    QUERIES[kind]
      .run()
      .catch(renderError)
      .finally(function () {
        window.exiRefreshIcons();
      });
  }

  Object.keys(QUERIES).forEach(function (kind) {
    var btn = QUERIES[kind].btn();
    btn.addEventListener('click', function () { ask(kind); });
  });

  els.classSel.addEventListener('change', function () {
    els.output.innerHTML = '';
  });

  /* ---- init ---------------------------------------------------------------- */

  window.exiApi
    .get('api/classes')
    .then(function (res) {
      els.classSel.innerHTML = res.data
        .map(function (klass) {
          return (
            '<option value="' + esc(klass.id) + '">Class ' + esc(klass['class']) +
            ' · Section ' + esc(klass.section) + ' (' + klass.studentCount + ')</option>'
          );
        })
        .join('');
      if (res.data.length) ask('revise');
    })
    .catch(renderError);
})();
