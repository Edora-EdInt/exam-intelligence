'use strict';

/**
 * Offline integrity checks over the JSON data store.
 * Run with `npm run validate`.
 */

const fsp = require('fs/promises');
const path = require('path');
const { DATA_DIR, FILES } = require('../lib/seed-data');

let failures = 0;
function check(condition, message) {
  if (condition) {
    console.log(`ok    ${message}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${message}`);
  }
}

(async () => {
  const load = async (key) => JSON.parse(await fsp.readFile(path.join(DATA_DIR, FILES[key]), 'utf8'));
  const [chapters, questions, exams, students, answers, config] = await Promise.all([
    load('chapters'),
    load('questions'),
    load('exams'),
    load('students'),
    load('answers'),
    load('config'),
  ]);

  // ---- Volumes -------------------------------------------------------------
  check(new Set(chapters.map((c) => c.subject)).size >= 3, 'at least 3 subjects present');
  const perSubject = {};
  chapters.forEach((c) => {
    perSubject[c.subject] = (perSubject[c.subject] || 0) + 1;
  });
  check(Object.values(perSubject).every((n) => n >= 5), 'every subject has >= 5 chapters');
  check(questions.length >= 100, '>= 100 questions in bank');
  check(students.length >= 15 && students.length <= 20, '15-20 students enrolled');
  check(exams.length >= 5, '>= 5 exam records');
  check(answers.length >= 1000, '>= 1000 student answers');
  check(Number(config.chapterTargetQuestions) > 0, 'config.chapterTargetQuestions is a positive number');
  check(
    Array.isArray(config.readiness) && config.readiness.length >= 2,
    'config.readiness defines at least two score bands'
  );
  const bandMins = (config.readiness || []).map((b) => Number(b.minPct));
  check(
    bandMins.every((n) => Number.isFinite(n)) && bandMins.every((n, i) => i === 0 || bandMins[i - 1] > n),
    'readiness bands are ordered by descending minPct'
  );
  check(
    bandMins.length ? bandMins[bandMins.length - 1] <= 0 : false,
    'lowest readiness band catches scores of 0'
  );
  check(
    Number(config.strongChapterPct) > Number(config.weakChapterPct) && Number(config.weakChapterPct) > 0,
    'strongChapterPct > weakChapterPct > 0'
  );

  // ---- Uniqueness ----------------------------------------------------------
  const unique = (arr) => new Set(arr).size === arr.length;
  check(unique(chapters.map((x) => x.id)), 'chapter ids unique');
  check(unique(questions.map((x) => x.id)), 'question ids unique');
  check(unique(exams.map((x) => x.id)), 'exam ids unique');
  check(unique(students.map((x) => x.id)), 'student ids unique');
  check(unique(answers.map((x) => x.id)), 'answer ids unique');

  // ---- Contract fields ------------------------------------------------------
  const hasKeys = (obj, keys) => keys.every((k) => k in obj);
  const QUESTION_KEYS = ['id', 'chapterId', 'chapterName', 'subject', 'board', 'class', 'type', 'marks', 'difficulty', 'concept', 'timesUsedInExams'];
  const CHAPTER_KEYS = ['id', 'name', 'subject', 'class', 'board', 'totalQuestions', 'totalMarksCoverage'];
  const EXAM_KEYS = ['id', 'chapterIds', 'year', 'totalMarks', 'questionIds'];
  const ANSWER_KEYS = ['id', 'studentId', 'examId', 'questionId', 'isCorrect', 'marksAwarded', 'marksPossible', 'errorType'];
  const STUDENT_KEYS = ['id', 'name', 'class', 'section'];

  check(questions.every((q) => hasKeys(q, QUESTION_KEYS)), 'questions match contract fields');
  check(
    questions.every(
      (q) =>
        ['MCQ', 'Short', 'Long'].includes(q.type) &&
        ['Easy', 'Medium', 'Hard'].includes(q.difficulty) &&
        Number.isInteger(q.marks) && q.marks > 0
    ),
    'question type/difficulty enums and marks are sane'
  );
  check(chapters.every((c) => hasKeys(c, CHAPTER_KEYS)), 'chapters match contract fields');
  check(exams.every((e) => hasKeys(e, EXAM_KEYS)), 'exams match contract fields');
  check(answers.every((a) => hasKeys(a, ANSWER_KEYS)), 'answers match contract fields');
  check(students.every((s) => hasKeys(s, STUDENT_KEYS)), 'students match contract fields');

  // ---- Referential integrity -------------------------------------------------
  const chapterIds = new Set(chapters.map((c) => c.id));
  const questionIds = new Set(questions.map((q) => q.id));
  const examIds = new Set(exams.map((e) => e.id));
  const studentIds = new Set(students.map((s) => s.id));

  check(questions.every((q) => chapterIds.has(q.chapterId)), 'every question points at a real chapter');
  check(
    exams.every((e) => e.chapterIds.every((id) => chapterIds.has(id)) && e.questionIds.every((id) => questionIds.has(id))),
    'every exam reference resolves'
  );
  check(
    answers.every((a) => studentIds.has(a.studentId) && examIds.has(a.examId) && questionIds.has(a.questionId)),
    'every answer reference resolves'
  );

  // ---- Cross-file consistency --------------------------------------------------
  const qById = new Map(questions.map((q) => [q.id, q]));
  check(
    exams.every((e) => e.totalMarks === e.questionIds.reduce((sum, id) => sum + (qById.get(id)?.marks || 0), 0)),
    'exam.totalMarks equals the sum of its questions\' marks'
  );
  const usage = new Map();
  exams.forEach((e) => e.questionIds.forEach((id) => usage.set(id, (usage.get(id) || 0) + 1)));
  check(questions.every((q) => q.timesUsedInExams === (usage.get(q.id) || 0)), 'question.timesUsedInExams matches exam records');
  const countByChapter = new Map();
  const marksByChapter = new Map();
  questions.forEach((q) => {
    countByChapter.set(q.chapterId, (countByChapter.get(q.chapterId) || 0) + 1);
    marksByChapter.set(q.chapterId, (marksByChapter.get(q.chapterId) || 0) + q.marks);
  });
  check(
    chapters.every(
      (c) => c.totalQuestions === (countByChapter.get(c.id) || 0) && c.totalMarksCoverage === (marksByChapter.get(c.id) || 0)
    ),
    'chapter rollups match underlying questions'
  );
  check(answers.every((a) => a.isCorrect === (a.marksAwarded === a.marksPossible)), 'answer.isCorrect consistent with awarded vs possible marks');
  check(
    answers.every((a) => (a.isCorrect ? a.errorType === null : ['Formula', 'Calculation', 'Concept'].includes(a.errorType))),
    'errorType is null exactly when the answer is correct, else a valid enum value'
  );

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll data-store checks passed.');
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
