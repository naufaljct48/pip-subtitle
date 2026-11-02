# PiP Subtitle — Spec

Chrome extension (Manifest V3, Chrome 116+) that opens Picture-in-Picture **with subtitles**.
Plain extensions call `video.requestPictureInPicture()`, which shows only the video: players
like Shaka, JW Player, Video.js, Plyr render captions as HTML divs over the video, not as
native text tracks, so the captions are lost.

## Goals
- One keystroke (`Alt+P`) or the popup's **Buka PiP** button → PiP window showing the video
  plus the captions the page is currently showing.
- Two display modes, chosen in the popup: **Bersih** (`clean`, default) = native video PiP
  (no title bar) of a canvas with the subtitles burned in; **Lengkap** (`full`) = Document PiP
  with an HTML overlay and toolbar (Chrome always shows its origin bar on top of that window).
- Optional automatic PiP when the user leaves a tab with a playing video.
- Works on a Shaka-based player site: Shaka player in the top-level page, captions in
  `.shaka-text-container` (verified: the container keeps updating after the `<video>` is moved
  to another parent; canvas `drawImage` of its MSE blob video is not tainted).
- Optional (Lengkap): load a local `.srt` / `.vtt` file and shift it ±0.5 s.

## Non-goals
- No DRM bypass, no downloading, no network requests, no remote code. No options page beyond
  the action popup. No background service worker.
- Not Firefox/Safari.

## Architecture
```
manifest.json      MV3; permissions: scripting, storage; host_permissions <all_urls>;
                   action.default_popup popup.html; default_locale en, name/description/title
                   via __MSG_*__ (_locales/en, _locales/id)
i18n.js            UI strings (en, id) + pipsubLang(); loaded before content.js and popup.js
popup.html/.js     action popup: "Open PiP" (frame picking + toggle) and settings
content.js         all frames, document_idle: everything else (single file, IIFE, no deps)
icons/             16/48/128 PNG
_locales/          en/id messages for the manifest
```

Repository extras (not packaged): `scripts/zip.mjs` builds the store zip with exactly the files
above (`npm run zip`, validated by `npm run check`); `store/` holds the Chrome Web Store listing
text and permission justifications; `test/` the checks and e2e tests (docs/TESTING.md);
`PRIVACY.md`, `LICENSE` (MIT), `.github/workflows/check.yml` (CI: `npm run check` + zip).

### Settings
`chrome.storage.local` key `pipsub`: `{ fontScale: 0.6–2.0 (1), ccOn (true),
mode: 'clean' | 'full' ('clean'), autoPip (true), lang: 'auto' | 'en' | 'id' ('auto') }`.
Writers merge into the stored object.
content.js loads it at start and listens to `chrome.storage.onChanged`: the canvas picks up
`fontScale`/`ccOn` on its next frame, an open Document PiP window re-syncs its toolbar and
overlay (including its tooltips/labels when `lang` changes), and auto PiP re-registers. Without `chrome.storage` (script injected for testing)
the in-memory defaults apply.

### Trigger
- **Alt+P** (`keydown` listener on `window`, capture phase, ignore when focus is in an
  input/textarea/contenteditable): toggles PiP in the frame that received the key. Real key
  press = user activation. Only acts when this frame has a session or a scoring video.
- **Popup "Buka PiP"**: user activation survives `chrome.scripting.executeScript` but not
  `tabs.sendMessage`, so inside the click handler popup.js queries the active tab and the first
  call goes to the top frame, toggling there directly when it has a scoring video and no visible
  iframe whose area × 2 exceeds that video's score. Otherwise it scores every frame (`window.__pipSubScore`), then calls
  `window.__pipSub.toggle()` in the winner with another `executeScript` (verified to still
  carry activation in Chrome 156). Success → `window.close()`. No video anywhere, or injection
  refused (chrome:// pages, Web Store) → inline message in the popup.
- **Auto PiP** (top frame only): see below.
- If PiP fails with `NotAllowedError` (no user activation), show an in-page toast with a
  **"Buka PiP"** button; clicking it retries (real click = activation).

### Picking the video
`score(video)` = visible area (getBoundingClientRect, clipped to viewport) × (playing ? 2 : 1);
0 if `readyState === 0` or area < 100×60. Highest wins; light-DOM videos first, then (only if
none scores) videos inside open shadow roots (walk capped at 5000 elements).
`window.__pipSubScore` returns the best score in this frame, or `Number.MAX_SAFE_INTEGER`
while a session is open (so the popup's button reaches that frame to close it).

### Choosing the mode
- Top frame, mode `full` → Mode A (Document PiP).
- Top frame, mode `clean` → Mode B, unless the canvas cannot read the video: cross-origin
  looking `src` without `crossOrigin`, `video.mediaKeys` set (EME/DRM: frames would be black),
  or `captureStream` throws `SecurityError` → Mode A (it moves the element, which works there).
- Iframes, or Document PiP unavailable/broken → Mode B; unreadable video → native PiP of the
  original without subtitles + toast.
- An open session is closed by the next toggle; only one session at a time.

### Mode A — Document PiP
1. Insert a placeholder comment after the video; remember original `style` attribute,
   `controls`, play state.
2. `documentPictureInPicture.requestWindow({width, height})` sized from video aspect
   (width 480, height by aspect; clamp height 200–480). PiP `document.title` = page title
   (taskbar / Alt+Tab; Chrome's own bar always shows the origin and cannot be removed).
3. Build the PiP document with inline `<style>` (no page stylesheets): black body, video box
   enforced with `!important` (`position:absolute; inset:0; left/top:0; right/bottom:auto;
   width/height:100%; max-width/max-height:none; margin:0; transform:none;
   object-fit:contain`), because players such as YouTube rewrite the video's inline px box on
   every new video. The same values are also set as the inline `style` attribute.
4. Move the video in. If it was playing, call `play()` again (moving can pause it).
5. Subtitle overlay + toolbar (see UI). Close → `pagehide` on the PiP window: move video back
   to the placeholder, restore style/controls, keep play state, disconnect observers. If the
   placeholder is gone (player re-rendered), pause and drop the video. If a non-activation
   error makes `requestWindow` unusable, fall back to Mode B for the rest of the page's life.
6. Document PiP cannot keep the aspect ratio on user resize (`resizeTo` needs activation);
   `object-fit:contain` keeps the picture undistorted.

### Mode B — Canvas PiP
1. Canvas sized to video intrinsic size, capped at 1280 px wide. When the intrinsic size
   changes (next video, quality switch: video `resize` event, also checked every frame) the
   canvas is resized to match, so the native PiP window, which locks to the stream's aspect
   ratio, follows the new video instead of letterboxing.
2. Draw loop with **`setTimeout` (~33 ms), not rAF** (rAF stops in background tabs; timers in
   a tab playing audio are not throttled): draw the frame, then the current subtitle text,
   word-wrapped, centered near the bottom, white with dark box, same font scale setting.
3. `canvas.captureStream(30)` → hidden muted `<video>` (`srcObject`, 1 px, appended to the
   page), `play()`, then `requestPictureInPicture()` on it.
4. Sync: original `play` → proxy; original `pause` → proxy paused 150 ms later (a paused
   MediaStream video freezes on its last frame, so the canvas first draws the paused frame with
   the timeline); a seek while paused briefly replays the proxy so the frozen frame updates.
   Proxy `play`/`pause` from the PiP window buttons → original (events we caused ourselves are
   ignored). `leavepictureinpicture` → stop loop, remove proxy and canvas.
5. Timeline: the proxy is a MediaStream, which Chrome treats as live (no timeline, no seek).
   While a canvas or native session is open, `navigator.mediaSession.setPositionState`
   mirrors the original (`duration`, `position` clamped to [0, duration], `playbackRate`) on
   `timeupdate`/`ratechange`/`durationchange`/`seeked`/`loadedmetadata`, only for a finite
   duration > 0; cleared with `setPositionState()` on close if it was set. Handlers:
   `seekbackward`/`seekforward` = 15 s (`seekOffset` ignored), `seekto` (`seekTime`, honours
   `fastSeek`); only these are registered and only these are nulled on close (the page keeps its
   own `play`/`pause`/`previoustrack`/`nexttrack`; overriding them broke YouTube media keys).
   `__pipSub.debugSeek(action, details)` calls the same handlers (tests).
6. Canvas timeline overlay, only while the original is paused or for 2.5 s after a seek or a
   play/pause: a progress line in the bottom 4 % of the frame (white 85 % on a 25 % white track,
   ~H/120 thick, 3 % side margins) and a time label "12:34 / 44:58" (`h:mm:ss` when the video
   is ≥ 1 h) bottom-left above it, 600 weight, H × 0.04, subtitle text shadow. Subtitles move up
   while it shows. Not drawn for live (non-finite duration) video.
7. Mute: Chrome's PiP speaker button acts on the proxy, which has no audio. Proxy
   `volumechange` → original `muted`/`volume`; original `volumechange` → proxy (compare-and-set,
   so no loops). The proxy starts muted for `play()` and takes the original's state once in PiP.
8. Unreadable video (`SecurityError` from `captureStream`, or cross-origin looking `src`) →
   Mode A in the top frame (mode `clean`), otherwise `video.requestPictureInPicture()` on the
   original + toast "Subtitle tidak bisa ditampilkan di player ini (video lintas-domain)".

### Auto PiP
Top frame only. Every 2 s (and on settings change): when `autoPip` is on and the page has a
scoring video (or a session is open), register
`navigator.mediaSession.setActionHandler('enterpictureinpicture', handler)`; otherwise set it
to `null`. Unsupported action → ignored (try/catch). Handler: if no session is open or opening
and the best video is playing, open PiP with the current mode, synchronously inside the
handler (do not toggle-close an existing session). Chrome only fires it for sites with enough
media engagement (`chrome://media-engagement`); it did not fire in a fresh automation profile.
When the user returns to the tab Chrome closes that PiP itself; the normal
`leavepictureinpicture` / `pagehide` cleanup handles it. If the site has already paused the
video in reaction to the tab switch (see next section) when the handler runs, the video still
counts as playing and is resumed.

### Keep playing while the tab is hidden
Some sites (a Shaka-based player site we tested included) pause their own video on `visibilitychange`, which
freezes the PiP the user switched tabs to watch. Applies to every session kind and to the
opening phase (Alt+P, popup, auto PiP):
1. A `visibilitychange` listener on `window`, capture phase, registered at load in every frame,
   calls `stopImmediatePropagation()` while this frame has a session open or opening. Window
   capture runs before the page's listeners on `document`; page listeners added earlier on
   window capture still run, hence:
2. Auto-resume: our listener records `hiddenAt` on every hide. A `pause` of the session video
   within 1.5 s of hiding, while the page is hidden and not caused by our own PiP controls
   (proxy pause from the PiP window, Document PiP click/Space; these set `userPauseAt`), is
   undone with `play()` once per hide.
3. Inert when no session is open: closing PiP restores the site's normal behaviour.

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

### Turning on the site's captions
The overlay/canvas only mirrors captions the player shows. Once per session, ~1.5 s after PiP
opens (any session kind) or after `ccOn` is switched on while a session is open (popup, other
tab, Lengkap `CC`), if `ccOn` is on and the source has no text:
1. YouTube: the first visible `.ytp-subtitles-button` with `aria-pressed="false"` (not
   `display: none`) → `click()`.
2. JW Player: a visible `.jw-icon-cc[role="button"]` with `aria-checked="false"` → `click()`.
3. Native tracks: if the video has `subtitles`/`captions` tracks and none is `showing` or
   `hidden`, set one to `hidden` (prefer language `id`/`in`, then the browser language, then the
   first), so the overlay (Lengkap) or canvas (Bersih) renders it without Chrome drawing it
   twice. Native PiP (unreadable video, no overlay) uses `showing` instead.
Never switches captions off on the page.

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
- Mini player: a strip across the bottom (`linear-gradient(transparent, rgba(0,0,0,.75))`),
  a full-width seek range (`accent-color: #fff`) above one row:
  `▶`/`❚❚` · `−15` · `+15` · time "12:34 / 44:58" · spacer · `Vol` (toggle mute; dimmed when
  muted or at 0) · 72 px volume range (0–100, step 5) following `volumechange`. Text glyphs,
  white, 13 px, tabular numbers, no emoji.
  - Seek range: hovering shows a small time tooltip above the pointer; click jumps; dragging
    scrubs (`fastSeek` while dragging when available, exact `currentTime` on `change`).
    Hidden for live (non-finite duration) video.
  - Clicking the time turns it into a text input prefilled with the current time; Enter
    parses `h:mm:ss`, `m:ss` or plain seconds and jumps; Esc or blur cancels; invalid or past
    the end → red outline + short shake, no jump. While it has focus, window shortcuts are off.
  - Shows on mousemove, hides after 2.5 s idle; stays while paused, while the pointer is over
    it, or while the time input has focus. Subtitles move above it while it shows.
- Click on video = play/pause; `Space`/`K` = play/pause; `←`/`→` = −/+5 s; `J`/`L` = −/+15 s;
  `↑`/`↓` = volume ±10 %; `Alt+P` or `Esc` = close PiP.
- `A−`/`A+`/`CC` write `fontScale`/`ccOn` to storage (see Settings); changes made in the popup
  while the window is open re-sync the toolbar and overlay.

### Toast (in page)
Fixed bottom-center, inside a Shadow DOM host so page CSS cannot touch it; auto-hide 6 s;
optional single action button. Indonesian copy.

### Popup (`popup.html` + `popup.js`)
300 px wide, 16 px padding, `system-ui` 13 px; colors via CSS variables with light/dark
(`prefers-color-scheme`): light bg `#fff`, text `#111`, muted `#6b7280`, border `#e5e7eb`,
accent `#2563eb`; dark bg `#1c1c1e`, text `#f5f5f7`, muted `#9ca3af`, border `#2c2c2e`,
accent `#3b82f6`. Top to bottom:
- Header: 20 px icon (`icons/icon48.png`) + "PiP Subtitle" (600 14 px).
- Primary button, full width, accent background, white text, 36 px, radius 8 px: "Buka PiP"
  with a right-aligned muted `Alt+P` kbd.
- "Mode tampilan": segmented control (radiogroup) "Bersih" | "Lengkap", 32 px, radius 8 px,
  1 px border, selected = accent text on tinted background; one muted 12 px hint under it that
  follows the selection.
- Rows (≥ 44 px, separated by 1 px borders), label left, control right: "PiP otomatis saat
  pindah tab" + switch (hint "Video harus sedang main dan bersuara."), "Tampilkan subtitle" +
  switch (hint "Menyalakan CC di player bila belum aktif."), "Ukuran teks" + stepper `−` /
  percent / `+` (10 % steps, 60–200 %), "Volume" + native range input (0–100, step 5, ~120 px,
  `accent-color` = accent) + right-aligned percent label (tabular numbers).
- Inline message area (muted, hidden unless needed).
Volume is the page video's own volume, not a setting: on open the popup picks the same frame
"Buka PiP" would (top frame first with the iframe check, else the best-scoring frame) and calls
`window.__pipSub.getVolume()` there; each `input` calls `setVolume(v)` (one `executeScript` in
flight, the latest value wins). No video / injection refused → slider disabled (opacity .45),
label "—". The Bersih window (native video PiP) has no volume control of its own.
Switches are `<button role="switch" aria-checked>` (36×20, accent when on); focus-visible ring
in the accent color; no external fonts or scripts. Without `chrome.*` (opened as a plain page)
it renders with the defaults. Changes are written to storage immediately.

### Language
Every user-visible string is in `i18n.js` (`PIPSUB_STRINGS.en` / `.id`, same keys); content.js and
the popup look strings up by key and re-render when `lang` changes. `pipsubLang('auto')` → `id`
when `navigator.language` starts with `id` or `in`, else `en`. The offset label uses "." in
English and "," in Indonesian. Popup: last row "Language"/"Bahasa" with a 28 px segmented control
"Auto" | "EN" | "ID"; `<html lang>` follows the resolved language (also in the Document PiP
window). content.js injected without i18n.js (tests) shows the keys. The extension name stays
"PiP Subtitle" in both locales. English copy is in `i18n.js`; the Indonesian copy below is
unchanged.

## Copy (Indonesian)
- "Tidak ada video yang bisa di-PiP di halaman ini."
- "Klik untuk membuka PiP" + button "Buka PiP"
- "Subtitle tidak bisa ditampilkan di player ini (video lintas-domain)"
- Toolbar tooltips: "Perkecil teks", "Perbesar teks", "Subtitle on/off",
  "Muat file subtitle (.srt/.vtt)", "Mundurkan subtitle 0,5 detik",
  "Majukan subtitle 0,5 detik", "Lepas file subtitle", "Volume (↑/↓)".
- Mini player tooltips: "Putar/jeda (K)", "Mundur 15 detik (J)", "Maju 15 detik (L)",
  "Klik untuk lompat ke waktu tertentu", "Bisukan / nyalakan suara", seek bar label
  "Posisi video".
- Popup: "Buka PiP", "Mode tampilan", "Bersih", "Lengkap",
  Bersih hint "Tanpa bilah judul. Subtitle digambar di video.",
  Lengkap hint "Ada tombol ukuran teks & muat .srt. Chrome menampilkan nama situs di atas.",
  "PiP otomatis saat pindah tab", "Video harus sedang main dan bersuara.",
  "Tampilkan subtitle", "Menyalakan CC di player bila belum aktif.", "Ukuran teks", "Volume",
  "Tidak ada video yang bisa di-PiP di tab ini."

## Definition of done
- `node --check` passes on all JS files; manifest is valid JSON with the fields above.
- Injecting `content.js` into a Shaka-based player page (no `chrome.*` available) and calling the
  exposed test hook `window.__pipSub.debugSource()` returns the live caption text, and
  `window.__pipSub.debugCanvas()` returns the Mode B canvas (draw loop running, no PiP request)
  whose frames contain the video and the subtitle; `window.__pipSub.stop()` tears it down.
- Loaded unpacked in Chrome: `Alt+P` on a Shaka-based player page opens a PiP window with the video
  and live Indonesian subtitles; closing it puts the video back in the page player.
