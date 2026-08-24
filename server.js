'use strict';

/**
 * EdInt Intelligence API server.
 * All business logic lives here; the frontend only renders what these
 * endpoints return. Data source: JSON files in ./data.
 */

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const store = require('./lib/store');

const app = express();
app.disable('x-powered-by');

// Security hardening
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many requests, please try again later.' } },
}));

const asyncWrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

const COLLECTIONS = [
  ['/api/chapters', 'chapters'],
  ['/api/questions', 'questions'],
  ['/api/students', 'students'],
  ['/api/exams', 'exams'],
  ['/api/answers', 'answers'],
];

function applyFilters(items, query) {
  const active = Object.entries(query).filter(([, value]) => value !== '' && value != null);
  if (!active.length) return items;
  return items.filter((item) => active.every(([key, value]) => String(item[key]) === String(value)));
}

for (const [route, collection] of COLLECTIONS) {
  app.get(
    route,
    asyncWrap(async (req, res) => {
      const data = applyFilters(await store.read(collection), req.query);
      res.json({ data, meta: { count: data.length } });
    })
  );
}

// ---------------------------------------------------------------------------
// Health & meta
// ---------------------------------------------------------------------------

app.get(
  '/api/health',
  asyncWrap(async (req, res) => {
    const [chapters, questions, exams, students, answers] = await Promise.all(
      ['chapters', 'questions', 'exams', 'students', 'answers'].map((name) => store.read(name))
    );
    res.json({
      data: {
        ok: true,
        uptimeSeconds: Math.round(process.uptime()),
        counts: {
          chapters: chapters.length,
          questions: questions.length,
          exams: exams.length,
          students: students.length,
          answers: answers.length,
        },
      },
      meta: { service: 'edint-intelligence', version: '0.4.0' },
    });
  })
);

app.get(
  '/api/meta',
  asyncWrap(async (req, res) => {
    const [chapters, students] = await Promise.all([store.read('chapters'), store.read('students')]);
    const distinctFrom = (items, field) => [...new Set(items.map((item) => item[field]))];
    const data = {
      subjects: distinctFrom(chapters, 'subject').sort(),
      boards: distinctFrom(chapters, 'board').sort(),
      classes: distinctFrom(chapters, 'class').sort((a, b) => Number(a) - Number(b)),
      sections: distinctFrom(students, 'section').sort(),
    };
    res.json({ data, meta: { count: data.subjects.length + data.boards.length + data.classes.length } });
  })
);

// ---------------------------------------------------------------------------
// Phase 1 · Chapter stats
// ---------------------------------------------------------------------------

app.get(
  '/api/chapters/:id/stats',
  asyncWrap(async (req, res) => {
    const chapters = await store.read('chapters');
    const chapter = chapters.find((c) => c.id === req.params.id);
    if (!chapter) {
      return res.status(404).json({
        error: { code: 'not_found', message: `Unknown chapter "${req.params.id}"` },
      });
    }
    const questions = (await store.read('questions')).filter((q) => q.chapterId === chapter.id);

    const distribution = (field, keys) =>
      keys.map((key) => {
        const count = questions.filter((q) => q[field] === key).length;
        return {
          key,
          count,
          pct: questions.length ? Math.round((count / questions.length) * 1000) / 10 : 0,
        };
      });

    const data = {
      chapter,
      questionCount: questions.length,
      totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
      typeDistribution: distribution('type', ['MCQ', 'Short', 'Long']),
      difficultyDistribution: distribution('difficulty', ['Easy', 'Medium', 'Hard']),
    };
    res.json({ data, meta: { count: questions.length } });
  })
);

// ---------------------------------------------------------------------------
// Phase 1 · Concept trends
// Frequency = number of times a concept appeared across ExamRecords.
// Trend = later half of exam years vs earlier half.
// ---------------------------------------------------------------------------

app.get(
  '/api/analytics/concept-trends',
  asyncWrap(async (req, res) => {
    const subject = req.query.subject || '';
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const [questions, exams] = await Promise.all([store.read('questions'), store.read('exams')]);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const map = new Map();
    for (const exam of exams) {
      for (const questionId of exam.questionIds) {
        const q = byId.get(questionId);
        if (!q) continue;
        if (subject && q.subject !== subject) continue;
        let entry = map.get(q.concept);
        if (!entry) {
          entry = { concept: q.concept, subject: q.subject, bankQuestions: 0, appearances: 0, byYear: {} };
          map.set(q.concept, entry);
        }
        entry.appearances += 1;
        entry.byYear[exam.year] = (entry.byYear[exam.year] || 0) + 1;
      }
    }
    for (const q of questions) {
      if (subject && q.subject !== subject) continue;
      const entry = map.get(q.concept);
      if (entry) entry.bankQuestions += 1;
    }

    const years = [...new Set(exams.map((e) => e.year))].sort((a, b) => a - b);
    const half = Math.ceil(years.length / 2);
    const earlyYears = new Set(years.slice(0, half));
    const lateYears = new Set(years.slice(half));

    const trendOf = (byYear) => {
      let early = 0;
      let late = 0;
      for (const [year, n] of Object.entries(byYear)) {
        if (earlyYears.has(Number(year))) early += n;
        else late += n;
      }
      if (early === 0) return { direction: late > 0 ? 'up' : 'flat', deltaPct: null };
      const deltaPct = Math.round(((late - early) / early) * 100);
      const direction = deltaPct > 8 ? 'up' : deltaPct < -8 ? 'down' : 'flat';
      return { direction, deltaPct };
    };

    const items = [...map.values()]
      .sort((a, b) => b.appearances - a.appearances || a.concept.localeCompare(b.concept))
      .slice(0, limit)
      .map((entry, index) => {
        const { direction, deltaPct } = trendOf(entry.byYear);
        return {
          rank: index + 1,
          concept: entry.concept,
          subject: entry.subject,
          bankQuestions: entry.bankQuestions,
          appearances: entry.appearances,
          direction,
          deltaPct,
        };
      });

    res.json({
      data: items,
      meta: { count: items.length, yearsTracked: years, filtersApplied: { subject: subject || null } },
    });
  })
);

// ---------------------------------------------------------------------------
// Phase 1 · Chapter weightage across past exams
// For each chapter: the range of marks it occupied per exam paper.
// ---------------------------------------------------------------------------

app.get(
  '/api/analytics/chapter-weightage',
  asyncWrap(async (req, res) => {
    const subject = req.query.subject || '';
    const [chapters, questions, exams] = await Promise.all([
      store.read('chapters'),
      store.read('questions'),
      store.read('exams'),
    ]);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const acc = new Map(); // chapterId -> { marks: [], shares: [] }
    for (const exam of exams) {
      const perChapter = new Map();
      let totalMarks = 0;
      for (const questionId of exam.questionIds) {
        const q = byId.get(questionId);
        if (!q) continue;
        perChapter.set(q.chapterId, (perChapter.get(q.chapterId) || 0) + q.marks);
        totalMarks += q.marks;
      }
      for (const [chapterId, marks] of perChapter) {
        let entry = acc.get(chapterId);
        if (!entry) {
          entry = { marks: [], shares: [] };
          acc.set(chapterId, entry);
        }
        entry.marks.push(marks);
        entry.shares.push(totalMarks ? Math.round((marks / totalMarks) * 1000) / 10 : 0);
      }
    }

    const mean = (arr) => (arr.length ? arr.reduce((sum, v) => sum + v, 0) / arr.length : null);

    const items = chapters
      .filter((c) => !subject || c.subject === subject)
      .map((c) => {
        const entry = acc.get(c.id) || { marks: [], shares: [] };
        return {
          chapterId: c.id,
          name: c.name,
          subject: c.subject,
          board: c.board,
          class: c.class,
          examsAppearedIn: entry.marks.length,
          minMarks: entry.marks.length ? Math.min(...entry.marks) : null,
          maxMarks: entry.marks.length ? Math.max(...entry.marks) : null,
          avgMarks: entry.marks.length ? Math.round(mean(entry.marks) * 10) / 10 : null,
          avgSharePct: entry.shares.length ? Math.round(mean(entry.shares) * 10) / 10 : null,
        };
      })
      .sort(
        (a, b) =>
          (b.avgMarks ?? -1) - (a.avgMarks ?? -1) ||
          b.examsAppearedIn - a.examsAppearedIn ||
          a.name.localeCompare(b.name)
      );

    res.json({
      data: items,
      meta: {
        count: items.length,
        examYears: [...new Set(exams.map((e) => e.year))].sort((a, b) => a - b),
        filtersApplied: { subject: subject || null },
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Phase 1 · Question bank health
// Completeness = questions in bank vs configured target per chapter
// (target lives in ./data/config.json -> chapterTargetQuestions).
// ---------------------------------------------------------------------------

app.get(
  '/api/analytics/bank-health',
  asyncWrap(async (req, res) => {
    const [config, chapters, questions] = await Promise.all([
      store.readConfig(),
      store.read('chapters'),
      store.read('questions'),
    ]);
    const target = Number(config.chapterTargetQuestions) || 10;

    const countByChapter = new Map();
    for (const q of questions) {
      countByChapter.set(q.chapterId, (countByChapter.get(q.chapterId) || 0) + 1);
    }

    const completeness = chapters
      .map((c) => {
        const questionCount = countByChapter.get(c.id) || 0;
        return {
          chapterId: c.id,
          name: c.name,
          subject: c.subject,
          board: c.board,
          class: c.class,
          questionCount,
          targetQuestions: target,
          percent: Math.min(100, Math.round((questionCount / target) * 100)),
        };
      })
      .sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name));

    const coverageMap = new Map();
    for (const c of chapters) {
      const key = `${c.board}|${c.class}`;
      const entry =
        coverageMap.get(key) || { board: c.board, class: c.class, chapterCount: 0, questionCount: 0 };
      entry.chapterCount += 1;
      entry.questionCount += countByChapter.get(c.id) || 0;
      coverageMap.set(key, entry);
    }
    const coverage = [...coverageMap.values()].sort(
      (a, b) => a.board.localeCompare(b.board) || Number(a.class) - Number(b.class)
    );

    const totals = {
      questions: questions.length,
      chapters: chapters.length,
      subjects: new Set(chapters.map((c) => c.subject)).size,
      boardClassCombinations: coverage.length,
      avgQuestionsPerChapter: chapters.length ? Math.round((questions.length / chapters.length) * 10) / 10 : 0,
      overallCompletenessPct: chapters.length
        ? Math.min(100, Math.round((questions.length / (chapters.length * target)) * 100))
        : 0,
    };

    res.json({
      data: { totals, coverage, completeness },
      meta: { config: { chapterTargetQuestions: target }, generatedAt: new Date().toISOString() },
    });
  })
);

// ---------------------------------------------------------------------------
// Phase 2 · Student performance intelligence
//
// All scoring rules live here and are driven by ./data/config.json:
//   readiness:        ordered score bands (minPct desc) -> label
//   strongChapterPct: mastery at/above this = strong chapter
//   weakChapterPct:   mastery below this     = needs improvement
// Mastery definition everywhere: marksEarned (sum of marksAwarded)
// divided by marksPossible, as a percentage.
// ---------------------------------------------------------------------------

const ERROR_LABELS = {
  Formula: 'Formula Application',
  Calculation: 'Calculation Errors',
  Concept: 'Concept Understanding',
};

const pct1 = (earned, possible) => (possible ? Math.round((earned / possible) * 1000) / 10 : 0);

function readinessFor(config, scorePct) {
  for (const band of config.readiness) {
    if (scorePct >= band.minPct) return { label: band.label, minPct: band.minPct };
  }
  const lowest = config.readiness[config.readiness.length - 1];
  return { label: lowest.label, minPct: lowest.minPct };
}

function classifyChapters(chapterRows, config) {
  const pick = (row) => ({
    chapterId: row.chapterId,
    chapterName: row.chapterName,
    subject: row.subject,
    masteryPct: row.masteryPct,
  });
  return {
    strongAreas: chapterRows.filter((r) => r.masteryPct >= config.strongChapterPct).map(pick),
    needsImprovement: chapterRows.filter((r) => r.masteryPct < config.weakChapterPct).map(pick),
  };
}

async function loadAnswerContext() {
  const [students, answers, questions, exams] = await Promise.all([
    store.read('students'),
    store.read('answers'),
    store.read('questions'),
    store.read('exams'),
  ]);
  return {
    students,
    answers,
    exams,
    examById: new Map(exams.map((e) => [e.id, e])),
    qById: new Map(questions.map((q) => [q.id, q])),
  };
}

// Per-chapter mastery for one student, lowest mastery first.
function buildStudentChapterMastery(ctx, studentId) {
  const acc = new Map();
  for (const answer of ctx.answers.filter((a) => a.studentId === studentId)) {
    const q = ctx.qById.get(answer.questionId);
    if (!q) continue;
    let entry = acc.get(q.chapterId);
    if (!entry) {
      entry = {
        chapterId: q.chapterId,
        chapterName: q.chapterName,
        subject: q.subject,
        board: q.board,
        class: q.class,
        questionsAnswered: 0,
        marksEarned: 0,
        marksPossible: 0,
      };
      acc.set(q.chapterId, entry);
    }
    entry.questionsAnswered += 1;
    entry.marksEarned += answer.marksAwarded;
    entry.marksPossible += answer.marksPossible;
  }
  // Lowest mastery first so weak areas surface on top.
  return [...acc.values()]
    .map((entry) => ({ ...entry, masteryPct: pct1(entry.marksEarned, entry.marksPossible) }))
    .sort((a, b) => a.masteryPct - b.masteryPct || a.chapterName.localeCompare(b.chapterName));
}

function requireStudent(ctx, id) {
  return ctx.students.find((s) => s.id === id);
}

app.get(
  '/api/students/:id/summary',
  asyncWrap(async (req, res) => {
    const ctx = await loadAnswerContext();
    const student = requireStudent(ctx, req.params.id);
    if (!student) {
      return res.status(404).json({
        error: { code: 'not_found', message: `Unknown student "${req.params.id}"` },
      });
    }
    const config = await store.readConfig();
    const rows = ctx.answers.filter((a) => a.studentId === student.id);
    const marksAwarded = rows.reduce((sum, r) => sum + r.marksAwarded, 0);
    const marksPossible = rows.reduce((sum, r) => sum + r.marksPossible, 0);
    const scorePct = pct1(marksAwarded, marksPossible);
    const data = {
      student,
      totals: {
        answers: rows.length,
        correct: rows.filter((r) => r.isCorrect).length,
        incorrect: rows.filter((r) => !r.isCorrect).length,
        marksAwarded,
        marksPossible,
        scorePct,
        examsTaken: new Set(rows.map((r) => r.examId)).size,
        chaptersTouched: new Set(
          rows.map((r) => ctx.qById.get(r.questionId)?.chapterId).filter(Boolean)
        ).size,
      },
      readiness: readinessFor(config, scorePct),
    };
    res.json({ data, meta: { config: { readiness: config.readiness } } });
  })
);

app.get(
  '/api/students/:id/chapter-mastery',
  asyncWrap(async (req, res) => {
    const ctx = await loadAnswerContext();
    const student = requireStudent(ctx, req.params.id);
    if (!student) {
      return res.status(404).json({
        error: { code: 'not_found', message: `Unknown student "${req.params.id}"` },
      });
    }
    const config = await store.readConfig();
    const chapters = buildStudentChapterMastery(ctx, student.id);

    res.json({
      data: { student, chapters, ...classifyChapters(chapters, config) },
      meta: {
        config: {
          strongChapterPct: config.strongChapterPct,
          weakChapterPct: config.weakChapterPct,
          masteryDefinition: 'marksEarned / marksPossible',
        },
      },
    });
  })
);

app.get(
  '/api/students/:id/error-breakdown',
  asyncWrap(async (req, res) => {
    const ctx = await loadAnswerContext();
    const student = requireStudent(ctx, req.params.id);
    if (!student) {
      return res.status(404).json({
        error: { code: 'not_found', message: `Unknown student "${req.params.id}"` },
      });
    }
    const rows = ctx.answers.filter((a) => a.studentId === student.id);
    const mistakes = rows.filter((r) => !r.isCorrect);

    const errorTypes = Object.keys(ERROR_LABELS).map((type) => {
      const count = mistakes.filter((m) => m.errorType === type).length;
      return {
        type,
        label: ERROR_LABELS[type],
        count,
        pct: mistakes.length ? Math.round((count / mistakes.length) * 1000) / 10 : 0,
      };
    });
    const top = [...errorTypes].sort((a, b) => b.count - a.count)[0];

    res.json({
      data: {
        student,
        totals: {
          totalAnswers: rows.length,
          correctAnswers: rows.length - mistakes.length,
          mistakes: mistakes.length,
        },
        errorTypes,
        mostCommon: top && top.count > 0 ? { type: top.type, label: top.label, count: top.count } : null,
      },
      meta: {},
    });
  })
);

// ---------------------------------------------------------------------------
// Phase 2 · Class analytics
// Class ids are "<class>-<section>", e.g. "10-A".
// ---------------------------------------------------------------------------

app.get(
  '/api/classes',
  asyncWrap(async (req, res) => {
    const students = await store.read('students');
    const map = new Map();
    students.forEach((s) => {
      const id = `${s.class}-${s.section}`;
      const entry = map.get(id) || { id, class: s.class, section: s.section, studentCount: 0 };
      entry.studentCount += 1;
      map.set(id, entry);
    });
    const data = [...map.values()].sort(
      (a, b) => Number(a.class) - Number(b.class) || a.section.localeCompare(b.section)
    );
    res.json({ data, meta: { count: data.length } });
  })
);

app.get(
  '/api/classes/:id/analytics',
  asyncWrap(async (req, res) => {
    const [klass, section] = String(req.params.id).split('-');
    const ctx = await loadAnswerContext();
    const roster = ctx.students.filter((s) => s.class === klass && s.section === section);
    if (!roster.length) {
      return res.status(404).json({
        error: { code: 'not_found', message: `No class "${req.params.id}"` },
      });
    }
    const config = await store.readConfig();
    const memberIds = new Set(roster.map((s) => s.id));
    const scoped = ctx.answers.filter((a) => memberIds.has(a.studentId));

    const marksAwarded = scoped.reduce((sum, a) => sum + a.marksAwarded, 0);
    const marksPossible = scoped.reduce((sum, a) => sum + a.marksPossible, 0);

    const perStudent = roster
      .map((stu) => {
        const mine = scoped.filter((a) => a.studentId === stu.id);
        const earned = mine.reduce((sum, a) => sum + a.marksAwarded, 0);
        const possible = mine.reduce((sum, a) => sum + a.marksPossible, 0);
        const scorePct = pct1(earned, possible);
        return {
          studentId: stu.id,
          name: stu.name,
          answers: mine.length,
          marksAwarded: earned,
          marksPossible: possible,
          scorePct,
          readiness: readinessFor(config, scorePct).label,
        };
      })
      .sort((a, b) => b.scorePct - a.scorePct || a.name.localeCompare(b.name));

    const readinessMix = config.readiness.map((band) => ({
      label: band.label,
      minPct: band.minPct,
      count: perStudent.filter((p) => p.readiness === band.label).length,
    }));

    const acc = new Map();
    for (const answer of scoped) {
      const q = ctx.qById.get(answer.questionId);
      if (!q) continue;
      let entry = acc.get(q.chapterId);
      if (!entry) {
        entry = {
          chapterId: q.chapterId,
          chapterName: q.chapterName,
          subject: q.subject,
          board: q.board,
          class: q.class,
          marksEarned: 0,
          marksPossible: 0,
          answers: 0,
          studentSet: new Set(),
        };
        acc.set(q.chapterId, entry);
      }
      entry.marksEarned += answer.marksAwarded;
      entry.marksPossible += answer.marksPossible;
      entry.answers += 1;
      entry.studentSet.add(answer.studentId);
    }
    const chapters = [...acc.values()]
      .map(({ studentSet, ...rest }) => ({
        ...rest,
        studentsAssessed: studentSet.size,
        masteryPct: pct1(rest.marksEarned, rest.marksPossible),
      }))
      .sort((a, b) => a.masteryPct - b.masteryPct || a.chapterName.localeCompare(b.chapterName));

    const data = {
      classInfo: { id: req.params.id, class: klass, section },
      totals: {
        students: roster.length,
        answers: scoped.length,
        examsCovered: new Set(scoped.map((a) => a.examId)).size,
        chaptersAssessed: chapters.length,
        marksAwarded,
        marksPossible,
        aggregateScorePct: pct1(marksAwarded, marksPossible),
        meanStudentScorePct: perStudent.length
          ? Math.round((perStudent.reduce((sum, p) => sum + p.scorePct, 0) / perStudent.length) * 10) / 10
          : 0,
      },
      readinessMix,
      roster: perStudent,
      chapters,
      ...classifyChapters(chapters, config),
    };
    res.json({
      data,
      meta: {
        config: {
          strongChapterPct: config.strongChapterPct,
          weakChapterPct: config.weakChapterPct,
          readiness: config.readiness,
        },
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Phase 3 · AI Assessment Intelligence (rules-based — NO LLM calls)
//
// Every "AI" insight here is a deterministic rule over Phase 1/2 data so it
// stays explainable, fast and free. All cutoffs live in ./data/config.json;
// see README "Rules & thresholds reference" for the full list.
// ---------------------------------------------------------------------------

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

async function loadFullContext() {
  const ctx = await loadAnswerContext();
  ctx.questions = await store.read('questions');
  return ctx;
}

function resolveClass(ctx, classId) {
  const [klass, section] = String(classId).split('-');
  const roster = ctx.students.filter((s) => s.class === klass && s.section === section);
  if (!roster.length) return null;
  const memberIds = new Set(roster.map((s) => s.id));
  return { klass, section, roster, scoped: ctx.answers.filter((a) => memberIds.has(a.studentId)) };
}

// Aggregate per-chapter rows over a set of answers (plus per-student mastery
// within each chapter). Lowest mastery first.
function chapterRowsFor(answers, qById) {
  const chapters = new Map();
  const perKey = new Map(); // "chapterId|studentId" -> { earned, possible }
  for (const answer of answers) {
    const q = qById.get(answer.questionId);
    if (!q) continue;
    let entry = chapters.get(q.chapterId);
    if (!entry) {
      entry = {
        chapterId: q.chapterId,
        chapterName: q.chapterName,
        subject: q.subject,
        board: q.board,
        class: q.class,
        marksEarned: 0,
        marksPossible: 0,
        answers: 0,
        studentSet: new Set(),
      };
      chapters.set(q.chapterId, entry);
    }
    entry.marksEarned += answer.marksAwarded;
    entry.marksPossible += answer.marksPossible;
    entry.answers += 1;
    entry.studentSet.add(answer.studentId);
    const key = `${q.chapterId}|${answer.studentId}`;
    const bucket = perKey.get(key) || { earned: 0, possible: 0 };
    bucket.earned += answer.marksAwarded;
    bucket.possible += answer.marksPossible;
    perKey.set(key, bucket);
  }
  return [...chapters.values()]
    .map((entry) => {
      const perStudentPct = {};
      for (const studentId of entry.studentSet) {
        const bucket = perKey.get(`${entry.chapterId}|${studentId}`);
        perStudentPct[studentId] = pct1(bucket.earned, bucket.possible);
      }
      return {
        ...entry,
        studentsAssessed: entry.studentSet.size,
        masteryPct: pct1(entry.marksEarned, entry.marksPossible),
        perStudentPct,
      };
    })
    .sort((a, b) => a.masteryPct - b.masteryPct || a.chapterName.localeCompare(b.chapterName));
}

// Chapter weightage map from past exams: chapterId -> { examsAppearedIn,
// minMarks, maxMarks, avgMarks }. Mirrors /api/analytics/chapter-weightage.
function computeChapterWeightageMap(exams, qById) {
  const marksByChapter = new Map();
  for (const exam of exams) {
    const perChapter = new Map();
    for (const questionId of exam.questionIds) {
      const q = qById.get(questionId);
      if (!q) continue;
      perChapter.set(q.chapterId, (perChapter.get(q.chapterId) || 0) + q.marks);
    }
    for (const [chapterId, marks] of perChapter) {
      const list = marksByChapter.get(chapterId) || [];
      list.push(marks);
      marksByChapter.set(chapterId, list);
    }
  }
  const map = new Map();
  for (const [chapterId, marks] of marksByChapter) {
    const avg = marks.reduce((sum, v) => sum + v, 0) / marks.length;
    map.set(chapterId, {
      examsAppearedIn: marks.length,
      minMarks: Math.min(...marks),
      maxMarks: Math.max(...marks),
      avgMarks: Math.round(avg * 10) / 10,
    });
  }
  return map;
}

function positiveInt(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Feature 1 · AI teaching recommendations -------------------------------------

app.get(
  '/api/insights/class/:id',
  asyncWrap(async (req, res) => {
    const ctx = await loadFullContext();
    const scope = resolveClass(ctx, req.params.id);
    if (!scope) {
      return res.status(404).json({
        error: { code: 'not_found', message: `No class "${req.params.id}"` },
      });
    }
    const config = await store.readConfig();

    // Rule A: struggle threshold (falls back to weakChapterPct when unset).
    const struggleRaw = Number(config.struggleChapterPct);
    const struggleThreshold =
      config.struggleChapterPct !== null && config.struggleChapterPct !== undefined && Number.isFinite(struggleRaw)
        ? struggleRaw
        : Number(config.weakChapterPct);

    const rows = chapterRowsFor(scope.scoped, ctx.qById);
    const weightage = computeChapterWeightageMap(ctx.exams, ctx.qById);

    // Rule B: median exam weightage across chapters this class was assessed
    // on that also have exam history (both rules must be evaluable).
    const considered = rows.filter((r) => weightage.has(r.chapterId));
    const medianWeightage = median(considered.map((r) => weightage.get(r.chapterId).avgMarks));

    const insights = [];
    for (const row of considered) {
      if (row.masteryPct >= struggleThreshold) continue;
      const weight = weightage.get(row.chapterId);
      if (!(weight.avgMarks > medianWeightage)) continue;

      const below = Object.values(row.perStudentPct).filter((p) => p < struggleThreshold);
      const studentsBelowPct = row.studentsAssessed
        ? Math.round((below.length / row.studentsAssessed) * 1000) / 10
        : 0;

      const mix = { Easy: 0, Medium: 0, Hard: 0 };
      for (const q of ctx.questions) {
        if (q.chapterId === row.chapterId) mix[q.difficulty] = (mix[q.difficulty] || 0) + 1;
      }
      const bankCount = mix.Easy + mix.Medium + mix.Hard;
      const difficultyMix = ['Hard', 'Medium', 'Easy'].map((level) => ({
        level,
        count: mix[level] || 0,
        pct: bankCount ? Math.round(((mix[level] || 0) / bankCount) * 1000) / 10 : 0,
      }));

      const severity =
        row.masteryPct < struggleThreshold - 10 || studentsBelowPct >= 60 ? 'high' : 'medium';
      const recommendedAction =
        row.masteryPct < struggleThreshold - 15
          ? 'Schedule remedial re-teaching sessions before proceeding'
          : 'Conduct targeted practice session';

      insights.push({
        type: 'struggling-chapter',
        chapterId: row.chapterId,
        chapterName: row.chapterName,
        subject: row.subject,
        headline: `Students are struggling with ${row.chapterName}`,
        classAverageMasteryPct: row.masteryPct,
        reasons: [
          {
            label: 'Class average mastery',
            value: `${row.masteryPct}%`,
            detail: `below ${struggleThreshold}% threshold`,
          },
          {
            label: 'Students below threshold',
            value: `${studentsBelowPct}%`,
            detail: `${below.length} of ${row.studentsAssessed} assessed students`,
          },
          {
            label: 'Exam weightage',
            value: `${weight.avgMarks} avg marks`,
            detail: `above median of ${medianWeightage} across assessed chapters (${weight.examsAppearedIn} exams)`,
          },
        ],
        difficultyMix,
        severity,
        recommendedAction,
      });
    }

    insights.sort(
      (a, b) =>
        a.classAverageMasteryPct - b.classAverageMasteryPct ||
        parseFloat(b.reasons[2].value) - parseFloat(a.reasons[2].value) ||
        a.chapterName.localeCompare(b.chapterName)
    );

    res.json({
      data: insights,
      meta: {
        count: insights.length,
        classInfo: { id: req.params.id, class: scope.klass, section: scope.section },
        rule: {
          masteryBelowPct: struggleThreshold,
          weightageAboveMedianAvgMarks: medianWeightage,
          evaluatedChapters: considered.length,
          generator: 'rules-based',
        },
      },
    });
  })
);

// Feature 5 (backend) · Preset assistant queries ------------------------------

app.get(
  '/api/insights/students-at-risk/:classId',
  asyncWrap(async (req, res) => {
    const ctx = await loadFullContext();
    const scope = resolveClass(ctx, req.params.classId);
    if (!scope) {
      return res.status(404).json({
        error: { code: 'not_found', message: `No class "${req.params.classId}"` },
      });
    }
    const config = await store.readConfig();
    const topBandLabel = config.readiness[0].label;

    const rows = [];
    for (const stu of scope.roster) {
      const mine = scope.scoped.filter((a) => a.studentId === stu.id);
      if (!mine.length) continue;
      const earned = mine.reduce((sum, a) => sum + a.marksAwarded, 0);
      const possible = mine.reduce((sum, a) => sum + a.marksPossible, 0);
      const scorePct = pct1(earned, possible);
      const readiness = readinessFor(config, scorePct);
      // Rule: everyone not in the top readiness band is flagged at-risk.
      if (readiness.label === topBandLabel) continue;

      const weakChapters = buildStudentChapterMastery(ctx, stu.id)
        .filter((r) => r.masteryPct < config.weakChapterPct)
        .slice(0, 2)
        .map((r) => ({ chapterId: r.chapterId, chapterName: r.chapterName, masteryPct: r.masteryPct }));

      const mistakes = mine.filter((a) => !a.isCorrect);
      let dominantError = null;
      for (const type of Object.keys(ERROR_LABELS)) {
        const count = mistakes.filter((m) => m.errorType === type).length;
        if (count > 0 && (!dominantError || count > dominantError.count)) {
          dominantError = { type, label: ERROR_LABELS[type], count };
        }
      }

      rows.push({
        studentId: stu.id,
        name: stu.name,
        scorePct,
        readiness: readiness.label,
        missedMarksPct: pct1(possible - earned, possible),
        weakChapters,
        dominantError,
      });
    }

    rows.sort((a, b) => a.scorePct - b.scorePct || a.name.localeCompare(b.name));

    res.json({
      data: rows,
      meta: {
        count: rows.length,
        classInfo: { id: req.params.classId, class: scope.klass, section: scope.section },
        rule: `Students outside the top readiness band ("${topBandLabel}") are listed, weakest first; weakChapters = up to 2 chapters under ${config.weakChapterPct}% mastery.`,
        generator: 'rules-based',
      },
    });
  })
);

app.get(
  '/api/insights/mistake-profile/:classId',
  asyncWrap(async (req, res) => {
    const ctx = await loadFullContext();
    const scope = resolveClass(ctx, req.params.classId);
    if (!scope) {
      return res.status(404).json({
        error: { code: 'not_found', message: `No class "${req.params.classId}"` },
      });
    }

    const subjects = new Map(); // subject -> accumulator
    for (const answer of scope.scoped) {
      const q = ctx.qById.get(answer.questionId);
      if (!q) continue;
      let entry = subjects.get(q.subject);
      if (!entry) {
        entry = {
          subject: q.subject,
          answersAnalyzed: 0,
          mistakes: 0,
          errorCounts: { Formula: 0, Calculation: 0, Concept: 0 },
        };
        subjects.set(q.subject, entry);
      }
      entry.answersAnalyzed += 1;
      if (!answer.isCorrect) {
        entry.mistakes += 1;
        if (answer.errorType && entry.errorCounts[answer.errorType] !== undefined) {
          entry.errorCounts[answer.errorType] += 1;
        }
      }
    }

    const rows = [...subjects.values()]
      .map((entry) => {
        const totalErrors = entry.errorCounts.Formula + entry.errorCounts.Calculation + entry.errorCounts.Concept;
        const errorTypes = Object.keys(ERROR_LABELS).map((type) => ({
          type,
          label: ERROR_LABELS[type],
          count: entry.errorCounts[type],
          pctOfMistakes: entry.mistakes ? Math.round((entry.errorCounts[type] / entry.mistakes) * 1000) / 10 : 0,
        }));
        const dominant = [...errorTypes].sort((a, b) => b.count - a.count)[0];
        return {
          subject: entry.subject,
          answersAnalyzed: entry.answersAnalyzed,
          mistakes: entry.mistakes,
          mistakeDensityPct: pct1(entry.mistakes, entry.answersAnalyzed),
          errorTypes,
          dominantError: dominant && dominant.count > 0 ? { type: dominant.type, label: dominant.label } : null,
          __totalErrors: totalErrors,
        };
      })
      .sort((a, b) => b.mistakes - a.mistakes || b.mistakeDensityPct - a.mistakeDensityPct || a.subject.localeCompare(b.subject))
      .map(({ __totalErrors, ...row }) => row);

    const totals = {
      answersAnalyzed: rows.reduce((sum, r) => sum + r.answersAnalyzed, 0),
      mistakes: rows.reduce((sum, r) => sum + r.mistakes, 0),
    };

    res.json({
      data: { classInfo: { id: req.params.classId, class: scope.klass, section: scope.section }, subjects: rows, totals },
      meta: {
        rule: 'Mistake density = incorrect answers ÷ analyzed answers per subject; dominant error = most frequent non-null errorType.',
        generator: 'rules-based',
      },
    });
  })
);

// Feature 2 · Personalized practice generator ---------------------------------

app.post(
  '/api/practice/generate',
  asyncWrap(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (!body.studentId) {
      return res.status(400).json({
        error: { code: 'bad_request', message: 'studentId is required in the request body' },
      });
    }
    const ctx = await loadFullContext();
    const student = requireStudent(ctx, String(body.studentId));
    if (!student) {
      return res.status(404).json({
        error: { code: 'not_found', message: `Unknown student "${body.studentId}"` },
      });
    }
    const config = await store.readConfig();

    const maxCount = positiveInt(config.practiceMaxCount, 30);
    const defaultCount = positiveInt(config.practiceDefaultCount, 10);
    let requested = Math.floor(Number(body.questionCount));
    if (!Number.isFinite(requested)) requested = defaultCount;
    requested = Math.max(1, Math.min(requested, maxCount));

    // Rule: focus on the N lowest-mastery chapters (N = practiceWeakestChapters).
    const weakestCount = positiveInt(config.practiceWeakestChapters, 2);
    const focusChapters = buildStudentChapterMastery(ctx, student.id).slice(0, weakestCount);
    const focusIds = new Set(focusChapters.map((c) => c.chapterId));

    // Rule: exclude questions the student already answered correctly.
    const correctIds = new Set(
      ctx.answers.filter((a) => a.studentId === student.id && a.isCorrect).map((a) => a.questionId)
    );
    const timesUsed = new Map();
    for (const exam of ctx.exams) {
      for (const questionId of exam.questionIds) {
        timesUsed.set(questionId, (timesUsed.get(questionId) || 0) + 1);
      }
    }

    const buckets = { Easy: [], Medium: [], Hard: [] };
    let eligiblePoolSize = 0;
    let excludedCorrectInFocus = 0;
    for (const q of ctx.questions) {
      if (!focusIds.has(q.chapterId)) continue;
      if (correctIds.has(q.id)) {
        excludedCorrectInFocus += 1;
        continue;
      }
      eligiblePoolSize += 1;
      const bucket = buckets[q.difficulty] || buckets.Medium;
      bucket.push(q);
    }
    // Deterministic ordering inside each bucket: exam usage desc, then id.
    const byExamUse = (a, b) =>
      (timesUsed.get(b.id) || 0) - (timesUsed.get(a.id) || 0) || a.id.localeCompare(b.id);
    for (const key of Object.keys(buckets)) buckets[key].sort(byExamUse);

    // Difficulty quotas come from configured weights (largest-remainder split).
    const rawWeights = config.practiceDifficultyWeights || {};
    let weights = {
      Easy: Number(rawWeights.Easy) || 0,
      Medium: Number(rawWeights.Medium) || 0,
      Hard: Number(rawWeights.Hard) || 0,
    };
    let weightSum = weights.Easy + weights.Medium + weights.Hard;
    if (weightSum <= 0) {
      weights = { Easy: 20, Medium: 50, Hard: 30 };
      weightSum = 100;
    }
    const levels = ['Easy', 'Medium', 'Hard'];
    const exactQuota = {};
    for (const level of levels) exactQuota[level] = (weights[level] / weightSum) * requested;
    const quota = {};
    for (const level of levels) quota[level] = Math.floor(exactQuota[level]);
    let leftover = requested - quota.Easy - quota.Medium - quota.Hard;
    const fracOrder = ['Medium', 'Hard', 'Easy'].sort(
      (a, b) => (exactQuota[b] % 1) - (exactQuota[a] % 1)
    );
    for (let i = 0; leftover > 0; i++, leftover--) quota[fracOrder[i % fracOrder.length]] += 1;

    // Fill shortfalls from remaining pool, Medium first (target difficulty band).
    const cursor = { Easy: 0, Medium: 0, Hard: 0 };
    for (const level of levels) cursor[level] = quota[level];
    const FILL_ORDER = ['Medium', 'Hard', 'Easy'];
    let selected = [];
    for (const level of levels) selected.push(...buckets[level].slice(0, quota[level]));
    let shortfall = requested - selected.length;
    while (shortfall > 0) {
      let took = false;
      for (const level of FILL_ORDER) {
        if (cursor[level] < buckets[level].length) {
          selected.push(buckets[level][cursor[level]]);
          cursor[level] += 1;
          shortfall -= 1;
          took = true;
          break;
        }
      }
      if (!took) break; // pool exhausted
    }

    // Display order: chapter, then easier first, then stable id.
    const difficultyRank = { Easy: 1, Medium: 2, Hard: 3 };
    selected.sort(
      (a, b) =>
        a.chapterName.localeCompare(b.chapterName) ||
        difficultyRank[a.difficulty] - difficultyRank[b.difficulty] ||
        a.id.localeCompare(b.id)
    );

    const questions = selected.map((q) => ({
      ...q,
      prompt: `[${q.type}] ${q.chapterName} — practice item on "${q.concept}" (placeholder content)`,
    }));

    res.json({
      data: {
        student,
        focusChapters: focusChapters.map((c) => ({
          chapterId: c.chapterId,
          chapterName: c.chapterName,
          subject: c.subject,
          masteryPct: c.masteryPct,
        })),
        questions,
        totals: {
          requested,
          delivered: questions.length,
          eligiblePoolSize,
          excludedCorrectInFocus,
        },
      },
      meta: {
        config: {
          practiceWeakestChapters: weakestCount,
          practiceDefaultCount: defaultCount,
          practiceMaxCount: maxCount,
          difficultyWeights: weights,
        },
        selectionRule:
          'Questions from the 2 lowest-mastery chapters, excluding ones answered correctly, quota by configured difficulty weights, shortfall filled Medium→Hard→Easy.',
        placeholderPrompts: true,
      },
    });
  })
);

// Feature 4 · Exam readiness prediction ---------------------------------------

app.get(
  '/api/students/:id/readiness/:subject',
  asyncWrap(async (req, res) => {
    const ctx = await loadFullContext();
    const student = requireStudent(ctx, req.params.id);
    if (!student) {
      return res.status(404).json({
        error: { code: 'not_found', message: `Unknown student "${req.params.id}"` },
      });
    }
    const wanted = String(req.params.subject).toLowerCase();
    const availableSubjects = [...new Set(ctx.questions.map((q) => q.subject))];
    const subject = availableSubjects.find((s) => s.toLowerCase() === wanted);
    if (!subject) {
      return res.status(404).json({
        error: {
          code: 'not_found',
          message: `Unknown subject "${req.params.subject}". Available: ${availableSubjects.join(', ')}`,
        },
      });
    }
    const config = await store.readConfig();

    const chapterRows = buildStudentChapterMastery(ctx, student.id);
    const subjectRows = chapterRows.filter((r) => r.subject === subject);
    const mine = ctx.answers.filter(
      (a) => a.studentId === student.id && ctx.qById.get(a.questionId)?.subject === subject
    );
    const earned = mine.reduce((sum, a) => sum + a.marksAwarded, 0);
    const possible = mine.reduce((sum, a) => sum + a.marksPossible, 0);
    const scorePct = pct1(earned, possible);

    // Rule: spread = population stddev of the student's per-chapter masteries
    // in this subject × readinessSpreadStdDevMultiplier (needs ≥ 2 chapters).
    const masteryValues = subjectRows.map((r) => r.masteryPct);
    let stdDevPct = 0;
    if (masteryValues.length >= 2) {
      const meanValue = masteryValues.reduce((sum, v) => sum + v, 0) / masteryValues.length;
      const variance =
        masteryValues.reduce((sum, v) => sum + (v - meanValue) ** 2, 0) / masteryValues.length;
      stdDevPct = Math.round(Math.sqrt(variance) * 10) / 10;
    }
    const multRaw = Number(config.readinessSpreadStdDevMultiplier);
    const multiplier = Number.isFinite(multRaw) && multRaw > 0 ? multRaw : 1.0;
    const spread = Math.round(stdDevPct * multiplier * 10) / 10;
    const expectedRange = {
      low: Math.max(0, Math.round((scorePct - spread) * 10) / 10),
      high: Math.min(100, Math.round((scorePct + spread) * 10) / 10),
      spreadPct: spread,
    };

    // Trend: later exam years vs earlier half (same convention as concept-trends).
    const byYear = new Map();
    for (const answer of mine) {
      const exam = ctx.examById.get(answer.examId);
      if (!exam) continue;
      const entry = byYear.get(exam.year) || { earned: 0, possible: 0 };
      entry.earned += answer.marksAwarded;
      entry.possible += answer.marksPossible;
      byYear.set(exam.year, entry);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const half = Math.ceil(years.length / 2);
    const sumRange = (list) => {
      let e = 0;
      let p = 0;
      for (const year of list) {
        const entry = byYear.get(year);
        e += entry.earned;
        p += entry.possible;
      }
      return { e, p };
    };
    const early = sumRange(years.slice(0, half));
    const late = sumRange(years.slice(half));
    const earlyPct = pct1(early.e, early.p);
    const latePct = pct1(late.e, late.p);
    const deltaPct = early.p > 0 && late.p > 0 ? Math.round((latePct - earlyPct) * 10) / 10 : null;
    const direction = deltaPct === null ? 'flat' : deltaPct > 8 ? 'up' : deltaPct < -8 ? 'down' : 'flat';

    res.json({
      data: {
        student,
        subject,
        estimate: true,
        scorePct,
        expectedRange,
        readiness: readinessFor(config, scorePct),
        trend: { direction, deltaPct, byYear: years.map((y) => ({ year: y, scorePct: pct1(byYear.get(y).earned, byYear.get(y).possible) })) },
        chapters: subjectRows.map((r) => ({
          chapterId: r.chapterId,
          chapterName: r.chapterName,
          masteryPct: r.masteryPct,
        })),
        totals: {
          answers: mine.length,
          examsTaken: new Set(mine.map((a) => a.examId)).size,
          chaptersAssessed: subjectRows.length,
          marksAwarded: earned,
          marksPossible: possible,
        },
      },
      meta: {
        disclaimer: 'Expected range is a statistical estimate (score ± stddev-based spread), not a guaranteed outcome.',
        config: {
          readinessSpreadStdDevMultiplier: multiplier,
          readiness: config.readiness,
        },
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Analytics stubs for future phases
// ---------------------------------------------------------------------------

const PLANNED_ANALYTICS = { summary: 1 };
app.get('/api/analytics/:topic', (req, res) => {
  const topic = req.params.topic;
  res.json({ data: null, meta: { topic, status: 'planned', phase: PLANNED_ANALYTICS[topic] || null } });
});

app.use('/api', (req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: `No API route for ${req.method} ${req.originalUrl}` },
  });
});

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'internal_error', message: err.message } });
});

const PORT = Number(process.env.PORT) || 3000;
store
  .ensureSeeded()
  .then(() => {
    app.listen(PORT, () => console.log(`EdInt Intelligence running at http://localhost:${PORT}`));
  })
  .catch((error) => {
    console.error('Failed to start:', error);
    process.exit(1);
  });
