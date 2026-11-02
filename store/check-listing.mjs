// node store/check-listing.mjs — Chrome Web Store limits for the text in store/listing.md.
// Short description ≤ 132 characters (each language); detailed description ≤ 16 000.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const md = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'listing.md'), 'utf8');
const section = (title) => {
  const start = md.indexOf(title);
  if (start < 0) throw new Error(`missing section ${title}`);
  const rest = md.slice(start + title.length);
  const next = rest.search(/\n#{2,3} /);
  return next < 0 ? rest : rest.slice(0, next);
};
const fail = [];
const short = section('## Short description');
for (const lang of ['EN', 'ID']) {
  const m = short.match(new RegExp(`\\*\\*${lang}:\\*\\*\\n(.+)`));
  if (!m) { fail.push(`short ${lang} missing`); continue; }
  const n = [...m[1].trim()].length;
  console.log(`short ${lang}: ${n} chars`);
  if (n > 132) fail.push(`short ${lang} is ${n} > 132`);
}
for (const lang of ['EN', 'ID']) {
  const n = [...section(`### ${lang}`).trim()].length;
  console.log(`detailed ${lang}: ${n} chars`);
  if (n > 16000) fail.push(`detailed ${lang} is ${n} > 16000`);
}
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
