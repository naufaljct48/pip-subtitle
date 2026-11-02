# Chrome Web Store listing — PiP Subtitle

Text to paste into the Chrome Web Store developer dashboard. Character limits are checked by
`node store/check-listing.mjs`.

## Name

PiP Subtitle

## Short description (max 132 characters)

**EN:**
Picture-in-Picture that keeps the subtitles. Works with HTML captions from Shaka, JW Player, Video.js, Plyr and more.

**ID:**
Picture-in-Picture yang tetap menampilkan subtitle. Mendukung subtitle HTML dari Shaka, JW Player, Video.js, Plyr, dll.

## Detailed description

### EN

Watch in Picture-in-Picture without losing the subtitles.

Most web video players draw subtitles as HTML on top of the video. Chrome's built-in
Picture-in-Picture only shows the video itself, so the subtitles disappear as soon as the video
pops out. PiP Subtitle reads the captions the player is showing and puts them into the PiP window.

Features
• Subtitles in PiP from the player's caption layer, the video's text tracks, or your own .srt / .vtt file
• Clean mode: a plain PiP window with no title bar, subtitles drawn on the video, time and progress while paused
• Full mode: a PiP window with a mini player (seek bar, ±15 s, type a time to jump, volume), text size, .srt loading and subtitle offset
• Automatic PiP when you switch tabs (on sites Chrome allows it for)
• Turns on the player's captions if they are off
• Keeps playing in PiP on sites that pause the video when the tab is hidden
• Volume control in the popup
• English and Indonesian interface
• Keyboard: Alt+P to open or close

Works with Shaka Player, JW Player, Video.js, Plyr, ArtPlayer, DPlayer, Flowplayer, MediaElement.js,
Vidstack, media-chrome, Bitmovin and other players that show captions as text on the page.

Privacy: no data is collected or sent. No network requests, no analytics, no remote code. Settings
are stored on your device only.

Open source (MIT): https://github.com/naufaljct48/pip-subtitle

### ID

Tonton dalam Picture-in-Picture tanpa kehilangan subtitle.

Kebanyakan player video di web menggambar subtitle sebagai HTML di atas video. Picture-in-Picture
bawaan Chrome hanya menampilkan videonya, jadi subtitle hilang begitu video dikeluarkan. PiP
Subtitle membaca subtitle yang sedang ditampilkan player dan memasukkannya ke jendela PiP.

Fitur
• Subtitle di PiP dari lapisan subtitle player, track teks video, atau file .srt / .vtt milikmu
• Mode Bersih: jendela PiP biasa tanpa bilah judul, subtitle digambar di video, waktu dan kemajuan saat dijeda
• Mode Lengkap: jendela PiP dengan pemutar mini (garis waktu, ±15 detik, ketik waktu tujuan, volume), ukuran teks, muat .srt, dan geser waktu subtitle
• PiP otomatis saat pindah tab (di situs yang diizinkan Chrome)
• Menyalakan CC player bila belum aktif
• Tetap berputar di PiP pada situs yang menjeda video saat tab disembunyikan
• Pengatur volume di popup
• Tampilan bahasa Inggris dan Indonesia
• Pintasan: Alt+P untuk membuka atau menutup

Mendukung Shaka Player, JW Player, Video.js, Plyr, ArtPlayer, DPlayer, Flowplayer, MediaElement.js,
Vidstack, media-chrome, Bitmovin, dan player lain yang menampilkan subtitle sebagai teks di halaman.

Privasi: tidak ada data yang dikumpulkan atau dikirim. Tanpa permintaan jaringan, tanpa analitik,
tanpa kode dari luar. Pengaturan hanya disimpan di perangkatmu.

Sumber terbuka (MIT): https://github.com/naufaljct48/pip-subtitle

## Category

Suggested: **Accessibility** — the extension exists to keep subtitles/captions visible, which is
an accessibility need (deaf and hard-of-hearing viewers, non-native speakers).
Alternative: **Tools** (or **Productivity**), if the reviewer or listing position works better
there. Language: English (add Indonesian as a second listing language).

## Single purpose

Show a web video in Picture-in-Picture together with the subtitles the page's player is
displaying.

## Permission justifications

- **Host permissions (`<all_urls>`, content script on all sites):** videos and their caption
  layers can be on any site. The content script must run on the page that has the video to find
  the video, read the captions the player is showing, and handle the Alt+P shortcut and automatic
  PiP. It makes no network requests and sends nothing anywhere.
- **`scripting`:** when you press "Open PiP" in the popup, the extension runs the toggle in the
  frame of the tab that holds the video (top page or an embedded player iframe). Running it
  through `chrome.scripting.executeScript` keeps the click's user activation, which Chrome
  requires for opening Picture-in-Picture.
- **`storage`:** saves the user's settings (display mode, text size, subtitles on/off, automatic
  PiP, language) in `chrome.storage.local` on the device.

## Remote code

No. All code is packaged in the extension; nothing is downloaded or evaluated at runtime.

## Data usage (privacy practices tab)

Data collected: **none** — leave every category unchecked (no personally identifiable info,
health, financial, authentication, personal communications, location, web history, user activity,
or website content is collected or transmitted).

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: https://github.com/naufaljct48/pip-subtitle/blob/main/PRIVACY.md

## Screenshots (ready, 1280×800 PNG in store/screenshots/)

Upload in this order (the store allows up to 5; pick 6-indonesia-id.png instead of 5 for an
Indonesian-first listing):

1. `1-hero-en.png` — Full mode PiP window with a two-line subtitle and the mini player.
2. `2-compare-en.png` — same moment in regular PiP (no subtitle) vs PiP Subtitle (Clean).
3. `3-full-mode-en.png` — Full mode mini player features.
4. `4-popup-en.png` — popup, light and dark.
5. `5-background-en.png` — Clean PiP over the page: keeps playing when you switch tabs.
6. `6-indonesia-id.png` — Indonesian UI and subtitles.

All footage is original (scenes generated for this project, see `store/demo/`); subtitles are
written for the demo; no third-party site appears. Regenerate with `store/tools/` (Windows).

## Promo tile (440×280)

`store/screenshots/promo-small-440x280.png`

