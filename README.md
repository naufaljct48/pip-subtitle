# PiP Subtitle

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
- **Tampilkan subtitle** — tampilkan/sembunyikan subtitle.
- **Ukuran teks** — 60–200%.

Tombol di jendela PiP mode Lengkap:
- **A− / A+** — ubah ukuran huruf subtitle
- **CC** — tampilkan/sembunyikan subtitle
- **.srt** — muat berkas subtitle sendiri
- **geser ±0,5 detik** — sesuaikan waktu subtitle

Pintasan di jendela PiP mode Lengkap:
- Klik / **Space** — putar/jeda
- **←** / **→** — mundur/maju 5 detik
- **Esc** / **Alt+P** — tutup PiP

## Catatan

- Subtitle harus sudah aktif di player sebelum membuka PiP.
- Chrome hanya memicu PiP otomatis untuk situs yang sering kamu tonton dengan suara; cek skornya di `chrome://media-engagement`.
- Video yang tidak bisa digambar ulang (lintas-domain atau ber-DRM) memakai mode Lengkap walau pilihanmu Bersih.
- Player di dalam iframe selalu memakai mode Bersih.
- Video lintas-domain di dalam iframe hanya bisa PiP tanpa subtitle.
