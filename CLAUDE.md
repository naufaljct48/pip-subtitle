# PiP Subtitle (Chrome extension)

Stack: Chrome MV3, plain JavaScript, no build step, no dependencies.

Commands:
- All checks: `npm run check` (syntax, i18n keys, subtitle parser, store text limits, zip contents)
- Package: `npm run zip` → `dist/pip-subtitle-<version>.zip`; keep `package.json` version = manifest version
- Tests: see `docs/TESTING.md`; e2e via `npm run e2e:modeb|e2e:seek|e2e:hide` (real Chrome,
  `npm install --ignore-scripts` first; `CHROME_PATH` / `PUPPETEER_CORE` override). No
  machine-specific paths in the repo.
- Run: chrome://extensions → Developer mode → Load unpacked → this folder; reload after edits.

Conventions:
- `content.js` runs in every frame of every page: one IIFE, guard double injection, never leak
  globals except the `window.__pipSub` test hook and `window.__pipSubScore`. `i18n.js` (loaded
  before it, and in the popup) defines the only other two: `PIPSUB_STRINGS` and `pipsubLang`.
- Never put page text into `innerHTML`; use `textContent`.
- Guard every `chrome.*` call (`typeof chrome !== 'undefined' && chrome.storage`) so the script
  also works when injected into a page for testing.
- Draw loops use `setTimeout`, not `requestAnimationFrame` (rAF stops in background tabs).
- User-facing copy is bilingual: every string lives in `i18n.js` (`en` + `id`, same keys); none
  in content.js / popup.js / popup.html. `node test/i18n-keys.mjs` enforces it.

Docs: `docs/SPEC.md` (behaviour), `docs/PLAN.md` (tasks), `filemap.md` (where things live).
