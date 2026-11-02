manifest.json — MV3 manifest: permissions, content scripts (i18n.js + content.js), action popup, __MSG_ names (no background worker)
_locales/ — en/id messages for the manifest name, description and action title
i18n.js — every UI string in en + id, and pipsubLang() (auto → id for Indonesian browsers, else en)
popup.html — action popup markup + styles: Open PiP, mode, auto PiP, subtitles, text size, volume, language (text filled from i18n.js)
popup.js — popup logic: frame picking + toggle via executeScript (keeps user activation), settings in storage
content.js — all PiP logic: video pick, mode choice, Document PiP, canvas PiP, auto PiP, subtitle sources, UI, toast, live settings
icons/ — toolbar/store icons 16/48/128 (+ source-gemini.jpg, the source image; not packaged)
README.md — English overview, install, usage, limitations, development; short Indonesian section
PRIVACY.md — privacy policy (EN + ID): nothing collected or sent
LICENSE — MIT
package.json / package-lock.json / .npmrc — npm scripts (check, zip, e2e:*), puppeteer-core dev dependency, ignore-scripts=true
scripts/zip.mjs — store zip builder (pure Node): dist/pip-subtitle-<version>.zip with only the packaged files; --check validates
store/listing.md — Chrome Web Store listing text (EN/ID), category, single purpose, permission justifications, data disclosures, screenshot plan
store/check-listing.mjs — store text length limits
.github/workflows/check.yml — CI: npm install --ignore-scripts, npm run check, npm run zip
docs/SPEC.md — behaviour spec
docs/PLAN.md — task list and status
docs/TESTING.md — how to run the tests, gotchas, last results
test/ — parser smoke, i18n check, puppeteer e2e (Mode A on real pages; Mode B, resize, tab-switch pause, native-track CC and seekable-clip fixtures in test/modeb)
test/lib/env.cjs — shared e2e setup: puppeteer-core, Chrome path (CHROME_PATH), extension/profile dirs, fixture server
