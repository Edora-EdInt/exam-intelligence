'use strict';

/**
 * Deterministic sample-data generator for EdInt Intelligence.
 * Fixed PRNG seed => byte-identical dataset on every regeneration,
 * so dashboards and tests are reproducible.
 *
 * Collections (see README for the full contract):
 *   chapters / questions / exams / students / answers / config
 */

const fsp = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const FILES = {
  chapters: 'chapters.json',
  questions: 'questions.json',
  exams: 'exams.json',
  students: 'students.json',
  answers: 'student_answers.json',
  config: 'config.json',
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAPTER_DEFS = [
  ['mat', 'Mathematics', 'CBSE', '10', [
    'Real Numbers',
    'Polynomials',
    'Quadratic Equations',
    'Introduction to Trigonometry',
    'Statistics',
    'Arithmetic Progressions',
    'Coordinate Geometry',
  ]],
  ['phy', 'Physics', 'CBSE', '10', [
    'Light – Reflection and Refraction',
    'The Human Eye and the Colourful World',
    'Electricity',
    'Magnetic Effects of Electric Current',
    'Sources of Energy',
  ]],
  ['che', 'Chemistry', 'CBSE', '10', [
    'Chemical Reactions and Equations',
    'Acids, Bases and Salts',
    'Metals and Non-metals',
    'Carbon and its Compounds',
    'Periodic Classification of Elements',
  ]],
  ['bio', 'Biology', 'ICSE', '10', [
    'Cell Structure',
    'Plant Physiology',
    'Human Physiology',
    'Genetics and Evolution',
    'Ecology and Environment',
  ]],
];

const CONCEPTS = {
  mat: [
    'Prime factorisation', 'Irrational numbers', 'HCF and LCM applications', 'Zeroes of a polynomial',
    'Division algorithm', 'Discriminant analysis', 'Word problems on quadratics', 'Trigonometric ratios',
    'Heights and distances', 'Mean of grouped data', 'Median and mode', 'Graphical representation of data',
    'nth term of an AP', 'Sum of n terms of an AP', 'Section formula', 'Distance formula',
  ],
  phy: [
    'Mirror formula', 'Refraction through a glass slab', 'Lens formula and magnification', 'Power of a lens',
    'Defects of vision', 'Atmospheric refraction', "Ohm's law", 'Series and parallel circuits',
    'Heating effect of current', 'Right-hand thumb rule', 'Electromagnetic induction', 'Domestic electric circuits',
    'Conventional energy sources', 'Non-conventional energy sources',
  ],
  che: [
    'Balancing chemical equations', 'Types of chemical reactions', 'Corrosion and rancidity', 'pH scale and importance',
    'Neutralisation reactions', 'Reactivity series', 'Extraction of metals', 'Corrosion prevention',
    'Covalent bonding', 'Homologous series', 'Soaps and detergents', 'Modern periodic table trends',
  ],
  bio: [
    'Cell organelles', 'Plasma membrane transport', 'Photosynthesis', 'Respiration in plants', 'Transpiration',
    'Circulatory system', 'Excretory system', 'Nervous coordination', "Mendel's laws", 'Sex determination',
    'Food chains and food webs', 'Waste management', 'Ozone layer depletion',
  ],
};

const STUDENT_NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Vihaan Mehta', 'Ananya Iyer', 'Arjun Nair', 'Ishita Bose',
  'Kabir Singh', 'Meera Krishnan', 'Rohan Gupta', 'Sara Fernandes', 'Aditya Rao', 'Naina Kulkarni',
  'Dev Malhotra', 'Tara Menon', 'Yash Agarwal', 'Zoya Khan',
];

// [id, name, year, scope ('mat'|'phy'|'che'|'bio'|'mixed'), chapter-name filter, question count]
const EXAM_DEFS = [
  ['exam-mat-midterm-2024', 'Mathematics Mid-Term 2024', 2024, 'mat', null, 18],
  ['exam-mat-final-2024', 'Mathematics Final Examination 2024', 2024, 'mat', null, 22],
  ['exam-phy-midterm-2024', 'Physics Mid-Term 2024', 2024, 'phy', null, 16],
  ['exam-phy-final-2024', 'Physics Final Examination 2024', 2024, 'phy', null, 18],
  ['exam-che-midterm-2024', 'Chemistry Mid-Term 2024', 2024, 'che', null, 15],
  ['exam-che-final-2024', 'Chemistry Final Examination 2024', 2024, 'che', null, 17],
  ['exam-bio-final-2024', 'Biology Final Examination 2024', 2024, 'bio', null, 16],
  ['exam-mat-preboard-2025', 'Mathematics Pre-Board 2025', 2025, 'mat', null, 24],
  ['exam-sci-unit-2025', 'Science Combined Unit Test 2025', 2025, 'mixed', null, 18],
  ['exam-phy-unit-2025', 'Physics Unit Test: Electricity 2025', 2025, 'phy', 'Electricity', 6],
];

const ERROR_WEIGHTS = {
  mat: [['Formula', 35], ['Calculation', 45], ['Concept', 20]],
  phy: [['Formula', 35], ['Calculation', 35], ['Concept', 30]],
  che: [['Formula', 20], ['Calculation', 20], ['Concept', 60]],
  bio: [['Formula', 5], ['Calculation', 10], ['Concept', 85]],
  mixed: [['Formula', 25], ['Calculation', 30], ['Concept', 45]],
};

function buildDataset() {
  const rand = mulberry32(0xed17);
  const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const weighted = (pairs) => {
    const roll = rand() * 100;
    let acc = 0;
    for (const [value, weight] of pairs) {
      acc += weight;
      if (roll < acc) return value;
    }
    return pairs[pairs.length - 1][0];
  };
  const pad = (n, w) => String(n).padStart(w, '0');

  // ---- Chapters ----
  const chapters = [];
  for (const [key, subject, board, klass, names] of CHAPTER_DEFS) {
    names.forEach((name, i) => {
      chapters.push({
        id: `ch-${key}-${pad(i + 1, 2)}`,
        name,
        subject,
        class: klass,
        board,
        totalQuestions: 0,
        totalMarksCoverage: 0,
      });
    });
  }

  // ---- Questions ----
  const questions = [];
  const byChapter = new Map();
  let questionSeq = 0;
  for (const chapter of chapters) {
    const key = chapter.id.slice(3, 6); // ch-mat-01 -> mat
    const concepts = CONCEPTS[key];
    const batch = [];
    const count = int(6, 8);
    for (let i = 0; i < count; i++) {
      questionSeq += 1;
      const type = weighted([['MCQ', 58], ['Short', 27], ['Long', 15]]);
      const marks =
        type === 'MCQ' ? 1 : type === 'Short' ? weighted([[2, 65], [3, 35]]) : weighted([[4, 60], [5, 40]]);
      batch.push({
        id: `q-${pad(questionSeq, 4)}`,
        chapterId: chapter.id,
        chapterName: chapter.name,
        subject: chapter.subject,
        board: chapter.board,
        class: chapter.class,
        type,
        marks,
        difficulty: weighted([['Easy', 38], ['Medium', 42], ['Hard', 20]]),
        concept: pick(concepts),
        timesUsedInExams: 0,
      });
    }
    byChapter.set(chapter.id, batch);
    questions.push(...batch);
  }
  for (const chapter of chapters) {
    const qs = byChapter.get(chapter.id);
    chapter.totalQuestions = qs.length;
    chapter.totalMarksCoverage = qs.reduce((sum, q) => sum + q.marks, 0);
  }

  // ---- Exams (round-robin across chosen chapters so papers spread topics) ----
  const poolFor = (scope, nameFilter) => {
    if (scope === 'mixed') {
      return chapters.filter((c) => c.id.startsWith('ch-phy-') || c.id.startsWith('ch-che-'));
    }
    let pool = chapters.filter((c) => c.id.startsWith(`ch-${scope}-`));
    if (nameFilter) pool = pool.filter((c) => c.name.includes(nameFilter));
    return pool;
  };

  const exams = [];
  for (const [id, name, year, scope, nameFilter, size] of EXAM_DEFS) {
    const queues = poolFor(scope, nameFilter).map((c) => byChapter.get(c.id).slice());
    const chosen = [];
    let cursor = 0;
    while (chosen.length < size && queues.some((q) => q.length)) {
      const queue = queues[cursor % queues.length];
      cursor += 1;
      if (queue.length) chosen.push(queue.shift());
    }
    for (const q of chosen) q.timesUsedInExams += 1;
    exams.push({
      id,
      name,
      chapterIds: [...new Set(chosen.map((q) => q.chapterId))],
      year,
      totalMarks: chosen.reduce((sum, q) => sum + q.marks, 0),
      questionIds: chosen.map((q) => q.id),
    });
  }

  // ---- Students ----
  const students = STUDENT_NAMES.map((name, i) => ({
    id: `stu-${pad(i + 1, 2)}`,
    name,
    class: '10',
    section: i % 2 === 0 ? 'A' : 'B',
  }));

  // ---- Answers ----
  const qById = new Map(questions.map((q) => [q.id, q]));
  const subjectKeyOf = (q) => q.chapterId.slice(3, 6);
  const answers = [];
  let answerSeq = 0;
  students.forEach((student, si) => {
    const baseAbility = 0.42 + (si % 8) * 0.06 + rand() * 0.06;
    const abilityBySubject = {};
    for (const exam of exams) {
      for (const questionId of exam.questionIds) {
        const q = qById.get(questionId);
        const sk = subjectKeyOf(q);
        if (!(sk in abilityBySubject)) {
          abilityBySubject[sk] = Math.max(0.15, Math.min(0.95, baseAbility + (rand() - 0.5) * 0.18));
        }
        const difficultyAdj = q.difficulty === 'Easy' ? 0.16 : q.difficulty === 'Medium' ? 0 : -0.17;
        const pCorrect = Math.max(0.05, Math.min(0.96, abilityBySubject[sk] + difficultyAdj));
        const correct = rand() < pCorrect;

        let marksAwarded;
        let errorType = null;
        if (correct) {
          marksAwarded = q.marks;
        } else {
          errorType = weighted(ERROR_WEIGHTS[sk] || ERROR_WEIGHTS.mixed);
          if (q.type !== 'MCQ' && rand() < 0.35) {
            marksAwarded = Math.max(1, q.marks - 2); // partial credit on written questions
          } else {
            marksAwarded = 0;
          }
        }

        answerSeq += 1;
        answers.push({
          id: `ans-${pad(answerSeq, 5)}`,
          studentId: student.id,
          examId: exam.id,
          questionId: q.id,
          isCorrect: marksAwarded === q.marks,
          marksAwarded,
          marksPossible: q.marks,
          errorType,
        });
      }
    }
  });

  return {
    chapters,
    questions,
    exams,
    students,
    answers,
    // Tunable scoring thresholds — see README "Configuring thresholds".
    config: {
      chapterTargetQuestions: 10,
      strongChapterPct: 80,
      weakChapterPct: 60,
      readiness: [
        { minPct: 80, label: 'Excellent' },
        { minPct: 65, label: 'Good' },
        { minPct: 50, label: 'Needs Work' },
        { minPct: 0, label: 'At Risk' },
      ],
    },
  };
}

async function summarizeExisting() {
  const counts = {};
  for (const key of ['chapters', 'questions', 'exams', 'students', 'answers']) {
    const raw = await fsp.readFile(path.join(DATA_DIR, FILES[key]), 'utf8');
    counts[key] = JSON.parse(raw).length;
  }
  return counts;
}

async function ensureSeeded(options = {}) {
  const force = Boolean(options.force);
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const filePaths = Object.fromEntries(
    Object.entries(FILES).map(([key, file]) => [key, path.join(DATA_DIR, file)])
  );

  if (!force) {
    let allPresent = true;
    for (const filePath of Object.values(filePaths)) {
      try {
        await fsp.access(filePath);
      } catch {
        allPresent = false;
        break;
      }
    }
    if (allPresent) return { generated: false, counts: await summarizeExisting() };
  }

  const dataset = buildDataset();
  await Promise.all(
    Object.entries(dataset).map(([key, value]) =>
      fsp.writeFile(filePaths[key], `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    )
  );
  return {
    generated: true,
    counts: {
      chapters: dataset.chapters.length,
      questions: dataset.questions.length,
      exams: dataset.exams.length,
      students: dataset.students.length,
      answers: dataset.answers.length,
    },
  };
}

module.exports = { buildDataset, ensureSeeded, DATA_DIR, FILES };
