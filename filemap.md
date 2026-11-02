manifest.json — MV3 manifest: permissions, content script, action
background.js — service worker: toolbar click → toggle in top frame, else best-scoring frame (executeScript keeps user activation)
content.js — all PiP logic: video pick, Document PiP, canvas fallback, subtitle sources, UI, toast
icons/ — toolbar/store icons 16/48/128
README.md — install + usage (Indonesian)
docs/SPEC.md — behaviour spec
docs/PLAN.md — task list and status
test/ — parser smoke + puppeteer e2e (Mode A on real pages, Mode B iframe fixtures in test/modeb)
docs/TESTING.md — how to run the tests, gotchas, last results
