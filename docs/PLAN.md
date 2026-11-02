# Plan

| # | Task | Tier | After | Status |
|---|------|------|-------|--------|
| 1 | Scaffold | light | — | todo |
| 2 | content.js (both modes, sources, UI) | careful | 1 | todo |

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
