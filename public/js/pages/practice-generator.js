/* Practice Generator page - student + count -> POST /api/practice/generate.
   Rendering is shared with the student profile page via window.exiRenderPractice. */
(function () {
  'use strict';

  var els = {
    studentSel: document.getElementById('exi-practice-student'),
    countInput: document.getElementById('exi-practice-count'),
    generateBtn: document.getElementById('exi-generate-btn'),
    output: document.getElementById('exi-practice-output'),
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function setBusy(busy) {
    els.generateBtn.disabled = busy;
    els.generateBtn.innerHTML = busy
      ? 'Generating&hellip;'
      : '<i data-lucide="shuffle"></i>Generate Practice Test';
    window.exiRefreshIcons();
  }

  function generate() {
    var studentId = els.studentSel.value;
    if (!studentId) return;
    var count = Math.max(1, parseInt(els.countInput.value, 10) || 10);
    setBusy(true);
    window.exiApi
      .post('api/practice/generate', { studentId: studentId, questionCount: count })
      .then(function (result) {
        window.exiRenderPractice(els.output, result);
      })
      .catch(function (err) {
        els.output.innerHTML =
          '<div class="exi-empty"><p class="exi-empty-title">Could not generate a practice set</p>' +
          '<p class="exi-empty-text">' + esc(err.message) + '</p></div>';
      })
      .finally(function () {
        setBusy(false);
      });
  }

  els.generateBtn.addEventListener('click', generate);
  els.studentSel.addEventListener('change', function () {
    els.output.innerHTML = '';
  });

  window.exiApi
    .get('api/students')
    .then(function (res) {
      els.studentSel.innerHTML = res.data
        .map(function (student) {
          return (
            '<option value="' + esc(student.id) + '">' + esc(student.name) +
            ' · Class ' + esc(student['class']) + '-' + esc(student.section) +
            ' (' + esc(student.id) + ')</option>'
          );
        })
        .join('');
    })
    .catch(function (err) {
      els.studentSel.innerHTML = '<option value="">Failed to load students</option>';
      els.output.innerHTML =
        '<div class="exi-empty"><p class="exi-empty-title">Could not load students</p>' +
        '<p class="exi-empty-text">' + esc(err.message) + '</p></div>';
    });

  window.exiRefreshIcons();
})();
