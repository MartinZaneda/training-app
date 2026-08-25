(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TrainingStateIO = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PRODUCT_NAME = "Entrenamiento";
  const LEGACY_PRODUCT_NAMES = Object.freeze(["Constancia"]);
  const BACKUP_FORMAT_VERSION = 1;
  const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

  function byteLength(value) {
    const text = String(value ?? "");
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).byteLength;
    if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
    return unescape(encodeURIComponent(text)).length;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function assertState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Estado no válido");
    if (!Array.isArray(value.completions)) throw new TypeError("El historial no es válido");
  }

  function createBackup(state, options = {}) {
    assertState(state);
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    if (!Number.isFinite(now.getTime())) throw new TypeError("Fecha de exportación no válida");
    return {
      product: PRODUCT_NAME,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: String(options.appVersion || state.version || ""),
      exportedAt: now.toISOString(),
      data: clone(state)
    };
  }

  function backupFilename(localDate) {
    const date = String(localDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError("Fecha local no válida");
    return `entrenamiento-copia-${date}.json`;
  }

  function parseBackupText(text, options = {}) {
    const source = String(text ?? "");
    if (!source.trim()) throw new TypeError("La copia está vacía");
    if (byteLength(source) > (options.maxBytes || MAX_BACKUP_BYTES)) throw new RangeError("La copia supera el tamaño permitido");

    const payload = JSON.parse(source);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Copia no válida");
    const wrapped = Object.prototype.hasOwnProperty.call(payload, "data");
    if (wrapped) {
      const acceptedProducts = new Set([PRODUCT_NAME, ...LEGACY_PRODUCT_NAMES]);
      if (!acceptedProducts.has(payload.product)) throw new TypeError("La copia pertenece a otra aplicación");
      const formatVersion = Number(payload.formatVersion ?? 1);
      if (!Number.isInteger(formatVersion) || formatVersion < 1 || formatVersion > BACKUP_FORMAT_VERSION) throw new TypeError("Versión de copia no compatible");
    }

    const rawState = wrapped ? payload.data : payload;
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) throw new TypeError("Estado importado no válido");
    const migrated = typeof options.migrateState === "function" ? options.migrateState(rawState) : clone(rawState);
    assertState(migrated);
    if (options.appVersion !== undefined) migrated.version = options.appVersion;
    if (typeof options.profileExists === "function" && !options.profileExists(migrated.activeProfile)) throw new TypeError("Perfil importado no válido");
    return migrated;
  }

  return Object.freeze({
    PRODUCT_NAME,
    LEGACY_PRODUCT_NAMES,
    BACKUP_FORMAT_VERSION,
    MAX_BACKUP_BYTES,
    byteLength,
    createBackup,
    backupFilename,
    parseBackupText
  });
});
