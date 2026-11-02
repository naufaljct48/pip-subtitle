# Plan

| # | Task | Tier | After | Status |
|---|------|------|-------|--------|
| 1 | Scaffold | light | — | done |
| 2 | content.js (both modes, sources, UI) | careful | 1 | done |
| 3 | v1.1: clean/full modes, popup (replaces background.js), auto PiP, live settings, YouTube style fix, canvas follows video size | careful | 2 | done |
| 4 | v1.2: volume (popup slider, Lengkap Vol + ↑/↓, getVolume/setVolume), turn on site captions once per session | careful | 3 | done |
| 5 | v1.3: timeline (Bersih media-session seek + canvas progress, mute mirror; Lengkap mini player), 15 s steps | careful | 4 | done |
| 6 | v1.4: English + Indonesian UI (i18n.js, lang setting, _locales for the manifest) | careful | 5 | done |
| 7 | Open source + Chrome Web Store prep: portable tests, package.json/zip, LICENSE, CI, PRIVACY, README, store/ | careful | 6 | done |
| 8 | v1.4.2: page placeholder over the original video during canvas/native sessions | careful | 7 | review |

## 1. Scaffold
`manifest.json` (MV3, name "PiP Subtitle", version 1.0.0, description in Indonesian,
permissions `scripting`, `storage`, host_permissions `<all_urls>`, background service worker
`background.js`, action with title "PiP + Subtitle (Alt+P)", content_scripts `content.js` on
`<all_urls>`, `all_frames: true`, `run_at: document_idle`, icons). `background.js` complete per
SPEC "Trigger → Toolbar click". `content.js` stub (IIFE, guard against double injection).
`icons/icon16|48|128.png` generated (rounded dark square, white "CC" or PiP glyph).
`README.md` (Indonesian): how to load unpacked, Alt+P, toolbar, .srt.
Verify: `node --check background.js content.js`, manifest parses as JSON.

## 2. content.js
Everything in SPEC sections Picking the video, Mode A, Mode B, Subtitle sources, UI, Toast,
Copy, plus the `window.__pipSub` test hooks. Verify per SPEC "Definition of done" (the
injection checks are run by the orchestrator in a browser pane).
