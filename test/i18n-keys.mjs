// node test/i18n-keys.mjs
// 1. i18n.js defines the same keys in every language, none empty.
// 2. Every key the code uses exists (T('key'), label(el, attr, 'key'), button(text, 'key', ...),
//    data-i18n / data-i18n-aria in popup.html, MODE_HINT_KEYS, showMessage('key')).
// 3. No Indonesian UI copy is left in content.js / popup.js / popup.html (it belongs in i18n.js).
// 4. pipsubLang resolves 'auto' from the browser language.
// 5. Both _locales message files parse and have the same keys.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];

const load = (language) => {
  const ctx = { navigator: { language } };
  vm.createContext(ctx);
  vm.runInContext(read('i18n.js'), ctx);
  return ctx;
};
const ctx = load('en-US');
const S = ctx.PIPSUB_STRINGS;
const langs = Object.keys(S);
if (langs.sort().join() !== 'en,id') fail.push(`languages: ${langs}`);
const enKeys = Object.keys(S.en).sort();
for (const l of langs) {
  const keys = Object.keys(S[l]).sort();
  const missing = enKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !enKeys.includes(k));
  if (missing.length) fail.push(`${l} missing: ${missing}`);
  if (extra.length) fail.push(`${l} extra: ${extra}`);
  for (const k of keys) if (typeof S[l][k] !== 'string' || !S[l][k].trim()) fail.push(`${l}.${k} empty`);
}

const content = read('content.js');
const popupJs = read('popup.js');
const popupHtml = read('popup.html');
const used = new Set();
const grab = (src, re) => { for (const m of src.matchAll(re)) used.add(m[1]); };
grab(content, /\bT\('([A-Za-z0-9]+)'\)/g);
grab(content, /\blabel\([^,]+,\s*'[^']+',\s*'([A-Za-z0-9]+)'\)/g);
grab(content, /\bbutton\('[^']*',\s*'([A-Za-z0-9]+)'/g);
grab(popupJs, /\bT\('([A-Za-z0-9]+)'\)/g);
grab(popupJs, /showMessage\('([A-Za-z0-9]+)'\)/g);
grab(popupJs, /:\s*'(hint[A-Za-z]+)'/g);
grab(popupHtml, /data-i18n(?:-aria)?="([A-Za-z0-9]+)"/g);
for (const k of used) if (!enKeys.includes(k)) fail.push(`used but undefined: ${k}`);
if (used.size < 25) fail.push(`only ${used.size} keys found in use; extraction regexes broken?`);

// Indonesian words that only appear in UI copy.
const ID_WORDS = ['Buka', 'Tampilkan', 'Ukuran', 'Tidak ada', 'Subtitle tidak', 'Bersih', 'Lengkap',
  'Mode tampilan', 'Cek skor', 'Perkecil', 'Perbesar', 'Muat file', 'Lepas file', 'Mundur', 'Maju',
  'Putar', 'Bisukan', 'Klik untuk', 'Bahasa', 'detik', 'otomatis', 'pindah tab', 'Menyalakan',
  'lintas-domain', 'Posisi video', 'lompat'];
for (const [name, src] of [['content.js', content], ['popup.js', popupJs], ['popup.html', popupHtml]]) {
  for (const w of ID_WORDS) {
    const i = src.indexOf(w);
    if (i >= 0) fail.push(`${name}: Indonesian "${w}" at line ${src.slice(0, i).split('\n').length}`);
  }
}

const lang = (navLang, setting) => load(navLang).pipsubLang(setting);
const cases = [['id-ID', 'auto', 'id'], ['in', 'auto', 'id'], ['en-US', 'auto', 'en'], ['de', 'auto', 'en'],
  ['id-ID', 'en', 'en'], ['en-US', 'id', 'id'], ['en-US', undefined, 'en']];
for (const [nav, setting, want] of cases) {
  const got = lang(nav, setting);
  if (got !== want) fail.push(`pipsubLang(${setting}) with ${nav} = ${got}, want ${want}`);
}

const msgs = ['en', 'id'].map((l) => JSON.parse(read(`_locales/${l}/messages.json`)));
if (Object.keys(msgs[0]).sort().join() !== Object.keys(msgs[1]).sort().join()) fail.push('_locales keys differ');
const manifest = JSON.parse(read('manifest.json'));
for (const m of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
  if (!msgs[0][m[1]] || !msgs[1][m[1]]) fail.push(`manifest uses missing message ${m[1]}`);
}

if (fail.length) {
  console.error('i18n check FAILED:\n  ' + fail.join('\n  '));
  process.exit(1);
}
console.log(`i18n check: ${enKeys.length} keys x ${langs.length} languages, ${used.size} used keys defined, no Indonesian copy outside i18n.js`);
