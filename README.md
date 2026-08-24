# EdInt Intelligence

Standalone assessment-intelligence module for the Edora / EdInt product line.
Express + JSON-file data store on the backend, plain HTML/CSS/vanilla-JS pages
on the frontend. No framework, no build step.

Fully self-contained: it owns its own `package.json`, `node_modules`, and
`data/` and touches nothing outside this folder.

## Run it

```bash
cd edint-intelligence
npm install
npm start          # -> http://localhost:3000
```

The server auto-seeds `./data` with deterministic sample data on first boot.
Useful extras:

```bash
npm run seed            # seed only if files are missing
npm run seed -- --force # regenerate the sample data (byte-identical, fixed PRNG)
npm run validate        # offline integrity checks over the JSON data store
PORT=3111 npm start     # run on another port
```

## Where the data lives

Everything is a pretty-printed JSON file in `./data`:

| File                 | Contents                                                        |
| -------------------- | --------------------------------------------------------------- |
| `chapters.json`      | Chapter records + rollups (question count, marks coverage)      |
| `questions.json`     | The question bank                                               |
| `exams.json`         | Past exam papers (chapter/question composition per year)        |
| `students.json`      | Enrolled students                                               |
| `student_answers.json` | One record per student answer on an exam question             |
| `config.json`        | Tunables, e.g. `chapterTargetQuestions` used by bank health     |

### Data contract

```jsonc
// Question
{ "id": "q-0001", "chapterId": "ch-mat-01", "chapterName": "Real Numbers",
  "subject": "Mathematics", "board": "CBSE", "class": "10",
  "type": "MCQ" | "Short" | "Long", "marks": 1,
  "difficulty": "Easy" | "Medium" | "Hard",
  "concept": "Prime factorisation", "timesUsedInExams": 4 }

// Chapter
{ "id": "ch-mat-01", "name": "Real Numbers", "subject": "Mathematics",
  "class": "10", "board": "CBSE", "totalQuestions": 7,
  "totalMarksCoverage": 15 }

// ExamRecord  ("name" is the one additive display field beyond the contract)
{ "id": "exam-mat-final-2024", "name": "...", "chapterIds": ["ch-mat-01"],
  "year": 2024, "totalMarks": 30, "questionIds": ["q-0001"] }

// StudentAnswer
{ "id": "ans-00001", "studentId": "stu-01", "examId": "exam-mat-final-2024",
  "questionId": "q-0001", "isCorrect": true, "marksAwarded": 1,
  "marksPossible": 1, "errorType": null } // Formula | Calculation | Concept | null

// Student
{ "id": "stu-01", "name": "Aarav Sharma", "class": "10", "section": "A" }
```

Swapping in real data later = replacing these files with the same shapes
(plus re-running any rollups you change) — no code changes needed.

## API surface

| Route                              | What it returns                                                            |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/health`                  | Service status + store counts                                              |
| `GET /api/meta`                    | Distinct subjects / boards / classes (for filter dropdowns)                |
| `GET /api/chapters?subject&class&board` | Chapters; optional exact-match filters                                |
| `GET /api/chapters/:id/stats`      | Per-chapter type distribution + difficulty distribution                    |
| `GET /api/questions`               | Full question bank                                                         |
| `GET /api/students`                | Students                                                                   |
| `GET /api/exams`                   | Exam records                                                               |
| `GET /api/answers`                 | Student answers                                                            |
| `GET /api/analytics/concept-trends?subject&limit` | Concepts ranked by exam appearances + recent-vs-earlier trend |
| `GET /api/analytics/chapter-weightage?subject`    | Min/max/avg marks per chapter across past exams              |
| `GET /api/analytics/bank-health`   | Totals, board/class coverage, chapter completeness vs configured target    |
| `GET /api/classes`                 | Available class-section groups (`10-A`, ...) with student counts           |
| `GET /api/classes/:id/analytics`   | Class average, readiness mix, roster, aggregate chapter strong/weak        |
| `GET /api/students/:id/summary`    | Score %, correct/mistake tallies, exams taken, readiness label             |
| `GET /api/students/:id/chapter-mastery` | Per-chapter mastery % (weakest first) + strong/weak classification    |
| `GET /api/students/:id/error-breakdown` | Mistake counts by error type with share of mistakes                  |
| `GET /api/students/:id/readiness/:subject` | Phase 3 · readiness estimate: score ± stddev-based expected range, band, trend |
| `POST /api/practice/generate`      | Phase 3 · personalized practice set (`{ studentId, questionCount }`)       |
| `GET /api/insights/class/:id`      | Phase 3 · struggling-chapter insight cards for a class                     |
| `GET /api/insights/students-at-risk/:classId` | Phase 3 · students outside the top readiness band, weakest first |
| `GET /api/insights/mistake-profile/:classId`  | Phase 3 · per-subject mistake density + dominant error types   |
| `GET /api/analytics/:topic`        | Planned-phase stubs                                                        |

All responses are `{ data, meta }`; errors are `{ error: { code, message } }`.

## Configuring thresholds

All scoring rules are data, not code — edit `data/config.json`
(server picks up changes on the next request, no restart needed):

```jsonc
{
  "chapterTargetQuestions": 10,   // Phase 1: bank-completeness target per chapter

  // Exam Readiness bands. Checked top-down; first band whose minPct is
  // <= the student's score wins. Keep sorted by minPct descending.
  "readiness": [
    { "minPct": 80, "label": "Excellent" },
    { "minPct": 65, "label": "Good" },
    { "minPct": 50, "label": "Needs Work" },
    { "minPct": 0,  "label": "At Risk" }
  ],

  "strongChapterPct": 80,         // mastery >= this  -> "Strong Areas"
  "weakChapterPct": 60,           // mastery <  this  -> "Needs Improvement"

  // ---- Phase 3 tunables (see "Rules & thresholds reference") --------------
  "struggleChapterPct": null,     // insight struggle threshold; null = use weakChapterPct
  "practiceWeakestChapters": 2,   // focus chapters per practice set
  "practiceDefaultCount": 10,     // questionCount when not supplied
  "practiceMaxCount": 30,         // hard clamp on questionCount
  "practiceDifficultyWeights": { "Easy": 20, "Medium": 50, "Hard": 30 },
  "readinessSpreadStdDevMultiplier": 1.0
}
```

Definitions used by every screen:

- **Mastery** (student or class, per chapter) = sum of `marksAwarded` ÷ sum of
  `marksPossible` for answers on that chapter's questions, as a percentage.
- **Overall score %** = same formula across all of a student's answers.
- **Readiness** = the config band containing the overall score %.
- **Strong / Needs-improvement chapters** = chapter mastery compared against
  `strongChapterPct` / `weakChapterPct`. Never manually tagged.

Missing keys fall back to built-in defaults; `npm run validate` checks that
the config shape is sane.

## Rules & thresholds reference (Phase 3)

Every rule the "AI" uses, in one place. All numeric knobs are in
`data/config.json`; nothing below is hidden in code except where noted.

### 1. Teaching recommendations — `GET /api/insights/class/:id`

A chapter becomes a struggling-chapter insight card only if **all** hold:

| # | Rule | Default / formula |
| - | ---- | ----------------- |
| 1 | Struggle threshold | chapter class mastery `< struggleChapterPct` (fallback: `weakChapterPct` = **60**) |
| 2 | Above-median weightage | chapter `avgMarks` across past exams `>` median avgMarks of all chapters this class was assessed on that have exam history |
| 3 | Severity = `high` | mastery `< threshold − 10` **OR** ≥ **60%** of assessed students below threshold; otherwise `medium` |
| 4 | Recommended action | mastery `< threshold − 15` → "Schedule remedial re-teaching sessions…", else "Conduct targeted practice session" |

Card contents: mastery %, % of students below threshold, weightage vs median,
bank difficulty mix per chapter. Sort: lowest mastery first.

### 2. Practice generator — `POST /api/practice/generate`

| Rule | Default / formula |
| ---- | ----------------- |
| Focus chapters | student's N lowest-mastery chapters (`practiceWeakestChapters` = **2**) |
| Exclusions | any question in a focus chapter the student answered correctly (`isCorrect`) |
| Difficulty quotas | normalized `practiceDifficultyWeights` `{Easy 20, Medium 50, Hard 30}` split by largest remainder to hit the requested count exactly |
| Shortfall fill | pool shortfalls filled in order **Medium → Hard → Easy** |
| Deterministic order | within a bucket: exam usage desc, then question id asc; display order: chapter name asc, Easy→Medium→Hard, id asc |
| Count | default `practiceDefaultCount` (**10**), clamped to `[1, practiceMaxCount]` (**30**) |
| Prompt text | placeholder string built from type/chapter/concept until real content exists |

### 3. Adaptive difficulty — `public/js/exi-adaptive.js` (pure module)

| Rule | Value |
| ---- | ----- |
| Levels | `Easy` → `Medium` → `Hard` |
| Start | index 1 (`Medium`) |
| Step up | after **2 consecutive correct** (`stepsToIncrease`) |
| Step down | after **1 consecutive incorrect** (`stepsToDecrease`) |
| Clamps | never above Hard or below Easy; level change resets the streak counter |

Tunable via `create({ startLevelIndex, stepsToIncrease, stepsToDecrease })`;
these three numbers live in code (not config) since the module is standalone
by design — move them into config when wiring a real exam flow.

### 4. Readiness prediction — `GET /api/students/:id/readiness/:subject`

| Rule | Formula |
| ---- | ------- |
| Score | same mastery definition as everywhere: earned ÷ possible marks for that subject |
| Expected range | score ± spread, clamped to `[0, 100]`, flagged `estimate: true` |
| Spread | population stddev of the student's per-chapter masteries in that subject × `readinessSpreadStdDevMultiplier` (**1.0**); needs ≥ 2 chapters, else 0 |
| Trend direction | later exam-year half vs earlier half of subject score; `up/down` when Δ > ±8 pts, else `flat` |
| Band | same config `readiness` bands as Phase 2 |

### 5. Teacher assistant presets — `/ai-insights.html`

Each preset button maps to exactly one endpoint (no free-form chat):

| Preset | Endpoint |
| ------ | -------- |
| "Which chapters should I revise before boards?" | `GET /api/insights/class/:id` (rules from §1) |
| "Which students need attention?" | `GET /api/insights/students-at-risk/:classId` |
| "What kind of mistakes is the class making?" | `GET /api/insights/mistake-profile/:classId` |

Extra rules in those two endpoints:

- **At-risk list**: every student whose overall readiness band ≠ top band
  (`readiness[0]`, i.e. not "Excellent") is listed; weakest first; each entry
  carries up to 2 chapters under `weakChapterPct` and their dominant error type.
- **Mistake profile**: per subject, mistake density = incorrect ÷ analyzed
  answers; dominant error = most frequent non-null `errorType`
  (Formula / Calculation / Concept).

Swapping any of this for a real model later means replacing the route
implementation behind the same URL and response shape — pages won't change.

## Pages

| Page                          | Phase | Status |
| ----------------------------- | ----- | ------ |
| `/index.html`                 | –     | Scaffold overview with live endpoint checks |
| `/chapter-intelligence.html`  | 1     | Live · filterable chapter list + detail (type bars, difficulty stack) |
| `/question-trends.html`       | 1     | Live · ranked most-tested concepts with trend indicators |
| `/exam-patterns.html`         | 1     | Live · typical chapter weightage range bars |
| `/question-bank-health.html`  | 1     | Live · totals, coverage table, completeness progress list |
| `/student-profiles.html`      | 2     | Live · searchable roster + profile: score %, readiness, chapter mastery, strengths/weaknesses, error intelligence + "Generate Practice Test" |
| `/class-analytics.html`       | 2     | Live · class average, readiness mix, roster table, collective strong/weak chapters |
| `/ai-insights.html`           | 3     | Live · teacher assistant with 3 preset questions -> structured rules-based answers |
| `/practice-generator.html`    | 3     | Live · student + count -> personalized practice set |
| `/adaptive-demo.html`         | 3     | Live · click Correct/Incorrect and watch the adaptive difficulty engine react |

## Frontend architecture rules

These exist so the module can later be visually merged into Edora by a
no-code tool that only touches HTML/CSS classnames and layout:

- **All business logic lives in the backend.** Pages fetch from the API and
  render; every number on screen is a live API value — nothing is hard-coded.
- **One page = one screen**, each a standalone HTML file that works dropped
  into an `<iframe>` or mounted at any sub-path: relative asset/href paths
  only, no router assumptions, no `window.top` access.
- **`exi-` prefix everywhere** — every CSS class, JS global
  (`window.exiApi`, `window.exiShell`, `window.exiRefreshIcons`),
  localStorage key, and animation name.
- **Design tokens only**: colors/spacing come from CSS custom properties in
  `public/css/exi.css` (`--exi-bg`, `--exi-accent`, `--exi-border`, ...).
  Light/dark via `[data-exi-theme]`, persisted in localStorage.
- **Shared shell**: `public/js/exi-shell.js` injects the sidebar based on
  `<body data-exi-page="...">`. Icons are Lucide via CDN (line icons only).

## Project layout

```
edint-intelligence/
├── server.js            Express app + all API routes/analytics
├── lib/
│   ├── store.js         Tiny async JSON-file store (+ config reader)
│   └── seed-data.js     Deterministic sample-data generator
├── scripts/
│   ├── seed.js          CLI seeder (--force to regenerate)
│   └── validate.js      Offline integrity checks over ./data
├── data/                The JSON "database"
└── public/
    ├── css/exi.css      Design system (tokens + components)
    ├── js/exi-boot.js   Pre-paint theme/collapse restore
    ├── js/exi-api.js    fetch wrapper (window.exiApi)
    ├── js/exi-shell.js  Sidebar/theme shell (window.exiShell)
    ├── js/exi-adaptive.js  Adaptive difficulty engine (pure, Node + browser)
    ├── js/exi-practice-view.js  Shared practice-set renderer
    ├── js/pages/*.js    One renderer per screen
    └── *.html           One file per page
```
