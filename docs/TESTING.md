# Testing

Real Chrome (stable) + this unpacked extension via puppeteer-core 25 (`browser.installExtension`,
CDP `Extensions.loadUnpacked`); `--load-extension` no longer works in branded Chrome.
Set `PUPPETEER_CORE` if puppeteer-core lives elsewhere.

```bash
node test/parser-smoke.mjs content.js                      # SRT/VTT parser
# Mode A on a real page (Alt+P; TOOLBAR=1 uses the toolbar action instead)
PLAY_XY=636,250 node test/e2e.cjs <episode-url> 45          # click play, wait out the ad
node test/e2e.cjs https://plyr.io/ 0
# Mode B: player in a cross-origin iframe
python -I test/serve_ext.py test/modeb 8766 &               # serves 127.0.0.1 + localhost
node test/e2e-modeb.cjs
```

Gotchas: the Document PiP window is an `about:blank` page target — do not auto-close new pages
in tests; puppeteer's default viewport also forces the PiP window to 1280-ish wide. Clicking the
video before Alt+P pauses Shaka. YouTube in automation: playback works, but YouTube itself
leaves its caption box empty, so captions cannot be verified there.

## Results (2 Nov 2026, Chrome 156)

| Case | Path | Result |
|------|------|--------|
| Shaka, top-level, captions in `.shaka-text-container` (reference site) | Alt+P | PiP opens, video plays, 4 distinct Indonesian lines in 15 s, close returns video playing |
| same | toolbar | same, no retry toast needed |
| Plyr site (Video.js 10, native `showing` track) | Alt+P | PiP opens, video plays, close restores |
| YouTube watch page | Alt+P | PiP + playback + restore OK (also during an ad); captions not verifiable |
| Cross-origin iframe, `.vjs-text-track-display` | Alt+P and toolbar | Mode B canvas PiP, subtitle pixels follow the text, pause syncs, close cleans up |
