'use strict';

/**
 * Tiny JSON-file data store.
 * Each collection is one pretty-printed .json file inside ./data.
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

let seedPromise = null;

/** Tolerate UTF-8 BOMs so hand-edited data files (e.g. saved from Notepad) parse. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function ensureSeeded() {
  if (!seedPromise) seedPromise = require('./seed-data').ensureSeeded();
  return seedPromise;
}

async function read(name) {
  await ensureSeeded();
  const file = FILES[name];
  if (!file) throw new Error(`Unknown collection "${name}"`);
  const raw = await fsp.readFile(path.join(DATA_DIR, file), 'utf8');
  return JSON.parse(stripBom(raw));
}

async function write(name, data) {
  const file = FILES[name];
  if (!file) throw new Error(`Unknown collection "${name}"`);
  const tmpPath = path.join(DATA_DIR, `${file}.tmp`);
  await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmpPath, path.join(DATA_DIR, file));
}

/**
 * Tunable scoring thresholds. Everything here lives in data/config.json;
 * the values below are only fallbacks when a key is missing.
 */
const CONFIG_DEFAULTS = {
  chapterTargetQuestions: 10,
  strongChapterPct: 80,
  weakChapterPct: 60,
  readiness: [
    { minPct: 80, label: 'Excellent' },
    { minPct: 65, label: 'Good' },
    { minPct: 50, label: 'Needs Work' },
    { minPct: 0, label: 'At Risk' },
  ],
  // Phase 3 tunables (see README "Rules & thresholds reference")
  struggleChapterPct: null, // falls back to weakChapterPct when null
  practiceWeakestChapters: 2,
  practiceDefaultCount: 10,
  practiceMaxCount: 30,
  practiceDifficultyWeights: { Easy: 20, Medium: 50, Hard: 30 },
  readinessSpreadStdDevMultiplier: 1.0,
};

function normalizeConfig(raw) {
  const merged = { ...CONFIG_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  const bands = Array.isArray(merged.readiness)
    ? merged.readiness
        .filter((b) => b && Number.isFinite(Number(b.minPct)) && b.label)
        .map((b) => ({ minPct: Number(b.minPct), label: String(b.label) }))
    : CONFIG_DEFAULTS.readiness.slice();
  merged.readiness = (bands.length ? bands : CONFIG_DEFAULTS.readiness.slice()).sort(
    (a, b) => b.minPct - a.minPct
  );
  return merged;
}

async function readConfig() {
  try {
    const raw = await fsp.readFile(path.join(DATA_DIR, FILES.config), 'utf8');
    return normalizeConfig(JSON.parse(stripBom(raw)));
  } catch {
    return normalizeConfig(null);
  }
}

module.exports = { DATA_DIR, FILES, read, write, readConfig, ensureSeeded };
