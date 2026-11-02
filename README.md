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
- **Tampilkan subtitle** — tampilkan/sembunyikan subtitle. Bila CC di player belum aktif, ekstensi menyalakannya sekali saat PiP dibuka (YouTube, JW Player, atau track subtitle bawaan video; Bahasa Indonesia didahulukan). Ekstensi tidak pernah mematikan CC di player.
- **Ukuran teks** — 60–200%.
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
