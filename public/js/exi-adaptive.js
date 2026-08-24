/* EdInt Intelligence - adaptive difficulty engine (pure logic, no DOM).
   Rules (tunable via options):
     - Levels: Easy -> Medium -> Hard.
     - Start at startLevelIndex (default: Medium).
     - After N consecutive correct answers, step UP one level (default 2).
     - After M consecutive incorrect answers, step DOWN one level (default 1).
     - Level changes reset the opposite streak counter; level is clamped.
   UMD: usable in Node (require) and browser (window.exiAdaptive). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.exiAdaptive = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEVELS = ['Easy', 'Medium', 'Hard'];

  var DEFAULTS = {
    startLevelIndex: 1,
    stepsToIncrease: 2,
    stepsToDecrease: 1,
  };

  function clamp(index) {
    return Math.max(0, Math.min(LEVELS.length - 1, index));
  }

  function create(options) {
    options = options || {};
    var config = {
      startLevelIndex: typeof options.startLevelIndex === 'number' ? clamp(options.startLevelIndex) : DEFAULTS.startLevelIndex,
      stepsToIncrease: options.stepsToIncrease > 0 ? options.stepsToIncrease : DEFAULTS.stepsToIncrease,
      stepsToDecrease: options.stepsToDecrease > 0 ? options.stepsToDecrease : DEFAULTS.stepsToDecrease,
    };
    var state = {
      levelIndex: config.startLevelIndex,
      correctStreak: 0,
      incorrectStreak: 0,
      totalAnswered: 0,
      totalCorrect: 0,
      log: [],
    };

    function snapshot() {
      return {
        level: LEVELS[state.levelIndex],
        levelIndex: state.levelIndex,
        levels: LEVELS.slice(),
        correctStreak: state.correctStreak,
        incorrectStreak: state.incorrectStreak,
        nextLevelOnCorrect: LEVELS[clamp(state.levelIndex + (state.correctStreak + 1 >= config.stepsToIncrease ? 1 : 0))],
        nextLevelOnIncorrect: LEVELS[clamp(state.levelIndex - (state.incorrectStreak + 1 >= config.stepsToDecrease ? 1 : 0))],
        totalAnswered: state.totalAnswered,
        totalCorrect: state.totalCorrect,
        canStepUp: state.levelIndex < LEVELS.length - 1,
        canStepDown: state.levelIndex > 0,
      };
    }

    // answer(true|false) -> { event:'correct'|'incorrect'|'reset',
    //   previousLevel, level, changed, streakUsed }
    function answer(isCorrect) {
      var previousLevel = LEVELS[state.levelIndex];
      state.totalAnswered += 1;
      var changed = false;
      var streakUsed;

      if (isCorrect) {
        state.totalCorrect += 1;
        state.correctStreak += 1;
        state.incorrectStreak = 0;
        streakUsed = state.correctStreak;
        if (state.levelIndex < LEVELS.length - 1 && state.correctStreak >= config.stepsToIncrease) {
          state.levelIndex = clamp(state.levelIndex + 1);
          state.correctStreak = 0;
          changed = true;
        }
      } else {
        state.incorrectStreak += 1;
        state.correctStreak = 0;
        streakUsed = state.incorrectStreak;
        if (state.levelIndex > 0 && state.incorrectStreak >= config.stepsToDecrease) {
          state.levelIndex = clamp(state.levelIndex - 1);
          state.incorrectStreak = 0;
          changed = true;
        }
      }

      var entry = {
        n: state.totalAnswered,
        answer: isCorrect ? 'correct' : 'incorrect',
        previousLevel: previousLevel,
        level: LEVELS[state.levelIndex],
        changed: changed,
      };
      state.log.push(entry);
      return Object.assign({ event: isCorrect ? 'correct' : 'incorrect' }, entry, {
        snapshot: snapshot(),
      });
    }

    function reset() {
      state.levelIndex = config.startLevelIndex;
      state.correctStreak = 0;
      state.incorrectStreak = 0;
      state.totalAnswered = 0;
      state.totalCorrect = 0;
      state.log = [];
      return snapshot();
    }

    function getConfig() {
      return Object.assign({}, config, { levels: LEVELS.slice() });
    }

    return {
      answer: answer,
      reset: reset,
      snapshot: snapshot,
      getConfig: getConfig,
    };
  }

  return {
    LEVELS: LEVELS.slice(),
    DEFAULTS: Object.assign({}, DEFAULTS),
    create: create,
  };
});
