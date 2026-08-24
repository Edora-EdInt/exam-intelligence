/* Adaptive demo - drives the pure exiAdaptive module with buttons so the
   level logic can be verified before it is wired into a real exam flow.
   All difficulty rules live in js/exi-adaptive.js; this page only renders. */
(function () {
  'use strict';

  var els = {
    track: document.getElementById('exi-level-track'),
    stats: document.getElementById('exi-adaptive-stats'),
    log: document.getElementById('exi-answer-log'),
    correctBtn: document.getElementById('exi-btn-correct'),
    incorrectBtn: document.getElementById('exi-btn-incorrect'),
    resetBtn: document.getElementById('exi-btn-reset'),
  };

  var engine = window.exiAdaptive.create();

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function render(snapshot) {
    Array.prototype.forEach.call(els.track.querySelectorAll('.exi-level-pill'), function (pill) {
      var isActive = Number(pill.getAttribute('data-level-index')) === snapshot.levelIndex;
      pill.classList.toggle('is-active', isActive);
    });

    var accuracy = snapshot.totalAnswered
      ? Math.round((snapshot.totalCorrect / snapshot.totalAnswered) * 100)
      : 0;
    els.stats.innerHTML =
      '<div><dt>Current difficulty</dt><dd><strong>' + esc(snapshot.level) + '</strong></dd></div>' +
      '<div><dt>Next if correct</dt><dd>' + esc(snapshot.nextLevelOnCorrect) + '</dd></div>' +
      '<div><dt>Next if incorrect</dt><dd>' + esc(snapshot.nextLevelOnIncorrect) + '</dd></div>' +
      '<div><dt>Correct streak</dt><dd>' + snapshot.correctStreak + '</dd></div>' +
      '<div><dt>Answers / accuracy</dt><dd>' + snapshot.totalAnswered + ' · ' + accuracy + '%</dd></div>';
  }

  function logRow(entry) {
    var change = entry.changed
      ? 'level ' + esc(entry.previousLevel) + ' &rarr; <strong>' + esc(entry.level) + '</strong>'
      : 'stays <strong>' + esc(entry.level) + '</strong>';
    return (
      '<li>' +
      '<span class="exi-log-n">#' + entry.n + '</span>' +
      '<span class="exi-pill ' +
      (entry.answer === 'correct' ? 'exi-pill--positive' : 'exi-pill--negative') + '">' +
      esc(entry.answer) +
      '</span>' +
      '<span>' + change + '</span>' +
      '</li>'
    );
  }

  function answer(isCorrect) {
    var result = engine.answer(isCorrect);
    els.log.insertAdjacentHTML('afterbegin', logRow(result));
    render(result.snapshot);
  }

  function reset() {
    render(engine.reset());
    els.log.innerHTML = '';
  }

  els.correctBtn.addEventListener('click', function () { answer(true); });
  els.incorrectBtn.addEventListener('click', function () { answer(false); });
  els.resetBtn.addEventListener('click', reset);

  render(engine.snapshot());
})();
