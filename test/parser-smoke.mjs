import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('// ==== Subtitle files');
const b = src.indexOf('// ==== Subtitle sources');
const body = src.slice(a, b);
const api = new Function(body + '\nreturn { parseTimestamp, cleanCueText, parseSubtitles, cueTextAt, decodeSubtitleBytes };')();

assert.equal(api.parseTimestamp('01:02:03,456'), 3723.456);
assert.equal(api.parseTimestamp('02:03.5'), 123.5);
assert.equal(api.parseTimestamp('00:00:01.000'), 1);
assert.ok(Number.isNaN(api.parseTimestamp('garbage')));

const srt = '\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Halo</i> {' + String.fromCharCode(92) + 'an8}dunia\r\nbaris dua\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nKedua &amp; terakhir\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nTanpa baris kosong\r\n';
const c1 = api.parseSubtitles(srt);
assert.equal(c1.length, 3, JSON.stringify(c1));
assert.deepEqual(c1[0], { start: 1, end: 2.5, text: 'Halo dunia\nbaris dua' });
assert.equal(c1[1].text, 'Kedua & terakhir');
assert.equal(c1[2].text, 'Tanpa baris kosong');

const vtt = `WEBVTT - judul

STYLE
::cue { color: yellow }

NOTE ini catatan
lebih dari satu baris

intro
00:01.000 --> 00:02.000 align:start position:10%
<v Budi>Selamat pagi</v>

00:00:01.500 --> 00:00:03.000
<c.yellow>Tumpang</c> tindih
`;
const c2 = api.parseSubtitles(vtt);
assert.equal(c2.length, 2, JSON.stringify(c2));
assert.equal(c2[0].text, 'Selamat pagi');
assert.equal(api.cueTextAt(c2, 1.7), 'Selamat pagi\nTumpang tindih');
assert.equal(api.cueTextAt(c2, 2.5), 'Tumpang tindih');
assert.equal(api.cueTextAt(c2, 0.5), '');
assert.equal(api.cueTextAt(c2, 3), '');

// encodings
const utf8 = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\nCafé ñ\n');
assert.match(api.decodeSubtitleBytes(utf8), /Café ñ/);
const latin = Uint8Array.from([...'Caf'].map(c => c.charCodeAt(0)).concat([0xe9, 0x20, 0xf1, 0x20, 0xe8]));
assert.equal(api.decodeSubtitleBytes(latin), 'Café ñ è');
const u16 = Uint8Array.from([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
assert.equal(api.decodeSubtitleBytes(u16), 'Hi');
console.log('parser smoke: all assertions passed', c1.length + c2.length, 'cues');
