(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TrainingWorkout = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const EFFORT_LEVELS = new Set(["easy", "normal", "hard"]);

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const safeText = (value, maximum = 500) => String(value ?? "").slice(0, maximum);
  const normalizeEffort = (value) => EFFORT_LEVELS.has(value) ? value : null;
  const validDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };

  function parsePrescription(value) {
    const raw = safeText(value, 1200).replaceAll("-", "–");
    const compact = raw.replace(/\s+/g, " ").trim();
    const setMatch = compact.match(/^(\d+)(?:–(\d+))?\s*×\s*(\d+)(?:–(\d+))?\s*(min(?:uto)?s?|s(?:egundos?)?)?/i);
    const durationMatch = compact.match(/^(\d+)(?:–(\d+))?\s*(min(?:uto)?s?|s(?:egundos?)?)/i);
    const perSide = /\/lado|por lado/i.test(compact);
    if (setMatch) {
      const minimumSets = Number(setMatch[1]);
      const maximumSets = Number(setMatch[2] || setMatch[1]);
      const targetMin = Number(setMatch[3]);
      const targetMax = Number(setMatch[4] || setMatch[3]);
      const unit = setMatch[5] || "";
      const targetType = /^min|^s/i.test(unit) ? "seconds" : "reps";
      const multiplier = /^min/i.test(unit) ? 60 : 1;
      const recoveryMatch = compact.match(/\/\s*(\d+)(?::(\d{2}))?\s*(min(?:uto)?s?|s(?:egundos?)?)?\s*(?:fácil|suave|recuperación|descanso)/i);
      const recoverySeconds = recoveryMatch
        ? (Number(recoveryMatch[1]) * (/^min/i.test(recoveryMatch[3] || "") ? 60 : recoveryMatch[2] ? 60 : 1)) + Number(recoveryMatch[2] || 0)
        : null;
      return {
        raw,
        minimumSets,
        maximumSets,
        targetType,
        targetMin: targetMin * multiplier,
        targetMax: targetMax * multiplier,
        perSide,
        recoverySeconds
      };
    }
    if (durationMatch) {
      const multiplier = /^min/i.test(durationMatch[3]) ? 60 : 1;
      return {
        raw,
        minimumSets: 1,
        maximumSets: 1,
        targetType: "seconds",
        targetMin: Number(durationMatch[1]) * multiplier,
        targetMax: Number(durationMatch[2] || durationMatch[1]) * multiplier,
        perSide,
        recoverySeconds: null
      };
    }
    return { raw, minimumSets: 1, maximumSets: 1, targetType: "protocol", targetMin: null, targetMax: null, perSide, recoverySeconds: null };
  }

  function restSecondsFor(routine, item, plan) {
    if (plan.recoverySeconds) return clamp(plan.recoverySeconds, 15, 600);
    return clamp(item?.rest?.defaultSeconds, 15, 600);
  }

  function selectionRecords(inventory) {
    return [
      ...(inventory?.equipment || []).flatMap((item) => [item, ...(item.accessories || [])]),
      ...(inventory?.equipmentAccessories || []),
      ...(inventory?.bandAnchors || []),
      ...Object.values(inventory?.supports || {})
    ].filter((item) => item?.selection?.modality);
  }

  function selectionRecord(modality, inventory) {
    return selectionRecords(inventory).find((item) => item.selection.modality === modality) || null;
  }

  function modalityOptions(exercise, inventory) {
    const records = [];
    const add = (record, kind) => {
      if (record?.selection?.modality && !records.some((item) => item.record.selection.modality === record.selection.modality)) records.push({ record, kind });
    };
    for (const ref of exercise?.equipmentRefs || []) {
      const record = ref.kind === "equipment"
        ? (inventory?.equipment || []).find((item) => item.id === ref.id)
        : ref.kind === "bench-accessory"
          ? (inventory?.equipment || []).flatMap((item) => item.accessories || []).find((item) => item.id === ref.id)
          : ref.kind === "band-accessory"
            ? (inventory?.equipmentAccessories || []).find((item) => item.id === ref.id)
            : ref.kind === "anchor"
              ? (inventory?.bandAnchors || []).find((item) => item.id === ref.id)
              : inventory?.supports?.[ref.id];
      add(record, ref.kind);
    }
    const variable = records.filter((item) => ["load", "band", "damper"].includes(item.record.selection.type));
    const supports = records.filter((item) => item.kind === "support");
    const accessories = records.filter((item) => item.kind !== "equipment");
    return (variable.length ? variable : supports.length ? supports : accessories.length ? accessories : records).map((item) => item.record.selection.modality);
  }

  function inventoryVariants(inventory, equipmentId) {
    return (inventory?.equipment || []).find((item) => item.id === equipmentId)?.variants || [];
  }

  function numericVariant(value) {
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeSelection(selection, exercise, inventory) {
    const options = modalityOptions(exercise, inventory);
    const modality = options.includes(selection?.modality) ? selection.modality : options[0];
    const normalized = { modality, loadKg: null, bandId: null, bandCount: 1, damper: null };
    const definition = selectionRecord(modality, inventory)?.selection;
    if (definition?.type === "load") {
      const variants = inventoryVariants(inventory, modality).map(numericVariant).filter((value) => value !== null);
      const proposed = numericVariant(selection?.loadKg);
      normalized.loadKg = variants.includes(proposed) ? proposed : variants[0] ?? null;
    }
    if (definition?.type === "band") {
      const bands = inventory?.bands || [];
      const band = bands.find((item) => item.id === selection?.bandId) || bands[0];
      normalized.bandId = band?.id || null;
      normalized.bandCount = clamp(Math.round(finiteNumber(selection?.bandCount, 1)), 1, band?.quantity || 1);
    }
    if (definition?.type === "damper") {
      const variants = inventoryVariants(inventory, modality).map(numericVariant).filter((value) => value !== null);
      const proposed = numericVariant(selection?.damper);
      const defaultValue = numericVariant(definition.defaultValue);
      normalized.damper = variants.includes(proposed) ? proposed : variants.includes(defaultValue) ? defaultValue : variants[0] ?? null;
    }
    return normalized;
  }

  function previousSelection(previous) {
    const completedSets = (previous?.sets || []).filter((set) => set?.completed && set.selection);
    return completedSets.at(-1)?.selection || previous?.selection || null;
  }

  function createSet(index, plan) {
    return {
      number: index + 1,
      reps: plan.targetType === "reps" ? plan.targetMin : null,
      targetSeconds: plan.targetType === "seconds" ? plan.targetMin : null,
      durationSeconds: 0,
      repetitionsInReserve: null,
      completed: false,
      skipped: false,
      selection: null,
      completedAt: null
    };
  }

  function createMovement(exercise, previous, inventory) {
    return {
      exerciseId: exercise.id,
      effort: null,
      selection: normalizeSelection(previousSelection(previous), exercise, inventory),
      previous: previous ? {
        date: safeText(previous.date, 10),
        effort: normalizeEffort(previous.effort),
        selection: normalizeSelection(previousSelection(previous), exercise, inventory),
        bestReps: Math.max(0, ...(previous.sets || []).map((set) => finiteNumber(set.reps, 0)))
      } : null
    };
  }

  function syncIntervalState(interval) {
    const segment = interval.timeline[interval.currentSegmentIndex] || interval.timeline[0];
    interval.phase = segment.kind;
    interval.automatic = Number.isFinite(segment.durationSeconds);
    interval.workSeconds = segment.durationSeconds ?? segment.estimatedSeconds;
    interval.currentMovementIndex = Number.isInteger(segment.movementIndex) ? segment.movementIndex : -1;
    interval.currentRound = segment.round || null;
    interval.roundCount = segment.roundCount || null;
    interval.stepInRound = segment.workStep || null;
    interval.stepsPerRound = segment.workStepsPerRound || null;
    const before = interval.timeline.slice(0, interval.currentSegmentIndex).filter((entry) => entry.kind === "work").length;
    interval.currentInterval = Math.min(interval.totalIntervals, before + (segment.kind === "work" ? 1 : 0));
    return interval;
  }

  function intervalDefaults(routine, requestedVariantId = null) {
    if (!routine?.protocol) throw new Error(`${routine?.id || "Rutina"}: protocolo de ejecución ausente.`);
    const variant = routine.protocol.variants.find((entry) => entry.id === requestedVariantId)
      || routine.protocol.variants.find((entry) => entry.id === routine.protocol.defaultVariantId)
      || routine.protocol.variants[0];
    const timeline = variant.segments.map((segment) => ({ ...segment }));
    const interval = {
      variantId: variant.id,
      timeline,
      currentSegmentIndex: 0,
      totalIntervals: timeline.filter((segment) => segment.kind === "work").length,
      movementOrder: [...new Set(timeline.filter((segment) => Number.isInteger(segment.movementIndex)).map((segment) => segment.movementIndex))],
      warmupSeconds: variant.warmupSeconds,
      cooldownSeconds: variant.cooldownSeconds,
      metrics: { ...variant.metrics },
      phaseGuidance: { ...routine.protocol.phaseGuidance },
      completed: false
    };
    return syncIntervalState(interval);
  }

  function intervalSegment(interval) {
    return interval?.timeline?.[interval.currentSegmentIndex] || null;
  }

  function configureProtocol(workout, routine, variantId) {
    if (!workout?.interval || workout.phase !== "ready") return workout;
    workout.interval = intervalDefaults(routine, variantId);
    workout.timer = createTimer("countup");
    workout.sessionTimer = createTimer("countup");
    return workout;
  }

  function createTimer(mode = "countup", durationSeconds = 0) {
    return { mode, durationSeconds: Math.max(0, finiteNumber(durationSeconds)), elapsedSeconds: 0, running: false, startedAt: null };
  }

  function timerSnapshot(timer, now = Date.now()) {
    const baseElapsed = Math.max(0, finiteNumber(timer?.elapsedSeconds));
    const liveElapsed = timer?.running && Number.isFinite(Number(timer.startedAt)) ? Math.max(0, (now - Number(timer.startedAt)) / 1000) : 0;
    const elapsedSeconds = baseElapsed + liveElapsed;
    const durationSeconds = Math.max(0, finiteNumber(timer?.durationSeconds));
    return {
      elapsedSeconds,
      remainingSeconds: timer?.mode === "countdown" ? Math.max(0, durationSeconds - elapsedSeconds) : 0,
      finished: timer?.mode === "countdown" && durationSeconds > 0 && elapsedSeconds >= durationSeconds
    };
  }

  function startTimer(timer, now = Date.now()) {
    if (timer?.running) return { ...timer };
    return { ...timer, running: true, startedAt: now };
  }

  function pauseTimer(timer, now = Date.now()) {
    const snapshot = timerSnapshot(timer, now);
    return { ...timer, elapsedSeconds: timer?.mode === "countdown" && snapshot.finished ? timer.durationSeconds : snapshot.elapsedSeconds, running: false, startedAt: null };
  }

  function resetTimer(timer) {
    return { ...timer, elapsedSeconds: 0, running: false, startedAt: null };
  }

  function createWorkout({ routine, exercises, inventory, date, previousPerformance = {}, now = Date.now() }) {
    const exerciseById = new Map((exercises || []).map((exercise) => [exercise.id, exercise]));
    const isIntervals = Boolean(routine.protocol);
    const steps = isIntervals ? [] : routine.items.map((item, index) => {
      const exercise = exerciseById.get(item.exerciseId);
      const plan = parsePrescription(item.prescription);
      const previous = previousPerformance[item.exerciseId] || null;
      const plannedSets = plan.minimumSets;
      return {
        index,
        exerciseId: item.exerciseId,
        sourceId: item.sourceId,
        prescription: item.prescription,
        optional: Boolean(item.optional),
        plan,
        plannedSets,
        currentSetIndex: 0,
        restSeconds: restSecondsFor(routine, item, plan),
        restRange: item.rest ? { ...item.rest } : null,
        effort: null,
        selection: normalizeSelection(previousSelection(previous), exercise, inventory),
        previous: previous ? {
          date: safeText(previous.date, 10),
          effort: normalizeEffort(previous.effort),
          selection: normalizeSelection(previousSelection(previous), exercise, inventory),
          bestReps: Math.max(0, ...(previous.sets || []).map((set) => finiteNumber(set.reps, 0)))
        } : null,
        notes: "",
        sets: Array.from({ length: plannedSets }, (_, setIndex) => createSet(setIndex, plan))
      };
    });
    const movements = isIntervals ? routine.exerciseIds.map((exerciseId) => createMovement(exerciseById.get(exerciseId), previousPerformance[exerciseId], inventory)) : [];
    const defaults = isIntervals ? intervalDefaults(routine) : null;
    return {
      schemaVersion: 2,
      id: `${date}-${routine.id}-${now}`,
      routineId: routine.id,
      date,
      startedAt: now,
      updatedAt: now,
      currentStepIndex: 0,
      readyToFinish: false,
      phase: "ready",
      steps,
      movements,
      interval: isIntervals ? defaults : null,
      timer: createTimer("countup"),
      sessionTimer: isIntervals ? createTimer("countup") : startTimer(createTimer("countup"), now)
    };
  }

  function sanitizeTimer(timer, fallback) {
    if (!timer || typeof timer !== "object") return fallback;
    const mode = timer.mode === "countdown" ? "countdown" : "countup";
    return {
      mode,
      durationSeconds: clamp(finiteNumber(timer.durationSeconds), 0, 86400),
      elapsedSeconds: clamp(finiteNumber(timer.elapsedSeconds), 0, 86400),
      running: Boolean(timer.running),
      startedAt: Number.isFinite(Number(timer.startedAt)) ? Number(timer.startedAt) : null
    };
  }

  function sanitizeWorkout(draft, routines, exercises, inventory, now = Date.now()) {
    if (!draft || typeof draft !== "object" || !routines?.[draft.routineId] || !validDate(draft.date)) return null;
    const routine = routines[draft.routineId];
    const exerciseById = new Map((exercises || []).map((exercise) => [exercise.id, exercise]));
    const base = createWorkout({ routine, exercises, inventory, date: draft.date, now: finiteNumber(draft.startedAt, now) });
    base.id = typeof draft.id === "string" && /^[A-Za-z0-9._:-]{1,180}$/.test(draft.id) ? draft.id : base.id;
    base.startedAt = clamp(finiteNumber(draft.startedAt, now), 0, now);
    base.updatedAt = clamp(finiteNumber(draft.updatedAt, now), 0, now);
    base.currentStepIndex = clamp(Math.round(finiteNumber(draft.currentStepIndex)), 0, Math.max(0, base.steps.length - 1));
    base.phase = ["ready", "warmup", "set", "rest", "interval", "cooldown", "complete"].includes(draft.phase) ? draft.phase : "ready";
    base.timer = sanitizeTimer(draft.timer, base.timer);
    base.sessionTimer = sanitizeTimer(draft.sessionTimer, base.sessionTimer);
    if (base.timer.running) base.timer = pauseTimer(base.timer, base.updatedAt);
    if (base.sessionTimer.running) base.sessionTimer = pauseTimer(base.sessionTimer, base.updatedAt);
    for (const [index, step] of base.steps.entries()) {
      const saved = draft.steps?.[index];
      if (!saved || saved.exerciseId !== step.exerciseId) continue;
      step.plannedSets = clamp(Math.round(finiteNumber(saved.plannedSets, step.plan.minimumSets)), step.plan.minimumSets, step.plan.maximumSets);
      step.currentSetIndex = clamp(Math.round(finiteNumber(saved.currentSetIndex)), 0, step.plannedSets - 1);
      step.restSeconds = clamp(Math.round(finiteNumber(saved.restSeconds, step.restSeconds)), 15, 600);
      step.effort = normalizeEffort(saved.effort);
      step.selection = normalizeSelection(saved.selection, exerciseById.get(step.exerciseId), inventory);
      step.notes = safeText(saved.notes, 500);
      step.sets = Array.from({ length: step.plannedSets }, (_, setIndex) => {
        const set = saved.sets?.[setIndex] || createSet(setIndex, step.plan);
        return {
          number: setIndex + 1,
          reps: set.reps === null ? null : clamp(Math.round(finiteNumber(set.reps)), 0, 999),
          targetSeconds: step.plan.targetType === "seconds" ? clamp(Math.round(finiteNumber(set.targetSeconds, step.plan.targetMin)), step.plan.targetMin, step.plan.targetMax) : null,
          durationSeconds: clamp(Math.round(finiteNumber(set.durationSeconds)), 0, 86400),
          repetitionsInReserve: set.repetitionsInReserve === null || set.repetitionsInReserve === undefined ? null : clamp(Math.round(finiteNumber(set.repetitionsInReserve)), 0, 10),
          completed: Boolean(set.completed),
          skipped: Boolean(set.skipped),
          selection: set.selection ? normalizeSelection(set.selection, exerciseById.get(step.exerciseId), inventory) : null,
          completedAt: Number.isFinite(Number(set.completedAt)) ? Number(set.completedAt) : null
        };
      });
    }
    for (const [index, movement] of base.movements.entries()) {
      const saved = draft.movements?.[index];
      if (saved?.exerciseId === movement.exerciseId) {
        movement.effort = normalizeEffort(saved.effort);
        movement.selection = normalizeSelection(saved.selection, exerciseById.get(movement.exerciseId), inventory);
      }
    }
    if (base.interval && draft.interval) {
      base.interval = intervalDefaults(routine, safeText(draft.interval.variantId, 40));
      const savedSegmentIndex = Number(draft.interval.currentSegmentIndex);
      if (Number.isFinite(savedSegmentIndex)) {
        base.interval.currentSegmentIndex = clamp(Math.round(savedSegmentIndex), 0, base.interval.timeline.length - 1);
      } else {
        const legacyInterval = clamp(Math.round(finiteNumber(draft.interval.currentInterval, 1)), 1, base.interval.totalIntervals);
        const workIndexes = base.interval.timeline.flatMap((segment, index) => segment.kind === "work" ? [index] : []);
        const workIndex = workIndexes[legacyInterval - 1] || 0;
        const afterWork = draft.interval.phase === "recovery" ? workIndex + 1 : workIndex;
        base.interval.currentSegmentIndex = clamp(afterWork, 0, base.interval.timeline.length - 1);
      }
      syncIntervalState(base.interval);
      base.interval.completed = Boolean(draft.interval.completed);
      if (base.interval.completed) base.phase = "complete";
      else if (!["ready", "warmup", "interval", "cooldown"].includes(base.phase)) base.phase = "ready";
      if (base.phase === "warmup" || base.phase === "cooldown") {
        base.timer.mode = "countdown";
        base.timer.durationSeconds = base.phase === "warmup" ? base.interval.warmupSeconds : base.interval.cooldownSeconds;
        base.timer.elapsedSeconds = clamp(base.timer.elapsedSeconds, 0, base.timer.durationSeconds);
      } else if (base.phase === "interval") {
        const segment = intervalSegment(base.interval);
        base.timer.mode = base.interval.automatic ? "countdown" : "countup";
        base.timer.durationSeconds = base.interval.automatic ? segment.durationSeconds : 0;
        base.timer.elapsedSeconds = clamp(base.timer.elapsedSeconds, 0, base.interval.automatic ? segment.durationSeconds : 86400);
      } else if (base.phase === "ready") {
        base.timer = createTimer("countup");
        base.sessionTimer = createTimer("countup");
      }
    }
    base.readyToFinish = Boolean(draft.readyToFinish) && workoutComplete(base) && effortComplete(base);
    return base;
  }

  function workoutProgress(workout) {
    if (!workout) return { completed: 0, total: 0, percent: 0 };
    if (workout.interval) {
      const completed = workout.interval.completed || workout.phase === "cooldown"
        ? workout.interval.totalIntervals
        : workout.interval.timeline.slice(0, workout.interval.currentSegmentIndex).filter((segment) => segment.kind === "work").length;
      return { completed, total: workout.interval.totalIntervals, percent: workout.interval.totalIntervals ? completed / workout.interval.totalIntervals * 100 : 0 };
    }
    const sets = workout.steps.flatMap((step) => step.sets);
    const completed = sets.filter((set) => set.completed || set.skipped).length;
    return { completed, total: sets.length, percent: sets.length ? completed / sets.length * 100 : 0 };
  }

  function workoutComplete(workout) {
    if (workout?.interval) return Boolean(workout.interval.completed);
    return Boolean(workout?.steps?.every((step) => step.sets.every((set) => set.completed || set.skipped)));
  }

  function effortComplete(workout) {
    if (!workout) return false;
    if (workout.interval) return workout.movements.every((movement) => Boolean(normalizeEffort(movement.effort)));
    return workout.steps.every((step) => !step.sets.some((set) => set.completed) || Boolean(normalizeEffort(step.effort)));
  }

  return {
    parsePrescription,
    normalizeEffort,
    restSecondsFor,
    modalityOptions,
    normalizeSelection,
    intervalDefaults,
    intervalSegment,
    syncIntervalState,
    configureProtocol,
    createTimer,
    timerSnapshot,
    startTimer,
    pauseTimer,
    resetTimer,
    createWorkout,
    sanitizeWorkout,
    workoutProgress,
    workoutComplete,
    effortComplete,
    selectionRecords
  };
});
