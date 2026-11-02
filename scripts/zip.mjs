// Packages the extension for the Chrome Web Store: dist/pip-subtitle-<version>.zip.
//   node scripts/zip.mjs           write the zip
//   node scripts/zip.mjs --check   only validate (file list, references, versions); used by `npm run check`
// Pure Node (zlib deflate + a small zip writer), no dependencies. Entries are sorted and carry a
// fixed timestamp, so the same sources give the same zip.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const problems = [];

// ---- What goes in: exactly the files the extension loads.
const FIXED = ['manifest.json', 'content.js', 'i18n.js', 'popup.js', 'popup.html',
  'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];
const walk = (rel) => fs.readdirSync(path.join(root, rel), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(`${rel}/${d.name}`) : [`${rel}/${d.name}`]));
const files = [...FIXED, ...walk('_locales')].sort();
for (const f of files) if (!fs.existsSync(path.join(root, f))) problems.push(`missing file: ${f}`);

// ---- Everything the manifest and popup reference must be in the list.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const referenced = new Set([
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {}),
  manifest.action && manifest.action.default_popup,
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean));
const popup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
for (const m of popup.matchAll(/\b(?:src|href)="([^"#:]+)"/g)) referenced.add(m[1]);
for (const r of referenced) if (!files.includes(r)) problems.push(`referenced but not packaged: ${r}`);
if (manifest.default_locale && !files.includes(`_locales/${manifest.default_locale}/messages.json`)) {
  problems.push(`default_locale ${manifest.default_locale} has no messages.json`);
}
for (const f of files.filter((x) => x.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { problems.push(`${f}: ${e.message}`); }
}

// ---- package.json version must match the manifest.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== manifest.version) problems.push(`package.json ${pkg.version} != manifest ${manifest.version}`);

if (problems.length) {
  console.error('zip: ' + problems.join('\n     '));
  process.exit(1);
}
if (checkOnly) {
  console.log(`zip check: ${files.length} files, version ${manifest.version}, all references packaged`);
  process.exit(0);
}

// ---- Zip writer (deflate, no zip64; the extension is far below 4 GB).
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// DOS date/time for 2026-01-01 00:00 (fixed, for reproducible output).
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = fs.readFileSync(path.join(root, name));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const stored = deflated.length >= data.length; // tiny/incompressible files: store
  const body = stored ? data : deflated;
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(stored ? 0 : 8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(stored ? 0 : 8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  // extra, comment, disk, internal attrs = 0; external attrs = 0
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `pip-subtitle-${manifest.version}.zip`);
fs.writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`wrote ${path.relative(root, out)} (${files.length} files, ${fs.statSync(out).size} bytes)`);
for (const f of files) console.log('  ' + f);
