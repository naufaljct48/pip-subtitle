# PiP Subtitle — Spec

Chrome extension (Manifest V3, Chrome 116+) that opens Picture-in-Picture **with subtitles**.
Plain extensions call `video.requestPictureInPicture()`, which shows only the video: players
like Shaka, JW Player, Video.js, Plyr render captions as HTML divs over the video, not as
native text tracks, so the captions are lost.

## Goals
- One keystroke (`Alt+P`) or toolbar click → PiP window showing the video plus the captions
  the page is currently showing.
- Works on the reference site: Shaka player in the top-level page, captions in
  `.shaka-text-container` (verified: the container keeps updating after the `<video>` is moved
  to another parent; canvas `drawImage` of its MSE blob video is not tainted).
- Optional: load a local `.srt` / `.vtt` file and shift it ±0.5 s.

## Non-goals
- No DRM bypass, no downloading, no network requests, no remote code. No popup/options page.
- Not Firefox/Safari.

## Architecture
```
manifest.json      MV3; permissions: scripting, storage; host_permissions <all_urls>
background.js      service worker: action click → pick frame with best video → message it
content.js         all frames, document_idle: everything else (single file, IIFE, no deps)
icons/             16/48/128 PNG
```

### Trigger
- **Alt+P** (`keydown` listener on `window`, capture phase, ignore when focus is in an
  input/textarea/contenteditable): toggles PiP in the frame that received the key. Real key
  press = user activation.
- **Toolbar click**: user activation survives `chrome.scripting.executeScript` but not
  `tabs.sendMessage`, so the first call goes to the top frame and toggles there directly when it
  has a scoring video and no visible iframe larger than that video. Otherwise background scores
  every frame (`window.__pipSubScore`), then calls `window.__pipSub.toggle()` in the winner with
  a second `executeScript` (verified to still carry activation in Chrome 156).
  No video anywhere → set badge text `"!"` for 3 s.
- If PiP fails with `NotAllowedError` (no user activation), show an in-page toast with a
  **"Buka PiP"** button; clicking it retries (real click = activation).

### Picking the video
`score(video)` = visible area (getBoundingClientRect, clipped to viewport) × (playing ? 2 : 1);
0 if `readyState === 0` or area < 100×60. Highest wins. `window.__pipSubScore` returns the
best score in this frame.

### Mode A — Document PiP (top-level frame and `documentPictureInPicture` exists)
1. Insert a placeholder comment after the video; remember original `style` attribute,
   `controls`, play state.
2. `documentPictureInPicture.requestWindow({width, height})` sized from video aspect
   (width 480, height by aspect; clamp height 200–480).
3. Build the PiP document with inline `<style>` (no page stylesheets): black body, video
   `position:absolute; inset:0; width:100%; height:100%; object-fit:contain`.
4. Move the video in. If it was playing, call `play()` again (moving can pause it).
5. Subtitle overlay + toolbar (see UI). Close → `pagehide` on the PiP window: move video back
   to the placeholder, restore style/controls, keep play state, disconnect observers.

### Mode B — Canvas PiP (in iframes, or no Document PiP)
1. Canvas sized to video intrinsic size, capped at 1280 px wide.
2. Draw loop with **`setTimeout` (~33 ms), not rAF** (rAF stops in background tabs; timers in
   a tab playing audio are not throttled): draw the frame, then the current subtitle text,
   word-wrapped, centered near the bottom, white with dark box, same font scale setting.
3. `canvas.captureStream(30)` → hidden muted `<video>` (`srcObject`), `play()`, then
   `requestPictureInPicture()` on it.
4. Sync: original `play`/`pause` → proxy video; proxy video `play`/`pause` (from the PiP
   window buttons) → original; `navigator.mediaSession` `play`/`pause`/`seekbackward`/
   `seekforward` (10 s) handlers act on the original. `leavepictureinpicture` → stop loop,
   remove proxy and canvas.
5. If `captureStream`/`drawImage` throws `SecurityError` (cross-origin video) →
   `video.requestPictureInPicture()` on the original + toast
   "Subtitle tidak bisa ditampilkan di player ini (video lintas-domain)".

### Subtitle sources (first non-empty wins, re-evaluated every update)
1. **External file** loaded by the user (Mode A toolbar only): parsed cues, `currentTime +
   offset`.
2. **Page caption container**: search from the video's original parent up 6 ancestors with
   `querySelector` over this list, first match that is not inside our own UI:
   `.shaka-text-container, .jw-text-track-container, .jw-captions, .vjs-text-track-display,
   .plyr__captions, .art-subtitle, .dplayer-subtitle, .fp-captions, .mejs__captions-layer,
   .mejs-captions-layer, .vds-captions, media-captions, [class*="subtitle" i],
   [class*="caption" i]` — skip elements that are buttons/menus (contain `button`, or match
   `[class*="button" i], [class*="menu" i], [class*="setting" i]`).
   Text = `innerText`, trimmed, lines preserved. Observe with `MutationObserver`
   (childList, subtree, characterData) plus a 250 ms poll (some players toggle visibility only).
   Re-search the container every 2 s while none is found (players create it late).
3. **Native text tracks with `mode === 'hidden'`**: join `activeCues` text on `cuechange`.
   Tracks with `mode === 'showing'` already render inside the video in Mode A — do not overlay
   them; in Mode B read them too (canvas cannot show native rendering).

Never use `innerHTML` with page text; set `textContent` (lines via `\n` + `white-space: pre-line`).

### UI (Mode A PiP window)
- Subtitle overlay: centered, `bottom: 7%`, max-width 92%, `white-space: pre-line`,
  `text-align:center`, white text, `font: 600 calc(5.5vh * var(--scale)) system-ui, sans-serif`,
  `text-shadow: 0 0 4px #000, 0 1px 2px #000`, background `rgba(0,0,0,.55)`,
  `padding: .1em .45em`, `border-radius: 4px`, `box-decoration-break: clone`
  (text in an inline `<span>` so the box hugs each line). Hidden when empty.
- Toolbar: top-right, appears on mousemove, hides after 2 s idle; small dark pill buttons
  (`rgba(0,0,0,.6)`, white, 12 px, radius 6 px):
  `A−` `A+` (scale 0.6–2.0 step 0.1) · `CC` (toggle overlay; dimmed when off) ·
  `.srt` (hidden file input, accepts `.srt,.vtt`) · when a file is loaded: `−0.5s`, offset
  label, `+0.5s`, `✕` (unload file).
- Click on video = play/pause; `Space` = play/pause; `←`/`→` = −/+5 s; `Alt+P` or `Esc` =
  close PiP.
- Settings `{fontScale, ccOn}` persisted in `chrome.storage.local` (guard when `chrome.storage`
  is missing so the script also runs when injected for testing).

### Toast (in page)
Fixed bottom-center, inside a Shadow DOM host so page CSS cannot touch it; auto-hide 6 s;
optional single action button. Indonesian copy.

## Copy (Indonesian)
- "Tidak ada video yang bisa di-PiP di halaman ini."
- "Klik untuk membuka PiP" + button "Buka PiP"
- "Subtitle tidak bisa ditampilkan di player ini (video lintas-domain)"
- Toolbar tooltips: "Perkecil teks", "Perbesar teks", "Subtitle on/off",
  "Muat file subtitle (.srt/.vtt)", "Mundurkan subtitle 0,5 detik",
  "Majukan subtitle 0,5 detik", "Lepas file subtitle".

## Definition of done
- `node --check` passes on both JS files; manifest is valid JSON with the fields above.
- Injecting `content.js` into the reference page (no `chrome.*` available) and calling the
  exposed test hook `window.__pipSub.debugSource()` returns the live caption text, and
  `window.__pipSub.debugCanvas()` returns the Mode B canvas (draw loop running, no PiP request)
  whose frames contain the video and the subtitle; `window.__pipSub.stop()` tears it down.
- Loaded unpacked in Chrome: `Alt+P` on the reference page opens a PiP window with the video
  and live Indonesian subtitles; closing it puts the video back in the page player.
