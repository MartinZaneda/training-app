const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sanitizeWebp } = require("../scripts/strip_webp_metadata.js");

const root = path.resolve(__dirname, "..");
const workflowDirectory = path.join(root, ".github", "workflows");
const ignoredDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
const textExtensions = new Set(["", ".css", ".html", ".js", ".json", ".md", ".py", ".svg", ".txt", ".yaml", ".yml"]);
const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
  const absolutePath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
});
const workflowFiles = fs.readdirSync(workflowDirectory)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();

assert.ok(workflowFiles.length >= 2, "Deben existir los workflows de calidad y análisis de seguridad.");

for (const fileName of workflowFiles) {
  const source = fs.readFileSync(path.join(workflowDirectory, fileName), "utf8");
  const actionReferences = [...source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
  const checkoutReferences = actionReferences.filter((reference) => reference.startsWith("actions/checkout@"));

  assert.match(source, /^  push:\n    branches:\n      - master$/m, `${fileName} solo debe reaccionar a pushes en master.`);
  assert.doesNotMatch(source, /^  (?:pull_request|pull_request_target|issue_comment|issues|workflow_run):/m, `${fileName} no debe aceptar eventos iniciables por terceros.`);
  assert.match(source, /^permissions:\n  contents: read$/m, `${fileName} debe partir de permisos de solo lectura.`);
  assert.ok(actionReferences.length > 0, `${fileName} debe declarar al menos una Action auditable.`);

  for (const reference of actionReferences) {
    assert.match(reference, /^(?:actions\/[\w-]+|github\/codeql-action\/[\w-]+)@[0-9a-f]{40}$/, `${reference} debe ser una Action oficial fijada a un SHA inmutable.`);
  }

  assert.equal((source.match(/persist-credentials: false/g) || []).length, checkoutReferences.length, `${fileName} no debe conservar credenciales del checkout.`);
  assert.doesNotMatch(source, /^\s+contents: write$/m, `${fileName} nunca debe conceder escritura sobre el código.`);
}

const qualityWorkflow = fs.readFileSync(path.join(workflowDirectory, "quality-and-pages.yml"), "utf8");
assert.match(qualityWorkflow, /^    if: github\.actor == github\.repository_owner$/m, "El pipeline de publicación debe admitir únicamente al propietario.");
assert.match(qualityWorkflow, /pip install[^\n]+--require-hashes/, "La instalación Python debe exigir hashes.");

const requirements = fs.readFileSync(path.join(root, "requirements-dev.txt"), "utf8");
assert.equal((requirements.match(/--hash=sha256:[0-9a-f]{64}/g) || []).length, 2, "La dependencia Python debe fijar wheel y distribución fuente.");

const securityPolicy = fs.readFileSync(path.join(root, ".github", "SECURITY.md"), "utf8");
assert.match(securityPolicy, /Security > Advisories > Report a vulnerability/, "Los informes de seguridad deben dirigirse al canal privado.");

const packageManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(packageManifest.private, true, "El paquete nunca debe poder publicarse accidentalmente en npm.");

const knownHandle = ["martin", "zaneda"].join("");
const knownAccountId = ["286", "4757"].join("");
const knownLocalUser = ["/home/", "nit", "ro"].join("");
const forbiddenPersonalData = [
  { label: "identificador personal", pattern: new RegExp(knownHandle, "i") },
  { label: "identificador numérico de cuenta", pattern: new RegExp(`\\b${knownAccountId}\\b`) },
  { label: "ruta local personal", pattern: new RegExp(knownLocalUser.replaceAll("/", "\\/"), "i") },
  { label: "dirección de correo", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { label: "ruta de usuario", pattern: /\/(?:home|Users)\/[A-Za-z0-9._-]+/i }
];
const repositoryFiles = walkFiles(root);
for (const filePath of repositoryFiles.filter((filePath) => textExtensions.has(path.extname(filePath)))) {
  const source = fs.readFileSync(filePath, "utf8");
  for (const forbidden of forbiddenPersonalData) assert.doesNotMatch(source, forbidden.pattern, `${path.relative(root, filePath)} contiene ${forbidden.label}.`);
}

const webpMetadataChunks = ["EXIF", "XMP ", "ICCP"].map((marker) => Buffer.from(marker, "ascii"));
const waveMetadataChunks = ["IART", "ICMT", "ICOP", "INAM", "ISFT"].map((marker) => Buffer.from(marker, "ascii"));

const createWebpChunk = (type, content) => {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32LE(content.length, 4);
  return Buffer.concat([header, content, Buffer.alloc(content.length % 2)]);
};
const webpChunks = [
  createWebpChunk("VP8X", Buffer.from([0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
  createWebpChunk("EXIF", Buffer.from("private metadata")),
  createWebpChunk("XMP ", Buffer.from("private metadata")),
  createWebpChunk("ICCP", Buffer.from("private metadata")),
  createWebpChunk("VP8 ", Buffer.from("image payload"))
];
const webpFixture = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP", "binary"), ...webpChunks]);
webpFixture.writeUInt32LE(webpFixture.length - 8, 4);
const sanitizedWebpFixture = sanitizeWebp(webpFixture);
for (const chunk of webpMetadataChunks) assert.equal(sanitizedWebpFixture.indexOf(chunk), -1, `El saneador debe eliminar ${chunk.toString("ascii").trim()}.`);
assert.equal(sanitizedWebpFixture[sanitizedWebpFixture.indexOf(Buffer.from("VP8X")) + 8] & 0x2c, 0, "El saneador debe desactivar los indicadores de metadatos VP8X.");
assert.notEqual(sanitizedWebpFixture.indexOf(Buffer.from("image payload")), -1, "El saneador debe conservar los datos visuales.");
assert.equal(sanitizedWebpFixture.readUInt32LE(4), sanitizedWebpFixture.length - 8, "El saneador debe corregir el tamaño RIFF.");

for (const filePath of repositoryFiles.filter((filePath) => filePath.startsWith(path.join(root, "public")))) {
  const data = fs.readFileSync(filePath);
  const chunks = filePath.endsWith(".webp") ? webpMetadataChunks : filePath.endsWith(".wav") ? waveMetadataChunks : [];
  for (const chunk of chunks) assert.equal(data.indexOf(chunk), -1, `${path.relative(root, filePath)} contiene metadatos ${chunk.toString("ascii").trim()}.`);
  const binaryText = data.toString("latin1");
  for (const forbidden of forbiddenPersonalData) assert.doesNotMatch(binaryText, forbidden.pattern, `${path.relative(root, filePath)} contiene ${forbidden.label} en datos binarios.`);
}

assert.equal(fs.existsSync(path.join(root, ".github", "CODEOWNERS")), false, "Un repositorio personal no debe publicar el identificador de su propietario en CODEOWNERS.");

console.log("Tests passed: owner-only workflows, immutable Actions, private reporting, dependency hashes, and zero personal metadata validated.");
