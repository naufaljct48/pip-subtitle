# PiP Subtitle

Ekstensi Chrome yang membuka video dalam Picture-in-Picture **beserta subtitle-nya**. Bekerja dengan player umum seperti Shaka, JW Player, Video.js, Plyr, dan lain-lain.

## Pasang

1. Buka `chrome://extensions`.
2. Aktifkan **Mode pengembang**.
3. Klik **Muat yang belum dibuka** (Load unpacked) lalu pilih folder ini.

## Pakai

Tekan **Alt+P** di halaman video, atau klik ikon ekstensi.

Tombol di jendela PiP:
- **A− / A+** — ubah ukuran huruf subtitle
- **CC** — tampilkan/sembunyikan subtitle
- **.srt** — muat berkas subtitle sendiri
- **geser ±0,5 detik** — sesuaikan waktu subtitle

Pintasan di jendela PiP:
- Klik / **Space** — putar/jeda
- **←** / **→** — mundur/maju 5 detik
- **Esc** / **Alt+P** — tutup PiP

## Catatan

- Subtitle harus sudah aktif di player sebelum membuka PiP.
- Player di dalam iframe memakai mode canvas.
- Video lintas-domain hanya bisa PiP tanpa subtitle.
