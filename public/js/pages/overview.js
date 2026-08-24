/* Overview - scaffold status. Fetches live counts and pings every endpoint,
   including one dynamic per-chapter stats call using a real chapter id. */
(function () {
  'use strict';

  var CHECKS = [
    { path: 'api/meta' },
    { path: 'api/chapters' },
    { path: 'api/questions' },
    { path: 'api/exams' },
    { path: 'api/students' },
    { path: 'api/classes' },
    { path: 'api/answers' },
    { path: 'api/analytics/concept-trends' },
    { path: 'api/analytics/chapter-weightage' },
    { path: 'api/analytics/bank-health' },
  ];

  var listEl = document.getElementById('exi-endpoint-checks');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function rowHtml(path, label) {
    return (
      '<div class="exi-endpoint-row" data-path="' + esc(path) + '">' +
      '<span class="exi-endpoint-method">GET</span>' +
      '<span class="exi-endpoint-path exi-code">' + esc(label || path) + '</span>' +
      '<span class="exi-endpoint-status">' +
      '<span class="exi-dot exi-dot--pending"></span><span>waiting</span>' +
      '</span></div>'
    );
  }

  function setStatus(path, state, note) {
    var row = listEl.querySelector('[data-path="' + path + '"]');
    if (!row) return;
    row.querySelector('.exi-endpoint-status').innerHTML =
      '<span class="exi-dot exi-dot--' + state + '"></span><span>' + esc(note) + '</span>';
  }

  function setStat(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  buildRows();
  function buildRows() {
    listEl.innerHTML =
      rowHtml('api/health') + CHECKS.map(function (check) { return rowHtml(check.path); }).join('');
  }

  async function run() {
    var badge = document.getElementById('exi-health-badge');

    try {
      var health = await window.exiApi.get('api/health');
      var counts = health.data.counts;
      setStat('exi-stat-chapters', counts.chapters);
      setStat('exi-stat-questions', counts.questions);
      setStat('exi-stat-exams', counts.exams);
      setStat('exi-stat-students', counts.students);
      setStat('exi-stat-answers', counts.answers);
      badge.textContent = 'API connected';
      badge.classList.add('exi-badge--live');
      setStatus('api/health', 'ok', 'ok');
    } catch (err) {
      badge.textContent = 'API offline';
      setStatus('api/health', 'fail', 'failed');
    }

    var queue = CHECKS.slice();

    try {
      var chaptersRes = await window.exiApi.get('api/chapters');
      if (chaptersRes.data.length) {
        var chapterId = chaptersRes.data[0].id;
        var statsPath = 'api/chapters/' + encodeURIComponent(chapterId) + '/stats';
        listEl.insertAdjacentHTML('beforeend', rowHtml(statsPath, 'api/chapters/{id}/stats'));
        queue.push({ path: statsPath });
      }
    } catch (_) {}

    try {
      var studentsRes = await window.exiApi.get('api/students');
      if (studentsRes.data.length) {
        var studentId = encodeURIComponent(studentsRes.data[0].id);
        [
          ['summary', '/summary'],
          ['chapter-mastery', '/chapter-mastery'],
          ['error-breakdown', '/error-breakdown'],
        ].forEach(function (pair) {
          var path = 'api/students/' + studentId + pair[1];
          listEl.insertAdjacentHTML(
            'beforeend',
            rowHtml(path, 'api/students/{id}' + pair[1])
          );
          queue.push({ path: path });
        });
      }
    } catch (_) {}

    try {
      var metaRes = await window.exiApi.get('api/meta');
      var studentsList = (await window.exiApi.get('api/students')).data;
      if (studentsList.length && (metaRes.data.subjects || []).length) {
        var readinessPath =
          'api/students/' +
          encodeURIComponent(studentsList[0].id) +
          '/readiness/' +
          encodeURIComponent(metaRes.data.subjects[0]);
        listEl.insertAdjacentHTML(
          'beforeend',
          rowHtml(readinessPath, 'api/students/{id}/readiness/{subject}')
        );
        queue.push({ path: readinessPath });
      }
    } catch (_) {}

    try {
      var classesRes = await window.exiApi.get('api/classes');
      if (classesRes.data.length) {
        var classId = encodeURIComponent(classesRes.data[0].id);
        var classChecks = [
          ['analytics', 'api/classes/{id}/analytics', 'analytics'],
          ['insights', 'api/insights/class/{id}', 'insights'],
          ['at-risk', 'api/insights/students-at-risk/{id}', 'at-risk insights'],
          ['mistakes', 'api/insights/mistake-profile/{id}', 'mistake profile'],
        ];
        classChecks.forEach(function (check) {
          var path = check[1].replace('{id}', classId);
          listEl.insertAdjacentHTML('beforeend', rowHtml(path, check[1]));
          queue.push({ path: path });
        });
      }
    } catch (_) {}

    for (var i = 0; i < queue.length; i++) {
      var check = queue[i];
      try {
        await window.exiApi.get(check.path);
        setStatus(check.path, 'ok', 'ok');
      } catch (err) {
        setStatus(check.path, 'fail', 'failed');
      }
    }
  }

  run();
})();
