manifest.json — MV3 manifest: permissions, content scripts (i18n.js + content.js), action popup, __MSG_ names (no background worker)
_locales/ — en/id messages for the manifest name, description and action title
i18n.js — every UI string in en + id, and pipsubLang() (auto → id for Indonesian browsers, else en)
popup.html — action popup markup + styles: Open PiP, mode, auto PiP, subtitles, text size, volume, language (text filled from i18n.js)
popup.js — popup logic: frame picking + toggle via executeScript (keeps user activation), settings in storage
content.js — all PiP logic: video pick, mode choice, Document PiP, canvas PiP, auto PiP, subtitle sources, UI, toast, live settings
icons/ — toolbar/store icons 16/48/128
README.md — install + usage (short English section, then Indonesian)
docs/SPEC.md — behaviour spec
docs/PLAN.md — task list and status
test/ — parser smoke + puppeteer e2e (Mode A on real pages; Mode B, resize, tab-switch pause and native-track CC and seekable-clip fixtures in test/modeb)
docs/TESTING.md — how to run the tests, gotchas, last results
