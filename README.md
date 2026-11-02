# PiP Subtitle

*English below is a short summary; the full guide follows in Indonesian.*

## English

A Chrome extension that opens a video in Picture-in-Picture **with its subtitles**. Works with common players such as Shaka, JW Player, Video.js, Plyr, YouTube and more.

**Install:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick this folder.

**Use:** press **Alt+P** on a page with a video, or click the extension icon and then **Open PiP**. The popup also has:

- **Display mode** — **Clean** (default): a plain PiP window without a title bar, subtitles drawn on the video, time and progress shown while paused; Chrome's skip buttons jump 15 s. **Full**: a PiP window with a mini player (seek bar, ±15 s, click the time to type one, volume) and text size / `.srt` buttons; Chrome always shows the site name on top of this window.
- **Auto PiP when switching tabs** — Chrome only fires it for sites you often watch with sound (see `chrome://media-engagement`).
- **Show subtitles** (turns on the player's CC if it is off), **Text size**, **Volume** of the video in the tab, and **Language** (Auto / EN / ID; Auto follows the browser language).

Keys in the Full window: Space/K play/pause, ←/→ 5 s, J/L 15 s, ↑/↓ volume, Esc or Alt+P close.

## Bahasa Indonesia

Ekstensi Chrome yang membuka video dalam Picture-in-Picture **beserta subtitle-nya**. Bekerja dengan player umum seperti Shaka, JW Player, Video.js, Plyr, YouTube, dan lain-lain.

## Pasang

1. Buka `chrome://extensions`.
2. Aktifkan **Mode pengembang**.
3. Klik **Muat yang belum dibuka** (Load unpacked) lalu pilih folder ini.

## Pakai

Tekan **Alt+P** di halaman video, atau klik ikon ekstensi lalu **Buka PiP**.

Popup ekstensi juga berisi pengaturan (berlaku langsung, tanpa muat ulang halaman):

- **Mode tampilan**
  - **Bersih** (bawaan) — jendela PiP biasa tanpa bilah judul; subtitle digambar langsung di video.
  - **Lengkap** — jendela PiP dengan tombol ukuran teks dan muat `.srt`. Chrome selalu menampilkan nama situs di bagian atas jendela ini.
- **PiP otomatis saat pindah tab** — video yang sedang main langsung masuk PiP ketika kamu pindah tab.
- **Tampilkan subtitle** — tampilkan/sembunyikan subtitle. Bila CC di player belum aktif, ekstensi menyalakannya sekali saat PiP dibuka (YouTube, JW Player, atau track subtitle bawaan video; Bahasa Indonesia didahulukan). Ekstensi tidak pernah mematikan CC di player.
- **Ukuran teks** — 60–200%.
- **Bahasa** — Auto / EN / ID; Auto mengikuti bahasa browser (Indonesia bila browser berbahasa Indonesia, selain itu Inggris).
- **Volume** — volume video di tab ini (0–100%). Jendela PiP mode Bersih dari Chrome tidak punya penggeser volume, jadi atur dari sini; tombol speaker di jendela Bersih ikut membisukan/menyalakan suara video.

Di jendela PiP mode **Bersih**, waktu dan garis kemajuan muncul di bagian bawah video saat video dijeda atau sebentar sesudah kamu memutar/menjeda/menggeser. Tombol maju/mundur Chrome melompat 15 detik.

Jendela PiP mode **Lengkap** punya pemutar mini di bagian bawah (muncul saat mouse bergerak, tetap tampil selama video dijeda):
- garis waktu — klik untuk melompat, geser untuk mencari; arahkan mouse untuk melihat waktunya
- **▶ / ❚❚** — putar/jeda; **−15 / +15** — mundur/maju 15 detik
- waktu "12:34 / 44:58" — klik lalu ketik waktu tujuan (`1:02:03`, `12:30`, atau `90` detik), tekan Enter
- **Vol** + penggeser — bisukan/nyalakan suara dan atur volume

Tombol di atas kanan jendela Lengkap:
- **A− / A+** — ubah ukuran huruf subtitle
- **CC** — tampilkan/sembunyikan subtitle
- **.srt** — muat berkas subtitle sendiri
- **geser ±0,5 detik** — sesuaikan waktu subtitle

Pintasan di jendela PiP mode Lengkap:
- Klik / **Space** — putar/jeda
- **←** / **→** — mundur/maju 5 detik
- **J** / **L** — mundur/maju 15 detik; **K** — putar/jeda
- **↑** / **↓** — volume naik/turun 10%
- **Esc** / **Alt+P** — tutup PiP

## Catatan

- Subtitle yang tampil di PiP adalah subtitle yang sedang ditampilkan player; bila belum aktif, ekstensi mencoba menyalakan CC player sekitar 1,5 detik setelah PiP terbuka.
- Chrome hanya memicu PiP otomatis untuk situs yang sering kamu tonton dengan suara; cek skornya di `chrome://media-engagement`.
- Video yang tidak bisa digambar ulang (lintas-domain atau ber-DRM) memakai mode Lengkap walau pilihanmu Bersih.
- Player di dalam iframe selalu memakai mode Bersih.
- Video lintas-domain di dalam iframe hanya bisa PiP tanpa subtitle.
