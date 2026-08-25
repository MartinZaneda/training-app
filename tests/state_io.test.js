"use strict";

const assert = require("node:assert/strict");
const io = require("../js/state-io.js");

const original = {
  version: "2026.08",
  activeProfile: "personal",
  schedules: { personal: ["R01", null, null, null, null, null, null] },
  completions: [{ id: "session-1", routineId: "R01", date: "2026-08-25" }],
  preferences: { reducedMotion: false },
  activeWorkout: null
};
const exportedAt = new Date("2026-08-25T10:30:00.000Z");
const backup = io.createBackup(original, { appVersion: "2026.08", now: exportedAt });

assert.equal(io.PRODUCT_NAME, "Entrenamiento");
assert.equal(backup.product, "Entrenamiento");
assert.equal(backup.formatVersion, 1);
assert.equal(backup.appVersion, "2026.08");
assert.equal(backup.exportedAt, exportedAt.toISOString());
assert.deepEqual(backup.data, original);
assert.notEqual(backup.data, original, "La copia no debe compartir referencias mutables con el estado activo.");
original.completions[0].id = "changed-after-export";
assert.equal(backup.data.completions[0].id, "session-1");
assert.equal(io.backupFilename("2026-08-25"), "entrenamiento-copia-2026-08-25.json");

const parsed = io.parseBackupText(JSON.stringify(backup), {
  appVersion: "2026.09",
  migrateState: (state) => ({ ...state, activeProfile: "personal", completions: [...state.completions] }),
  profileExists: (profileId) => profileId === "personal"
});
assert.equal(parsed.version, "2026.09");
assert.equal(parsed.completions[0].id, "session-1");

const legacyWrapper = { product: "Constancia", exportedAt: exportedAt.toISOString(), data: backup.data };
assert.equal(io.parseBackupText(JSON.stringify(legacyWrapper)).completions.length, 1, "Las copias de la marca anterior deben seguir siendo importables.");
assert.equal(io.parseBackupText(JSON.stringify(backup.data)).activeProfile, "personal", "El estado sin envoltorio debe seguir siendo importable.");

assert.throws(() => io.createBackup({ completions: "invalid" }), /historial/i);
assert.throws(() => io.backupFilename("25-08-2026"), /fecha/i);
assert.throws(() => io.parseBackupText(""), /vacía/i);
assert.throws(() => io.parseBackupText("not-json"), SyntaxError);
assert.throws(() => io.parseBackupText(JSON.stringify({ product: "Otra", data: backup.data })), /otra aplicación/i);
assert.throws(() => io.parseBackupText(JSON.stringify({ ...backup, formatVersion: 2 })), /no compatible/i);
assert.throws(() => io.parseBackupText(JSON.stringify({ ...backup, formatVersion: 0 })), /no compatible/i);
assert.throws(() => io.parseBackupText(JSON.stringify({ ...backup, data: { completions: null } })), /historial/i);
assert.throws(() => io.parseBackupText(JSON.stringify(backup), { profileExists: () => false }), /perfil/i);
assert.throws(() => io.parseBackupText("á".repeat(io.MAX_BACKUP_BYTES)), /tamaño/i, "El límite debe medirse en bytes UTF-8.");

console.log("Tests passed: versioned export, legacy import, validation, size limits, and backup isolation validated.");
