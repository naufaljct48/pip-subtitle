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
node test/e2e-modeb.cjs                                     # also checks the 640x360 -> 480x480 source switch
node test/e2e-hide.cjs                                      # site pauses on tab switch: PiP must keep playing
# EXT_DIR=<copy of the extension> node test/e2e-hide.cjs    # run against a mutated copy to prove the test fails
```

Since v1.1 the default mode is `clean` (Mode B also in the top frame), so `e2e.cjs`'s Mode A
checks need `pipsub.mode = 'full'` in storage first. The toolbar action now opens the popup
(no background worker), so `TOOLBAR=1` no longer toggles by itself.

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

### v1.1 (2 Nov 2026, Chrome 156) — `test/e2e-v11.cjs`, `test/e2e-hide.cjs`

| Case | Path | Result |
|------|------|--------|
| Reference site, mode Bersih | popup "Buka PiP" | canvas PiP opens (activation survives the popup click), subtitles drawn |
| same, tab switched away (normal throttling, sound on) | — | site's own pause-on-hide suppressed; video keeps playing 48→58 s, subtitles keep changing in PiP |
| YouTube, mode Lengkap, Shift+N to next video | Alt+P | YouTube rewrites the video's inline size; video stays 0,0 full window; PiP title follows the new video |
| Fixture `pauseOnHide=1` / `=window` | Alt+P | keeps playing hidden; `window` (page listener before ours) shows one ≤1 s auto-resumed blip by design |
| Auto PiP on tab switch | — | not triggerable in a fresh automation profile (Chrome gates it on media engagement); verify in a real profile |
