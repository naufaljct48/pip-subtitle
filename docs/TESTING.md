# Testing

Real Chrome (stable) + this unpacked extension via puppeteer-core 25 (`browser.installExtension`,
CDP `Extensions.loadUnpacked`); `--load-extension` no longer works in branded Chrome.
Shared setup is `test/lib/env.cjs`: `CHROME_PATH` (default: the usual Chrome install path per
platform; on Linux the first of google-chrome / chromium on PATH), `PUPPETEER_CORE` (another
puppeteer-core module path), `EXT_DIR` (load another copy of the extension, e.g. a mutated one or
the unpacked store zip). The e2e scripts start the fixture server themselves (test/modeb on
127.0.0.1 and localhost, port 8766 — two origins for the cross-origin iframe); `npm run fixtures`
runs it on its own.

```bash
npm install --ignore-scripts                                # puppeteer-core
npm run check                                               # syntax + the two checks below + store text + zip contents
npm run zip                                                 # dist/pip-subtitle-<version>.zip (scripts/zip.mjs)
node test/parser-smoke.mjs content.js                      # SRT/VTT parser
node test/i18n-keys.mjs                                     # en/id keys match, used keys exist, no Indonesian copy in code
node test/popup-shots.cjs                                   # popup screenshots: test/v14-popup-{en,id}-{light,dark}.png
# Mode A on a real page (Alt+P; TOOLBAR=1 uses the toolbar action instead)
PLAY_XY=636,250 node test/e2e.cjs <url> 45                  # click play, wait out the ad
node test/e2e.cjs https://plyr.io/ 0
# Mode B: player in a cross-origin iframe
npm run e2e:modeb                                           # = node test/e2e-modeb.cjs                                     # + source resize, setVolume, CC-on (track.html), Lengkap Vol
npm run e2e:seek                                            # v1.3 timeline: Bersih media-session seeks, progress bar,
                                                            # mute mirror; Lengkap mini player (seek bar, J/K/L, time input)
npm run e2e:hide                                            # site pauses on tab switch: PiP must keep playing
#   needs the Chrome test window visible and uncovered (occluded windows count as hidden)
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
| Shaka, top-level, captions in `.shaka-text-container` (a Shaka-based player site) | Alt+P | PiP opens, video plays, 4 distinct Indonesian lines in 15 s, close returns video playing |
| same | toolbar | same, no retry toast needed |
| Plyr site (Video.js 10, native `showing` track) | Alt+P | PiP opens, video plays, close restores |
| YouTube watch page | Alt+P | PiP + playback + restore OK (also during an ad); captions not verifiable |
| Cross-origin iframe, `.vjs-text-track-display` | Alt+P and toolbar | Mode B canvas PiP, subtitle pixels follow the text, pause syncs, close cleans up |

### v1.1 (2 Nov 2026, Chrome 156) — `test/e2e-v11.cjs`, `test/e2e-hide.cjs`

| Case | Path | Result |
|------|------|--------|
| Shaka-based player site, mode Bersih | popup "Buka PiP" | canvas PiP opens (activation survives the popup click), subtitles drawn |
| same, tab switched away (normal throttling, sound on) | — | site's own pause-on-hide suppressed; video keeps playing 48→58 s, subtitles keep changing in PiP |
| YouTube, mode Lengkap, Shift+N to next video | Alt+P | YouTube rewrites the video's inline size; video stays 0,0 full window; PiP title follows the new video |
| Fixture `pauseOnHide=1` / `=window` | Alt+P | keeps playing hidden; `window` (page listener before ours) shows one ≤1 s auto-resumed blip by design |
| Auto PiP on tab switch | — | not triggerable in a fresh automation profile (Chrome gates it on media engagement); verify in a real profile |

### v1.2 (2 Nov 2026, Chrome 156)

| Case | Path | Result |
|------|------|--------|
| YouTube, CC switched off first, popup volume 30 %, popup "Buka PiP" (Bersih) — `test/e2e-v12.cjs` | popup | video volume 0.3, YouTube CC turned on by the extension, canvas PiP open |
| Native tracks all disabled — `test/modeb/track.html` | Alt+P | `id` track set to hidden, caption text read |
| Auto PiP after building media engagement (plyr.io, 9 sessions with playback, score 0.45, Is High = Yes) | tab switch | canvas PiP opened by Chrome's `enterpictureinpicture`, closed by Chrome on return. Same profile at score 0.05 (Is High = No): nothing — Chrome gates auto PiP on high engagement |
| e2e-hide | — | needs the Chrome test window visible and uncovered; passed at 06:52 on v1.1, hide logic unchanged in v1.2 |

### Chrome's own controls in the native PiP window (2 Nov 2026, Chrome 156)

Captured the PiP window right after it opens (Chrome shows its overlay then; synthetic hover via
SetCursorPos does not bring it back later):
- PiP of the page's real `<video>` (what Google's PiP extension does): ±10 s, play/pause, timeline.
- PiP of our canvas proxy (Bersih): only the site name — no play/pause, no seek, no timeline, even
  with mediaSession seek/seekto/previoustrack/nexttrack/play/pause handlers registered before
  opening, a silent audio track added, or the proxy made visible. Chrome treats a MediaStream
  source as live. A `showing` text track is not drawn in native PiP either.
=> A real mini player (timeline, jump, ±15 s, volume) is only possible in Lengkap (Document PiP).

### v1.4.3 (3 Nov 2026) — `npm run e2e:reload`

Extension reloaded/updated while a video tab is open (uninstall + install the same unpacked dir:
the tab keeps an orphaned content script). Expect: popup "Open PiP" injects a fresh copy and opens
PiP without a page refresh; Alt+P closes and reopens exactly once. Fails on v1.4.2 (popup says no
video; Alt+P handled by the orphan), passes on v1.4.3.
