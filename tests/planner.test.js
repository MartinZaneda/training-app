"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/exercises.js");
require("../js/data.js");
require("../js/routines.js");
require("../js/hiit-routines.js");
require("../js/session-model.js");
const planner = require("../js/planner.js");

const root = path.resolve(__dirname, "..");
const data = global.TrainingData;
const generalBlueprints = global.TrainingRoutineBlueprints;
const hiitBlueprints = global.TrainingHiitRoutineBlueprints;
const blueprints = [...generalBlueprints, ...hiitBlueprints];
const routines = planner.buildRoutineCatalog(data.exercises, data);
const routineList = Object.values(routines);
const generalRoutines = routineList.filter((routine) => routine.library === "general");
const hiitRoutines = routineList.filter((routine) => routine.library === "hiit");
const exerciseById = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
const sourceIds = Array.from({ length: 91 }, (_, index) => `E${String(index + 1).padStart(2, "0")}`);
const routineIds = Array.from({ length: 49 }, (_, index) => `R${String(index + 1).padStart(2, "0")}`);
const hiitIds = Array.from({ length: 48 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`);

const webpDimensions = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", `${filePath}: contenedor no válido`);
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP", `${filePath}: archivo no WebP`);
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (chunk === "VP8 ") {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff
      };
    }
    if (chunk === "VP8L") {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      return { width: buffer.readUIntLE(dataOffset + 4, 3) + 1, height: buffer.readUIntLE(dataOffset + 7, 3) + 1 };
    }
    offset = dataOffset + length + (length % 2);
  }
  throw new Error(`${filePath}: dimensiones WebP no disponibles`);
};

assert.equal(data.appVersion, 6);
assert.ok(!("variants" in data));
assert.deepEqual(data.weeklyPresets.map((preset) => preset.id), ["upper-priority", "lower-priority", "conditioning-priority"]);
assert.deepEqual(data.weeklyPresets.map((preset) => preset.schedule), [
  ["R21", "R22", null, "R26", "R23", "R38", null],
  ["R11", null, "R14", "R23", null, "R16", "R38"],
  ["H01", "R30", null, "H24", "R38", "H12", null]
]);
assert.ok(data.weeklyPresets.every((preset) => preset.schedule.length === 7 && preset.schedule.filter(Boolean).length === 5));
assert.equal(planner.validateWeeklyPresets(data.weeklyPresets, routines).valid, true);
assert.deepEqual(planner.scheduleMetrics(data.weeklyPresets[0].schedule, routines), { planned: 5, strength: 4, cardio: 1, hybrid: 0, hiit: 0, minutes: 268 });
assert.deepEqual(planner.scheduleMetrics(data.weeklyPresets[1].schedule, routines), { planned: 5, strength: 4, cardio: 1, hybrid: 0, hiit: 0, minutes: 264 });
assert.deepEqual(planner.scheduleMetrics(data.weeklyPresets[2].schedule, routines), { planned: 5, strength: 1, cardio: 1, hybrid: 0, hiit: 3, minutes: 189 });
const invalidWeeklyPresets = structuredClone(data.weeklyPresets);
invalidWeeklyPresets[0].schedule[0] = "rutina-inexistente";
assert.equal(planner.validateWeeklyPresets(invalidWeeklyPresets, routines).valid, false);
assert.equal(data.exercises.length, 91);
assert.deepEqual(data.exercises.map((exercise) => exercise.sourceId), sourceIds);
assert.deepEqual(data.exercises.map((exercise) => exercise.id), sourceIds.map((id) => id.toLowerCase()));
assert.equal(new Set(data.exercises.map((exercise) => exercise.name)).size, 91);
assert.deepEqual(
  Object.fromEntries(Object.entries(Object.groupBy(data.exercises, (exercise) => exercise.category)).map(([category, items]) => [category, items.length])),
  { Empuje: 24, "Tirón": 20, Piernas: 11, "Cadena posterior": 14, "Core e integración": 15, Cardio: 7 }
);

const documentedLevels = new Set(["Básico", "Básico–intermedio", "Intermedio", "Intermedio–avanzado", "Avanzado"]);
const validEquipmentRefs = {
  equipment: new Set(data.equipment.map((item) => item.id)),
  "bench-accessory": new Set(data.equipment.flatMap((item) => item.accessories || []).map((item) => item.id)),
  "band-accessory": new Set(data.equipmentAccessories.map((item) => item.id)),
  anchor: new Set(data.bandAnchors.map((item) => item.id)),
  support: new Set(Object.keys(data.supports))
};
assert.ok(data.bandAnchors.every((anchor) => anchor.icon === "anchor"));
for (const exercise of data.exercises) {
  assert.ok(documentedLevels.has(exercise.difficulty), `${exercise.sourceId}: nivel no documental`);
  assert.equal(exercise.documentedLevel, exercise.difficulty);
  assert.ok(exercise.pattern && exercise.dose && exercise.equipment && exercise.mainEquipment);
  assert.ok(exercise.primaryMuscles.length && exercise.muscleGroups.length && exercise.equipmentTags.length && exercise.equipmentRefs.length);
  assert.equal(exercise.primaryMuscle, exercise.primaryMuscles[0]);
  assert.ok(exercise.secondaryMuscles.every((muscle) => !exercise.primaryMuscles.includes(muscle)));
  for (const ref of exercise.equipmentRefs) {
    assert.ok(validEquipmentRefs[ref.kind], `${exercise.sourceId}: tipo de referencia desconocido`);
    assert.ok(validEquipmentRefs[ref.kind].has(ref.id), `${exercise.sourceId}: referencia inexistente ${ref.kind}:${ref.id}`);
  }
  assert.ok(exercise.image, `${exercise.sourceId}: imagen no asignada`);
  const imagePath = path.resolve(root, exercise.image);
  assert.ok(fs.existsSync(imagePath), `${exercise.sourceId}: imagen inexistente`);
  assert.deepEqual(webpDimensions(imagePath), { width: 720, height: 720 }, `${exercise.sourceId}: imagen fuera del patrón 720 × 720`);
}
assert.equal(new Set(data.exercises.map((exercise) => exercise.image)).size, 87);
assert.equal(planner.validateInventoryMetadata(data).valid, true);
assert.equal(planner.validateExerciseMetadata(data.exercises, data).valid, true);
const equipmentVisuals = [
  ...data.equipment,
  ...data.equipment.flatMap((item) => item.accessories || []),
  ...data.equipmentAccessories
];
for (const item of equipmentVisuals) {
  const imagePath = path.resolve(root, item.image);
  assert.ok(fs.existsSync(imagePath), `${item.id}: imagen de equipamiento inexistente`);
  const dimensions = webpDimensions(imagePath);
  assert.ok(dimensions.width >= 900 && dimensions.height >= 676, `${item.id}: imagen de equipamiento con resolución insuficiente`);
}
assert.deepEqual(data.effortLevels.map((item) => item.id), ["easy", "normal", "hard"]);

assert.equal(generalBlueprints.length, 49);
assert.equal(hiitBlueprints.length, 48);
assert.equal(routineList.length, 97);
assert.deepEqual(generalBlueprints.map((routine) => routine.id), routineIds);
assert.deepEqual(hiitBlueprints.map((routine) => routine.id), hiitIds);
assert.ok(blueprints.every((routine) => routine.title && routine.title.trim() === routine.title));
assert.ok(blueprints.every((routine) => !/\b(?:Rower|Full[- ]Body|Upper|Lower|Core|Bench|Bodyweight|Attachments?|HIIT|EMOM|HIFT|SIT|KB)\b|\+|\b\d+:\d+\b/i.test(routine.title)), "Los títulos canónicos deben estar listos para interfaz y libres de códigos.");
assert.deepEqual(Object.keys(routines), [...routineIds, ...hiitIds]);
assert.deepEqual(
  Object.fromEntries(Object.entries(Object.groupBy(generalRoutines, (routine) => routine.section)).map(([section, items]) => [section, items.length])),
  {
    "Focalizadas por grupos musculares": 20,
    "Tren superior e inferior": 9,
    "Cuerpo completo y por equipamiento": 8,
    "Cardiovasculares e híbridas": 12
  }
);
assert.equal(routineList.filter((routine) => routine.kind === "fuerza").length, 37);
assert.equal(routineList.filter((routine) => routine.kind === "cardio").length, 9);
assert.equal(routineList.filter((routine) => routine.kind === "híbrida").length, 3);
assert.equal(routineList.filter((routine) => routine.kind === "hiit").length, 48);
assert.deepEqual(
  Object.fromEntries(Object.entries(Object.groupBy(hiitRoutines, (routine) => routine.section)).map(([section, items]) => [section, items.length])),
  {
    "Echo Rower": 8,
    Kettlebell: 8,
    "SmartBells sin banco": 8,
    "SmartBells + banco": 6,
    "Monster Bands": 8,
    "Peso corporal y attachments": 4,
    "Híbridas con Rower": 6
  }
);

for (const blueprint of generalBlueprints) {
  assert.ok(blueprint.description && blueprint.sequence && blueprint.tagsRaw);
  assert.ok(blueprint.regions.length && blueprint.objectives.length && blueprint.equipment.length && blueprint.durations.length);
  assert.ok(documentedLevels.has(blueprint.level));
  assert.ok(blueprint.durationRange[0] <= blueprint.estimatedMinutes && blueprint.estimatedMinutes <= blueprint.durationRange[1]);
  assert.ok(blueprint.items.length >= 1);
  assert.ok(blueprint.items.every((item) => sourceIds.includes(item.exerciseSourceId) && item.prescription));
  for (const removedField of ["family", "modes", "protocolFamily", "setsByTime", "exerciseName"]) assert.ok(!(removedField in blueprint), `${blueprint.id}: conserva ${removedField}`);
}

for (const blueprint of hiitBlueprints) {
  assert.ok(blueprint.description && blueprint.sequence && blueprint.tagsRaw && blueprint.warmup && blueprint.safety);
  assert.ok(blueprint.types.length && blueprint.regions.length && blueprint.equipment.length && blueprint.durations.length);
  assert.ok(documentedLevels.has(blueprint.level));
  assert.equal(blueprint.durationBasis, "main-block");
  assert.equal(blueprint.items.length, 1);
  assert.equal(blueprint.items[0].kind, "protocol");
  assert.equal(blueprint.items[0].prescription, blueprint.sequence);
  assert.ok(blueprint.exerciseSourceIds.every((sourceId) => sourceIds.includes(sourceId)));
  for (const removedField of ["family", "modes", "protocolFamily", "setsByTime", "exerciseName"]) assert.ok(!(removedField in blueprint), `${blueprint.id}: conserva ${removedField}`);
}

for (const routine of generalRoutines) {
  assert.ok(routine.items.every((item) => exerciseById.has(item.exerciseId)));
  assert.ok(routine.items.every((item) => sourceIds.includes(item.sourceId)));
  assert.deepEqual(routine.items.map((item) => item.sourceId), blueprints.find((item) => item.id === routine.id).items.map((item) => item.exerciseSourceId));
  const session = planner.sessionFor(routine);
  assert.equal(session.items.length, routine.items.length);
  assert.equal(planner.buildSessionSteps(session).length, routine.items.length);
  assert.deepEqual(session.items.map((item) => item.prescription), routine.items.map((item) => item.prescription));
}

const protocolRoutines = routineList.filter((routine) => routine.protocol);
assert.equal(protocolRoutines.length, 57);
for (const routine of routineList) {
  assert.equal(routine.durationBasis, "session", `${routine.id}: la duración no representa la sesión completa`);
  assert.ok(routine.durationRange[0] <= routine.estimatedMinutes && routine.estimatedMinutes <= routine.durationRange[1], routine.id);
  if (routine.protocol) {
    const totals = routine.protocol.variants.map((variant) => variant.metrics.totalSeconds);
    const selected = routine.protocol.variants.find((variant) => variant.id === routine.protocol.defaultVariantId);
    assert.ok(selected, `${routine.id}: variante predeterminada ausente`);
    assert.deepEqual(routine.durationRange, [Math.round(Math.min(...totals) / 60), Math.round(Math.max(...totals) / 60)], routine.id);
    assert.equal(routine.estimatedMinutes, Math.round(selected.metrics.totalSeconds / 60), routine.id);
    assert.match(routine.durationLabel, /^\d+(?:–\d+)? min totales$/, routine.id);
    assert.ok([routine.warmupCue, routine.cooldownCue, ...Object.values(routine.phaseGuidance)].every((cue) => cue.length <= 90 && !cue.includes("\n")), routine.id);
    for (const variant of routine.protocol.variants) {
      const summed = variant.segments.reduce((total, segment) => total + (segment.durationSeconds ?? segment.estimatedSeconds), 0);
      assert.equal(variant.metrics.mainSeconds, summed, `${routine.id}/${variant.id}`);
      assert.equal(variant.metrics.totalSeconds, variant.warmupSeconds + summed + variant.cooldownSeconds, `${routine.id}/${variant.id}`);
      assert.ok(variant.segments.every((segment) => segment.label && segment.guidance && segment.guidance.length <= 120 && !segment.guidance.includes("\n")), `${routine.id}/${variant.id}`);
      assert.ok(variant.segments.every((segment) => !/\b(?:E|R|H)\d{2}\b|\b(?:HIIT|EMOM|HIFT|RIR)\b/.test(`${segment.label} ${segment.guidance}`)), `${routine.id}/${variant.id}: código interno visible`);
    }
  } else {
    assert.ok(routine.items.every((item) => item.rest && item.rest.minimumSeconds <= item.rest.defaultSeconds && item.rest.defaultSeconds <= item.rest.maximumSeconds), routine.id);
  }
}

for (const routine of hiitRoutines) {
  assert.equal(routine.items.length, 1);
  assert.equal(routine.items[0].kind, "protocol");
  assert.ok(routine.exerciseIds.every((exerciseId) => exerciseById.has(exerciseId)));
  const steps = planner.buildSessionSteps(planner.sessionFor(routine));
  assert.equal(steps.length, 1);
  assert.equal(steps[0].kind, "protocol");
  assert.equal(steps[0].target, routine.sequence);
}

assert.deepEqual(routines.R01.items.map((item) => [item.sourceId, item.prescription]), [["E01", "4×6–10"], ["E02", "3×8–12"], ["E09", "3×10–15"], ["E21", "2–3×8–20"]]);
assert.equal(routines.R01.durationLabel, "35–45 min");
assert.deepEqual(routines.R01.objectives, ["hipertrofia", "fuerza"]);
assert.deepEqual(routines.R01.patterns, ["empuje-H"]);
assert.deepEqual(routines.R01.equipment, ["DB", "banco"]);
assert.deepEqual(routines.R01.stations, ["DB0"]);
assert.deepEqual(routines.R09.patterns, ["tirón-H", "tirón-V"]);
assert.deepEqual(routines.R13.equipment, ["bandas", "barra-band"]);
assert.equal(routines.R17.items.length, 2);
assert.ok(!routines.R17.items.some((item) => item.optional));
assert.equal(routines.R38.items.length, 1);
assert.ok(routines.R38.items[0].prescription.includes("20–45 min de remo continuo"));
assert.equal(routines.R06.items.find((item) => item.sourceId === "E23").optional, true);
assert.equal(routines.R27.items.find((item) => item.sourceId === "E48").optional, false);
assert.equal(routines.R37.items.find((item) => item.sourceId === "E70").optional, true);
assert.equal(routines.R46.items[0].prescription, "6×1 min fuerte/1 min fácil");
assert.equal(routines.R47.items[0].prescription, "20–30 min a 3,5–4,5 km/h");
assert.equal(routines.R48.exerciseSourceIds[0], "E91");
assert.equal(routines.R49.estimatedMinutes, 52);
assert.deepEqual(routines.H01.types, ["AER"]);
assert.deepEqual(routines.H01.formats, ["60:60"]);
assert.deepEqual(routines.H01.complements, ["SOLO", "POST-UP"]);
assert.deepEqual(routines.H01.exerciseSourceIds, ["E88"]);
assert.equal(routines.H01.sequence, "8–12 × 1:00 fuerte / 1:00 fácil. Mantener la recuperación remando, no completamente parado.");
assert.equal(routines.H01.phaseGuidance.work, "Rema a una intensidad fuerte pero sostenible.");
assert.equal(routines.H01.phaseGuidance.recovery, "Rema con intensidad fácil.");
assert.deepEqual(routines.H10.types, ["HIFT", "SIT"]);
assert.deepEqual(routines.H10.formats, ["20:10"]);
assert.equal(routines.H10.level, "Avanzado");
assert.deepEqual(routines.H16.exerciseSourceIds, ["E45", "E65", "E83", "E78"]);
assert.deepEqual(routines.H28.exerciseSourceIds, ["E50", "E63", "E03", "E30"]);
assert.deepEqual(routines.H48.exerciseSourceIds, ["E88", "E25", "E26"]);
assert.deepEqual(routines.H01.durationRange, [27, 35]);
assert.equal(routines.H01.estimatedMinutes, 31);
assert.deepEqual(routines.H24.durationRange, [30, 30]);
assert.deepEqual(routines.H24.durationBreakdown, { variantId: "standard", variantLabel: "5 rondas", warmupSeconds: 300, mainSeconds: 1200, workSeconds: 600, recoverySeconds: 600, cooldownSeconds: 300, totalSeconds: 1800 });
assert.deepEqual(routines.H14.durationRange, [22, 25]);
assert.deepEqual(routines.R41.durationRange, [25, 39]);
assert.equal(routines.R41.estimatedMinutes, 32);
assert.deepEqual(routines.R46.durationRange, [35, 50]);
assert.equal(routines.R46.estimatedMinutes, 42);
assert.equal(routines.R05.items.find((item) => item.sourceId === "E08").rest.defaultSeconds, 150);
assert.equal(routines.R10.items.find((item) => item.sourceId === "E43").rest.defaultSeconds, 75);
assert.ok(routines.R12.items.every((item) => item.rest.defaultSeconds !== 50));
assert.ok(routines.R18.items.every((item) => ![72, 73].includes(item.rest.defaultSeconds)));
assert.ok(routines.R20.items.every((item) => item.rest.defaultSeconds !== 84));
assert.ok(routines.R21.items.every((item) => item.rest.defaultSeconds !== 20));

const validation = planner.validateRoutineCatalog(data.exercises, routines, data);
assert.equal(validation.valid, true, validation.errors.join("\n"));
const coverage = planner.coverageFor(data.exercises, routines);
assert.equal(coverage.covered.length, 91);
assert.deepEqual(coverage.uncovered, []);
assert.ok(Object.values(coverage.appearances).every((count) => count >= 1));

const invalidCatalog = structuredClone(routines);
delete invalidCatalog.R49;
assert.equal(planner.validateRoutineCatalog(data.exercises, invalidCatalog, data).valid, false);
const invalidProtocolCatalog = structuredClone(routines);
invalidProtocolCatalog.H24.protocol.variants[0].segments[0].durationSeconds = 0;
assert.equal(planner.validateRoutineCatalog(data.exercises, invalidProtocolCatalog, data).valid, false);

const allFacets = planner.routineFilterFacets(routineList, {});
assert.equal(allFacets.options.length, 97);
assert.deepEqual(planner.routineFacets, ["library", "objective", "type", "region", "equipment", "duration", "level", "pattern", "station", "format", "logistics", "complement"]);
for (const facet of planner.routineFacets) {
  for (const option of allFacets.facets[facet]) {
    const filtered = planner.routineFilterFacets(routineList, { [facet]: option.value });
    assert.equal(filtered.options.length, option.count, `${facet}:${option.value}`);
    assert.ok(filtered.options.every((routine) => planner.routineMatchesFilters(routine, { [facet]: option.value })));
  }
}
const exactSelection = planner.routineFilterFacets(routineList, { objective: "hipertrofia", region: "pecho", equipment: "bandas", duration: "M", level: "Básico–intermedio" });
assert.deepEqual(exactSelection.options.map((routine) => routine.id), ["R03"]);
assert.equal(planner.routineFilterFacets(routineList, { library: "general" }).options.length, 49);
assert.equal(planner.routineFilterFacets(routineList, { library: "hiit" }).options.length, 48);
assert.deepEqual(planner.routineFilterFacets(routineList, { library: "hiit", type: "AER", equipment: "ROW", duration: "M", level: "Intermedio" }).options.map((routine) => routine.id), ["H01", "H02"]);
assert.deepEqual(planner.routineFilterFacets(routineList, { library: "hiit", complement: "FIN" }).options.map((routine) => routine.id), ["H36", "H41"]);
assert.deepEqual(planner.routineFilterFacets(routineList, { query: "aerobico continuo" }).options.map((routine) => routine.id), ["R38"]);
assert.ok(planner.routineFilterFacets(routineList, { query: "maquina de remo", library: "hiit" }).options.every((routine) => routine.library === "hiit" && routine.equipment.some((value) => ["ROW", "Rower", "ROW+KB", "ROW+DB", "ROW+BAND", "ROW+CU"].includes(value))));
assert.equal(planner.routineFacetLabel("library", "general"), "Rutinas generales");
assert.equal(planner.routineFacetLabel("library", "hiit"), "Intervalos de alta intensidad");
assert.equal(planner.routineFacetLabel("type", "HIFT"), "Entrenamiento funcional de alta intensidad");
assert.equal(planner.routineFacetLabel("equipment", "ROW+DB"), "Máquina de remo y mancuernas");
assert.equal(planner.routineFacetLabel("duration", "XS"), "Muy corta");
assert.equal(planner.routineFacetLabel("pattern", "empuje-H"), "Empuje horizontal");
assert.equal(planner.routineFacetLabel("station", "DB0"), "Mancuernas con banco plano");
assert.equal(planner.routineFacetLabel("format", "60:60"), "60 segundos de trabajo y 60 de recuperación");
assert.equal(planner.routineFacetLabel("complement", "FIN"), "Finalizador de otra sesión");

const initialExerciseFacets = planner.exerciseFilterFacets(data.exercises, {});
assert.equal(initialExerciseFacets.options.length, 91);
for (const groupOption of initialExerciseFacets.facets.muscle) {
  const filtered = planner.exerciseFilterFacets(data.exercises, { muscle: groupOption.value });
  assert.equal(filtered.options.length, groupOption.count);
  assert.ok(filtered.options.every((exercise) => exercise.muscleGroups.includes(groupOption.value)));
}
for (const equipmentOption of initialExerciseFacets.facets.equipment) {
  const filtered = planner.exerciseFilterFacets(data.exercises, { equipment: equipmentOption.value });
  assert.equal(filtered.options.length, equipmentOption.count);
}
assert.deepEqual(planner.exerciseFilterFacets(data.exercises, { query: "E83" }).options.map((exercise) => exercise.sourceId), ["E83"]);

const metrics = planner.scheduleMetrics(["R01", "R38", "R44", "H01", null, null, null], routines);
assert.deepEqual(metrics, { planned: 4, strength: 1, cardio: 1, hybrid: 1, hiit: 1, minutes: routines.R01.estimatedMinutes + routines.R38.estimatedMinutes + routines.R44.estimatedMinutes + routines.H01.estimatedMinutes });

const migrated = planner.migrateState({
  activeProfile: "marta",
  selectedMode: "hipertrofia",
  selectedTime: "express",
  selectedVariant: "express",
  schedules: { marta: ["R01", "PCH-01", "R46", "H48"] },
  completions: [
    { profileId: "marta", routineId: "R01", date: "2026-08-20", variant: "express" },
    { profileId: "marta", routineId: "PCH-01", date: "2026-08-21", variant: "completa" }
  ]
}, routines, data);
assert.equal(migrated.activeProfile, "personal");
assert.deepEqual(migrated.schedules.personal.slice(0, 4), ["R01", null, "R46", "H48"]);
assert.deepEqual(migrated.completions.map((item) => item.routineId), ["R01"]);
for (const removedKey of ["selectedMode", "selectedTime", "selectedVariant"]) assert.ok(!(removedKey in migrated));
assert.ok(!("variant" in migrated.completions[0]));

const sanitized = planner.migrateState({
  activeProfile: "personal",
  availableDays: [6, 3, 6, -1, 7, "2"],
  schedules: { personal: ["R01", "rutina-inexistente"] },
  completions: [
    { id: "sesion-valida", profileId: "personal", routineId: "R01", date: "2026-08-23", duration: "<img src=x onerror=alert(1)>", exercises: 999, completedAt: "fecha-invalida", variant: "completa" },
    { profileId: "personal", routineId: "R01", date: "2026-08-23", duration: 42, exercises: 2, completedAt: "2026-08-23T18:00:00.000Z" },
    { profileId: "personal", routineId: "R01", date: "2026-02-30", duration: 42 },
    { profileId: "personal", routineId: "rutina-inexistente", date: "2026-08-24", duration: 42 },
    null
  ],
  preferences: { reducedMotion: "sí" },
  arbitraryImportedField: "no debe persistir"
}, routines, data);
assert.ok(!("availableDays" in sanitized));
assert.deepEqual(sanitized.schedules.personal, ["R01", null, null, null, null, null, null]);
assert.equal(sanitized.completions.length, 2);
assert.deepEqual(sanitized.completions[1], {
  id: "2026-08-23-R01-1",
  profileId: "personal",
  routineId: "R01",
  date: "2026-08-23",
  duration: 42,
  exercises: 2,
  completedAt: "2026-08-23T18:00:00.000Z",
  plannedMinutes: routines.R01.estimatedMinutes,
  plannedSeconds: routines.R01.estimatedMinutes * 60,
  protocolVariantId: null,
  sessionDurationSeconds: 0,
  performance: []
});
assert.equal(sanitized.completions[0].id, "sesion-valida");
assert.equal(sanitized.completions[0].duration, routines.R01.estimatedMinutes);
assert.equal(sanitized.completions[0].exercises, routines.R01.items.length);
assert.equal(sanitized.completions[0].completedAt, "2026-08-23T12:00:00.000Z");
assert.deepEqual(sanitized.preferences, { reducedMotion: false });
assert.equal(sanitized.activeWorkout, null);
assert.ok(!("arbitraryImportedField" in sanitized));

const diaryMigration = planner.migrateState({
  completions: [{
    routineId: "R01",
    date: "2026-08-24",
    performance: [
      { exerciseId: "e01", prescription: "4×6–10", notes: "<img src=x onerror=alert(1)>", effort: "hard", selection: { modality: "smartbells-pro", loadKg: 10 }, sets: [{ number: 1, reps: 5000, repetitionsInReserve: -2, completed: true, selection: { modality: "smartbells-pro", loadKg: 10 }, arbitrary: true }] },
      { exerciseId: "ejercicio-inexistente", sets: [] }
    ]
  }],
  activeWorkout: { routineId: "R01", date: "2026-08-24" }
}, routines, data);
assert.equal(diaryMigration.completions[0].performance.length, 1);
assert.equal(diaryMigration.completions[0].performance[0].sets[0].reps, 999);
assert.equal(diaryMigration.completions[0].performance[0].sets[0].repetitionsInReserve, 0);
assert.equal(diaryMigration.completions[0].performance[0].effort, "hard");
assert.ok(!("arbitrary" in diaryMigration.completions[0].performance[0].sets[0]));

const protocolHistory = planner.migrateState({
  completions: [{ routineId: "H01", date: "2026-08-24", protocolVariantId: "long" }]
}, routines, data).completions[0];
assert.equal(protocolHistory.protocolVariantId, "long");
assert.equal(protocolHistory.plannedSeconds, 2100);
assert.equal(protocolHistory.plannedMinutes, 35);
assert.deepEqual(diaryMigration.activeWorkout, { routineId: "R01", date: "2026-08-24" });

const repeatedSessions = planner.migrateState({
  completions: [
    { id: "morning", routineId: "R01", date: "2026-08-24", duration: 40 },
    { id: "evening", routineId: "R01", date: "2026-08-24", duration: 45 },
    { id: "evening", routineId: "R01", date: "2026-08-24", duration: 46 }
  ]
}, routines, data).completions;
assert.equal(repeatedSessions.length, 2, "Dos sesiones reales del mismo día deben conservarse por separado.");
assert.equal(repeatedSessions.find((item) => item.id === "evening").duration, 46, "Una entrada repetida con el mismo identificador debe actualizarse.");

const appSource = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const routineSource = fs.readFileSync(path.join(root, "js/routines.js"), "utf8");
const hiitSource = fs.readFileSync(path.join(root, "js/hiit-routines.js"), "utf8");
const sessionModelSource = fs.readFileSync(path.join(root, "js/session-model.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
assert.ok(appSource.includes("function renderBadge(") && appSource.includes("function renderNumberBadge("), "La interfaz debe construir todos los badges con el componente compartido.");
assert.ok(!/variantsLabel\)\}<\/h3>\$\{renderNumberBadge\(item\.variants\.length/.test(appSource), "El título de ajustes ya incluye el total y no debe repetirlo en un badge.");
assert.equal((cssSource.match(/^\.ui-badge\s*\{/gm) || []).length, 1, "La geometría base del badge debe definirse una sola vez.");
assert.ok(cssSource.includes(".ui-badge--number") && cssSource.includes("font-variant-numeric: tabular-nums"), "Los contadores deben usar la variante numérica canónica.");
assert.match(cssSource, /\.exercise-card \{ --mobile-exercise-image: 146px;[^}]*height: calc\(var\(--mobile-exercise-image\) \+ 2px\)/, "Las tarjetas móviles de ejercicios deben conservar una altura fija basada en su imagen.");
assert.match(cssSource, /\.exercise-image \{ width: var\(--mobile-exercise-image\); height: var\(--mobile-exercise-image\);[^}]*aspect-ratio: 1;/, "La miniatura móvil debe conservar geometría cuadrada.");
for (const legacyBadge of ["streak-badge", "schedule-today-badge", "exercise-badge", "quantity-pill", "target-chip", "tag-filter-match"]) {
  assert.ok(!appSource.includes(legacyBadge) && !cssSource.includes(legacyBadge), `El badge heredado ${legacyBadge} debe migrarse al componente único.`);
}
for (const removedConcept of ["PCH-01", "randomize-week", "data-plan-mode", "data-plan-time", "8 ejercicios", "E/H/M/C", "filter-routine-family"]) assert.ok(!appSource.includes(removedConcept), `app.js conserva ${removedConcept}`);
for (const internalPresentation of ["item.tagsRaw.split", "escapeHtml(item.sourceId)", "escapeHtml(movement.sourceId)", "escapeHtml(item.id)} ·"]) assert.ok(!appSource.includes(internalPresentation), `app.js muestra ${internalPresentation}`);
for (const duplicatedCatalog of ["ROUTINE_TITLE_LABELS", "EXERCISE_TITLE_LABELS", "EQUIPMENT_NAME_LABELS", "LOAD_MODALITIES"]) assert.ok(!appSource.includes(duplicatedCatalog), `app.js vuelve a duplicar ${duplicatedCatalog}`);
assert.deepEqual(appSource.match(/\b(?:E|R|H)\d{2}\b/g) || [], [], "La interfaz no debe contener identificadores de catálogo escritos a mano.");
assert.deepEqual(appSource.match(/["'](?:e|r|h)\d{2}["']/g) || [], [], "La interfaz no debe seleccionar registros por identificadores escritos a mano.");
assert.ok(routineList.every((routine) => routine.equipmentRefs.length), "Toda rutina compilada debe exponer referencias de equipamiento canónicas.");
assert.ok(data.equipment.every((item) => !item.selection || item.selection.modality), "Las modalidades seleccionables deben definirse en el inventario.");
for (const removedConcept of ["exerciseName", "protocolFamily", "setsByTime", "PCH-01"]) assert.ok(!routineSource.includes(removedConcept), `routines.js conserva ${removedConcept}`);
for (const removedConcept of ["exerciseName", "protocolFamily", "setsByTime", "PCH-01"]) assert.ok(!hiitSource.includes(removedConcept), `hiit-routines.js conserva ${removedConcept}`);
for (const executionField of ["phaseGuidance", "warmupCue", "cooldownCue"]) assert.ok(!hiitSource.includes(executionField), `hiit-routines.js duplica ${executionField}`);
assert.ok(sessionModelSource.includes("phaseGuidance") && sessionModelSource.includes("warmupCue") && sessionModelSource.includes("cooldownCue"));
assert.equal(fs.existsSync(path.join(root, "scripts/import_routines_docx.py")), false);
assert.ok(indexSource.indexOf("js/exercises.js") < indexSource.indexOf("js/data.js"));
assert.ok(indexSource.indexOf("js/data.js") < indexSource.indexOf("js/routines.js"));
assert.ok(indexSource.indexOf("js/routines.js") < indexSource.indexOf("js/hiit-routines.js"));
assert.ok(indexSource.indexOf("js/hiit-routines.js") < indexSource.indexOf("js/session-model.js"));
assert.ok(indexSource.indexOf("js/session-model.js") < indexSource.indexOf("js/planner.js"));
assert.ok(indexSource.indexOf("js/planner.js") < indexSource.indexOf("js/workout.js"));
assert.ok(indexSource.indexOf("js/workout.js") < indexSource.indexOf("js/app.js"));
assert.ok(indexSource.indexOf("js/workout.js") < indexSource.indexOf("js/state-io.js"));
assert.ok(indexSource.indexOf("js/state-io.js") < indexSource.indexOf("js/app.js"));
assert.ok(indexSource.includes("Entrenamiento") && !indexSource.includes("Constancia"));
assert.ok(indexSource.includes('id="workout-screen"'));
assert.ok(!indexSource.includes('id="workout-dialog"'));
assert.ok(!appSource.includes("workout-step-list"));
assert.ok(!appSource.includes("availableDays"));
assert.equal((appSource.match(/state\.completions\.push\(record\)/g) || []).length, 1, "Solo el cierre validado del reproductor debe guardar progreso.");
assert.ok(appSource.indexOf("function finishWorkout()") < appSource.indexOf("state.completions.push(record)"));
assert.ok(appSource.includes("WORKOUT_ENGINE.workoutComplete(workout)") && appSource.includes("WORKOUT_ENGINE.effortComplete(workout)"));
const modalCloseButtons = [...appSource.matchAll(/<button[^>]+data-action="close-dialog"[^>]+aria-label="Cerrar"[^>]*>/g)].map((match) => match[0]);
assert.ok(modalCloseButtons.length >= 5 && modalCloseButtons.every((button) => /class="[^"]*icon-button[^"]*dialog-close/.test(button)));
assert.ok(cssSource.includes(".dialog-close:hover") && cssSource.includes(".dialog-close:active"));

console.log("Tests passed: E01–E91 exercises, R01–R49 and H01–H48 routines, taxonomy, presets, coverage, sessions, assets, and hardened migration validated.");
