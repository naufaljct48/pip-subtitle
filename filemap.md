manifest.json — MV3 manifest: permissions, content script, action popup (no background worker)
popup.html — action popup markup + styles: "Buka PiP", mode, auto PiP, subtitle, text size
popup.js — popup logic: frame picking + toggle via executeScript (keeps user activation), settings in storage
content.js — all PiP logic: video pick, mode choice, Document PiP, canvas PiP, auto PiP, subtitle sources, UI, toast, live settings
icons/ — toolbar/store icons 16/48/128
README.md — install + usage (Indonesian)
docs/SPEC.md — behaviour spec
docs/PLAN.md — task list and status
test/ — parser smoke + puppeteer e2e (Mode A on real pages; Mode B, resize and tab-switch pause fixtures in test/modeb)
docs/TESTING.md — how to run the tests, gotchas, last results
