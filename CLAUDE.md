# PiP Subtitle (Chrome extension)

Stack: Chrome MV3, plain JavaScript, no build step, no dependencies.

Commands:
- Syntax check: `node --check background.js && node --check content.js`
- Tests: see `docs/TESTING.md` (parser smoke + real-Chrome e2e via puppeteer-core)
- Run: chrome://extensions → Developer mode → Load unpacked → this folder; reload after edits.

Conventions:
- `content.js` runs in every frame of every page: one IIFE, guard double injection, never leak
  globals except the `window.__pipSub` test hook and `window.__pipSubScore`.
- Never put page text into `innerHTML`; use `textContent`.
- Guard every `chrome.*` call (`typeof chrome !== 'undefined' && chrome.storage`) so the script
  also works when injected into a page for testing.
- Draw loops use `setTimeout`, not `requestAnimationFrame` (rAF stops in background tabs).
- User-facing copy is Indonesian.

Docs: `docs/SPEC.md` (behaviour), `docs/PLAN.md` (tasks), `filemap.md` (where things live).
