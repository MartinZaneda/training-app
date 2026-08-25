const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const metadataChunks = new Set(["EXIF", "ICCP", "XMP "]);
const extendedMetadataFlags = 0x20 | 0x08 | 0x04;

function sanitizeWebp(source) {
  assert.ok(source.length >= 12, "El archivo WebP es demasiado corto.");
  assert.equal(source.toString("ascii", 0, 4), "RIFF", "Falta la cabecera RIFF.");
  assert.equal(source.toString("ascii", 8, 12), "WEBP", "Falta la firma WEBP.");

  const chunks = [];
  let offset = 12;
  while (offset < source.length) {
    assert.ok(offset + 8 <= source.length, "La cabecera de chunk WebP está truncada.");
    const type = source.toString("ascii", offset, offset + 4);
    const size = source.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    const paddedEnd = dataEnd + (size % 2);
    assert.ok(paddedEnd <= source.length, `El chunk ${type} está truncado.`);

    if (!metadataChunks.has(type)) {
      const chunk = Buffer.from(source.subarray(offset, paddedEnd));
      if (type === "VP8X") {
        assert.ok(size >= 1, "El chunk VP8X no contiene sus flags.");
        chunk[8] &= ~extendedMetadataFlags;
      }
      chunks.push(chunk);
    }
    offset = paddedEnd;
  }

  const header = Buffer.from(source.subarray(0, 12));
  const sanitized = Buffer.concat([header, ...chunks]);
  sanitized.writeUInt32LE(sanitized.length - 8, 4);
  return sanitized;
}

if (require.main === module) {
  const files = process.argv.slice(2);
  assert.ok(files.length, "Indica al menos un archivo WebP.");
  for (const file of files) {
    const original = fs.readFileSync(file);
    const sanitized = sanitizeWebp(original);
    if (!sanitized.equals(original)) {
      const mode = fs.statSync(file).mode;
      fs.writeFileSync(file, sanitized, { mode });
      process.stdout.write(`Metadatos eliminados: ${path.normalize(file)}\n`);
    }
  }
}

module.exports = { sanitizeWebp };
