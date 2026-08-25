"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/exercises.js");
require("../js/data.js");
require("../js/routines.js");
require("../js/hiit-routines.js");
require("../js/session-model.js");
const planner = require("../js/planner.js");
const workoutEngine = require("../js/workout.js");

const data = global.TrainingData;
data.routines = planner.buildRoutineCatalog(data.exercises, data);

assert.deepEqual(workoutEngine.parsePrescription("4×6–10"), {
  raw: "4×6–10",
  minimumSets: 4,
  maximumSets: 4,
  targetType: "reps",
  targetMin: 6,
  targetMax: 10,
  perSide: false,
  recoverySeconds: null
});
const timed = workoutEngine.parsePrescription("3×20–40 s/lado");
assert.equal(timed.targetType, "seconds");
assert.equal(timed.targetMin, 20);
assert.equal(timed.targetMax, 40);
assert.equal(timed.perSide, true);
const rower = workoutEngine.parsePrescription("6×1 min fuerte/1 min fácil");
assert.equal(rower.minimumSets, 6);
assert.equal(rower.targetType, "seconds");
assert.equal(rower.targetMin, 60);
assert.equal(rower.recoverySeconds, 60);

const smartbellExercise = data.exercises.find((exercise) => workoutEngine.modalityOptions(exercise, data).includes("smartbells-pro"));
const normalizedLoad = workoutEngine.normalizeSelection({ modality: "smartbells-pro", loadKg: 999 }, smartbellExercise, data);
assert.equal(normalizedLoad.loadKg, 4);
assert.equal(workoutEngine.normalizeSelection({ modality: "smartbells-pro", loadKg: 10 }, smartbellExercise, data).loadKg, 10);
const bandExercise = data.exercises.find((exercise) => workoutEngine.modalityOptions(exercise, data).includes("rogue-monster-bands"));
const normalizedBand = workoutEngine.normalizeSelection({ modality: "rogue-monster-bands", bandId: "#2 Mini", bandCount: 8 }, bandExercise, data);
assert.equal(normalizedBand.bandId, "#2 Mini");
assert.equal(normalizedBand.bandCount, 1);
const walkingExercise = data.exercises.find((exercise) => exercise.sourceId === "E91");
assert.deepEqual(workoutEngine.modalityOptions(walkingExercise, data), ["walking"]);
assert.equal(workoutEngine.normalizeSelection({}, walkingExercise, data).modality, "walking");
assert.equal(workoutEngine.normalizeEffort("easy"), "easy");
assert.equal(workoutEngine.normalizeEffort("normal"), "normal");
assert.equal(workoutEngine.normalizeEffort("hard"), "hard");
assert.equal(workoutEngine.normalizeEffort("muy-fácil"), null);

const start = 1_800_000_000_000;
const strength = workoutEngine.createWorkout({
  routine: data.routines.R01,
  exercises: data.exercises,
  inventory: data,
  date: "2026-08-24",
  now: start,
  previousPerformance: {
    e01: { date: "2026-08-17", effort: "easy", selection: { modality: "smartbells-pro", loadKg: 10 }, sets: [{ completed: true, reps: 10, selection: { modality: "smartbells-pro", loadKg: 10 } }] }
  }
});
assert.equal(strength.steps.length, data.routines.R01.items.length);
assert.deepEqual(strength.steps.map((step) => step.sets.length), [4, 3, 3, 2]);
assert.equal(strength.steps[0].previous.selection.loadKg, 10);
assert.equal(strength.steps[0].previous.effort, "easy");
assert.equal(strength.steps[0].effort, null);
assert.equal(strength.steps[0].sets[0].targetSeconds, null);
assert.equal(strength.steps[0].sets[0].repetitionsInReserve, null);
assert.equal(strength.readyToFinish, false);
assert.equal(strength.sessionTimer.running, true);
assert.equal(workoutEngine.workoutProgress(strength).completed, 0);
assert.equal(workoutEngine.workoutComplete(strength), false);
strength.steps.forEach((step) => step.sets.forEach((set) => { set.completed = true; }));
assert.equal(workoutEngine.workoutComplete(strength), true);
assert.equal(workoutEngine.effortComplete(strength), false);
strength.steps.forEach((step) => { step.effort = "normal"; });
assert.equal(workoutEngine.effortComplete(strength), true);
assert.equal(workoutEngine.workoutProgress(strength).percent, 100);
strength.readyToFinish = true;
assert.equal(workoutEngine.sanitizeWorkout(strength, data.routines, data.exercises, data, start + 1000).readyToFinish, true);

let timer = workoutEngine.createTimer("countdown", 90);
timer = workoutEngine.startTimer(timer, start);
assert.equal(workoutEngine.timerSnapshot(timer, start + 30_000).remainingSeconds, 60);
timer = workoutEngine.pauseTimer(timer, start + 35_000);
assert.equal(timer.elapsedSeconds, 35);
assert.equal(workoutEngine.timerSnapshot(timer, start + 300_000).remainingSeconds, 55);

const draft = workoutEngine.createWorkout({ routine: data.routines.R01, exercises: data.exercises, inventory: data, date: "2026-08-24", now: start });
draft.updatedAt = start + 10_000;
draft.steps[0].effort = "hard";
draft.steps[1].effort = "estado-inexistente";
draft.readyToFinish = true;
draft.timer = workoutEngine.startTimer(workoutEngine.createTimer("countup"), start);
const restored = workoutEngine.sanitizeWorkout(draft, data.routines, data.exercises, data, start + 999_000);
assert.equal(restored.timer.running, false);
assert.equal(restored.timer.elapsedSeconds, 10);
assert.equal(restored.steps[0].effort, "hard");
assert.equal(restored.steps[1].effort, null);
assert.equal(restored.readyToFinish, false);

const intervals = workoutEngine.createWorkout({ routine: data.routines.H01, exercises: data.exercises, inventory: data, date: "2026-08-24", now: start });
assert.equal(intervals.schemaVersion, 2);
assert.deepEqual({ variantId: intervals.interval.variantId, workSeconds: intervals.interval.workSeconds, totalIntervals: intervals.interval.totalIntervals, automatic: intervals.interval.automatic }, { variantId: "standard", workSeconds: 60, totalIntervals: 10, automatic: true });
assert.equal(intervals.interval.warmupSeconds, 360);
assert.equal(intervals.interval.cooldownSeconds, 300);
assert.equal(intervals.interval.metrics.totalSeconds, 1860);
assert.equal(intervals.interval.timeline.length, 20);
assert.equal(intervals.interval.phaseGuidance.work, "Rema a una intensidad fuerte pero sostenible.");
assert.equal(intervals.interval.phaseGuidance.recovery, "Rema con intensidad fácil.");
assert.equal(intervals.movements.length, data.routines.H01.exerciseIds.length);
assert.equal(intervals.phase, "ready");
assert.equal(intervals.timer.mode, "countup");
assert.equal(intervals.sessionTimer.running, false);
assert.equal(intervals.sessionTimer.elapsedSeconds, 0);
assert.equal(workoutEngine.effortComplete(intervals), false);
intervals.movements[0].effort = "normal";
assert.equal(workoutEngine.effortComplete(intervals), true);
assert.equal(workoutEngine.sanitizeWorkout(intervals, data.routines, data.exercises, data, start + 1000).movements[0].effort, "normal");
intervals.phase = "warmup";
intervals.updatedAt = start + 10_000;
intervals.timer = workoutEngine.startTimer(workoutEngine.createTimer("countup"), start);
intervals.sessionTimer = workoutEngine.startTimer(workoutEngine.createTimer("countup"), start);
const restoredWarmup = workoutEngine.sanitizeWorkout(intervals, data.routines, data.exercises, data, start + 20_000);
assert.equal(restoredWarmup.phase, "warmup");
assert.equal(restoredWarmup.timer.mode, "countdown");
assert.equal(restoredWarmup.timer.durationSeconds, 360);
assert.equal(restoredWarmup.timer.running, false);
assert.equal(restoredWarmup.timer.elapsedSeconds, 10);
assert.equal(restoredWarmup.sessionTimer.elapsedSeconds, 10);
intervals.phase = "cooldown";
const restoredCooldown = workoutEngine.sanitizeWorkout(intervals, data.routines, data.exercises, data, start + 20_000);
assert.equal(restoredCooldown.phase, "cooldown");
assert.equal(restoredCooldown.timer.mode, "countdown");
assert.equal(restoredCooldown.timer.durationSeconds, 300);
const tamperedInterval = structuredClone(workoutEngine.createWorkout({ routine: data.routines.H01, exercises: data.exercises, inventory: data, date: "2026-08-24", now: start }));
tamperedInterval.phase = "interval";
tamperedInterval.timer = { mode: "countdown", durationSeconds: 9999, elapsedSeconds: 9999, running: false, startedAt: null };
const restoredInterval = workoutEngine.sanitizeWorkout(tamperedInterval, data.routines, data.exercises, data, start + 1000);
assert.equal(restoredInterval.timer.durationSeconds, 60);
assert.equal(restoredInterval.timer.elapsedSeconds, 60);
intervals.interval.currentSegmentIndex = intervals.interval.timeline.length - 1;
assert.equal(workoutEngine.workoutProgress(intervals).percent, 100);
const distanceIntervals = workoutEngine.createWorkout({ routine: data.routines.H06, exercises: data.exercises, inventory: data, date: "2026-08-24", now: start });
assert.equal(distanceIntervals.interval.automatic, false);
assert.equal(distanceIntervals.interval.totalIntervals, 10);
assert.equal(distanceIntervals.timer.mode, "countup");
const circuitIntervals = workoutEngine.createWorkout({ routine: data.routines.H12, exercises: data.exercises, inventory: data, date: "2026-08-24", now: start });
assert.equal(circuitIntervals.interval.automatic, true);
assert.equal(circuitIntervals.interval.roundCount, 7);
assert.equal(circuitIntervals.interval.stepsPerRound, 2);
assert.equal(circuitIntervals.interval.totalIntervals, 14);
assert.equal(workoutEngine.workoutProgress(circuitIntervals).completed, 0);
circuitIntervals.interval.currentSegmentIndex = 1;
workoutEngine.syncIntervalState(circuitIntervals.interval);
assert.equal(workoutEngine.workoutProgress(circuitIntervals).completed, 1);
circuitIntervals.interval.roundCount = 3;
circuitIntervals.interval.totalIntervals = 6;
const restoredCircuit = workoutEngine.sanitizeWorkout(circuitIntervals, data.routines, data.exercises, data, start + 1000);
assert.equal(restoredCircuit.interval.roundCount, 7);
assert.equal(restoredCircuit.interval.stepsPerRound, 2);
assert.equal(restoredCircuit.interval.totalIntervals, 14);
assert.deepEqual(restoredCircuit.interval.movementOrder, [0, 1]);
const canonicalCircuit = workoutEngine.intervalDefaults(data.routines.H16);
assert.deepEqual({ work: canonicalCircuit.workSeconds, rounds: canonicalCircuit.roundCount, steps: canonicalCircuit.stepsPerRound, efforts: canonicalCircuit.totalIntervals }, { work: 40, rounds: 3, steps: 5, efforts: 15 });
assert.equal(workoutEngine.intervalDefaults(data.routines.H04).warmupSeconds, 600);
assert.deepEqual(
  Object.fromEntries(["H03", "H07", "H29", "H39"].map((id) => [id, workoutEngine.intervalDefaults(data.routines[id]).totalIntervals])),
  { H03: 18, H07: 30, H29: 18, H39: 12 }
);
const h14 = workoutEngine.intervalDefaults(data.routines.H14);
assert.equal(h14.totalIntervals, 9);
assert.equal(h14.metrics.mainSeconds, 810);
assert.equal(h14.timeline.every((segment) => segment.kind === "work" && segment.durationSeconds === 90), true);
assert.equal(workoutEngine.intervalDefaults(data.routines.H10, "short").metrics.mainSeconds, 240);
assert.equal(workoutEngine.intervalDefaults(data.routines.H10, "long").metrics.mainSeconds, 720);
const h24 = workoutEngine.intervalDefaults(data.routines.H24);
assert.deepEqual(h24.metrics, { warmupSeconds: 300, mainSeconds: 1200, workSeconds: 600, recoverySeconds: 600, cooldownSeconds: 300, totalSeconds: 1800 });
assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(h24.timeline, (segment) => segment.kind)).map(([kind, segments]) => [kind, segments.length])), { work: 20, recovery: 20 });
const hybridGuidance = workoutEngine.intervalDefaults(data.routines.H43).timeline;
assert.match(hybridGuidance.find((segment) => segment.exerciseSourceId === "E88").guidance, /^Rema/);
assert.match(hybridGuidance.find((segment) => segment.exerciseSourceId === "E65").guidance, /balanceo/i);
assert.doesNotMatch(hybridGuidance.find((segment) => segment.exerciseSourceId === "E65").guidance, /^Rema/);
assert.doesNotMatch(hybridGuidance.find((segment) => segment.kind === "recovery").guidance, /^Rema/);
intervals.phase = "ready";
assert.equal(workoutEngine.configureProtocol(intervals, data.routines.H01, "long").interval.variantId, "long");
assert.equal(intervals.interval.totalIntervals, 12);
assert.equal(intervals.interval.metrics.totalSeconds, 2100);
const restoredLongVariant = workoutEngine.sanitizeWorkout(intervals, data.routines, data.exercises, data, start + 1000);
assert.equal(restoredLongVariant.interval.variantId, "long");
assert.equal(restoredLongVariant.interval.metrics.totalSeconds, 2100);
const walking = workoutEngine.createWorkout({ routine: data.routines.R48, exercises: data.exercises, inventory: data, date: "2026-08-24", now: start });
assert.ok(walking.interval);
assert.equal(walking.steps.length, 0);
assert.equal(walking.movements[0].selection.modality, "walking");
assert.equal(walking.interval.metrics.totalSeconds, 2280);

assert.equal(strength.steps[0].restSeconds, 150);
assert.deepEqual(strength.steps[0].restRange, { minimumSeconds: 120, defaultSeconds: 150, maximumSeconds: 180 });
for (const [routineId, forbidden] of [["R05", 15], ["R10", 43], ["R12", 50], ["R18", 72], ["R20", 84], ["R21", 20]]) {
  const session = workoutEngine.createWorkout({ routine: data.routines[routineId], exercises: data.exercises, inventory: data, date: "2026-08-24", now: start });
  assert.ok(session.steps.every((step) => step.restSeconds !== forbidden), `${routineId}: descanso inferido desde un código o un ángulo`);
}

for (const routine of Object.values(data.routines)) {
  const session = workoutEngine.createWorkout({ routine, exercises: data.exercises, inventory: data, date: "2026-08-24", now: start });
  if (routine.protocol) {
    assert.ok(session.interval.totalIntervals >= 1 && session.interval.totalIntervals <= 100, routine.id);
    assert.equal(session.movements.length, routine.exerciseIds.length, routine.id);
    assert.equal(session.sessionTimer.running, false, routine.id);
    assert.ok(session.movements.every((movement) => movement.selection.modality), `${routine.id}: movimiento sin modalidad de registro`);
  } else {
    assert.equal(session.steps.length, routine.items.length, routine.id);
    assert.ok(session.steps.every((step) => step.sets.length === step.plan.minimumSets), routine.id);
    assert.ok(session.steps.every((step) => step.selection.modality), `${routine.id}: ejercicio sin modalidad de registro`);
  }
}

console.log("Tests passed: workout prescriptions, inventory selections, resumable timers, set progress, history defaults, and interval sessions validated.");
