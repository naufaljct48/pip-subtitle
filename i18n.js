// UI strings for content.js and the popup (plain script, loaded before both).
// Defines exactly two globals: PIPSUB_STRINGS and pipsubLang. Indonesian is the original copy.
/* exported PIPSUB_STRINGS, pipsubLang */
// eslint-disable-next-line no-var
var PIPSUB_STRINGS = {
  en: {
    // In-page toast
    noVideo: 'No video to PiP on this page.',
    retry: 'Click to open PiP',
    retryBtn: 'Open PiP',
    crossOrigin: "Subtitles can't be shown for this player (cross-origin video)",
    // Full-mode PiP window: toolbar
    smaller: 'Smaller text',
    bigger: 'Larger text',
    cc: 'Subtitles on/off',
    loadFile: 'Load subtitle file (.srt/.vtt)',
    back: 'Shift subtitles back 0.5 s',
    fwd: 'Shift subtitles forward 0.5 s',
    unload: 'Remove subtitle file',
    // Full-mode PiP window: mini player
    volume: 'Volume (↑/↓)',
    mute: 'Mute / unmute',
    back15: 'Back 15 s (J)',
    fwd15: 'Forward 15 s (L)',
    playPause: 'Play/Pause (K)',
    seekBar: 'Video position',
    jumpTo: 'Jump to time',
    // Popup
    openPip: 'Open PiP',
    modeLabel: 'Display mode',
    modeClean: 'Clean',
    modeFull: 'Full',
    hintClean: 'No title bar. Subtitles drawn on the video.',
    hintFull: 'Size & .srt controls, full mini player. Chrome shows the site name on top.',
    autoLabel: 'Auto PiP when switching tabs',
    autoHint: 'Video must be playing with sound, on a site you watch often.',
    checkScore: 'Check score',
    ccLabel: 'Show subtitles',
    ccHint: "Turns on the player's CC if it's off.",
    sizeLabel: 'Text size',
    volumeLabel: 'Volume',
    volumeNone: '—',
    noVideoTab: 'No video to PiP in this tab.',
    langLabel: 'Language',
    langAuto: 'Auto',
  },
  id: {
    noVideo: 'Tidak ada video yang bisa di-PiP di halaman ini.',
    retry: 'Klik untuk membuka PiP',
    retryBtn: 'Buka PiP',
    crossOrigin: 'Subtitle tidak bisa ditampilkan di player ini (video lintas-domain)',
    smaller: 'Perkecil teks',
    bigger: 'Perbesar teks',
    cc: 'Subtitle on/off',
    loadFile: 'Muat file subtitle (.srt/.vtt)',
    back: 'Mundurkan subtitle 0,5 detik',
    fwd: 'Majukan subtitle 0,5 detik',
    unload: 'Lepas file subtitle',
    volume: 'Volume (↑/↓)',
    mute: 'Bisukan / nyalakan suara',
    back15: 'Mundur 15 detik (J)',
    fwd15: 'Maju 15 detik (L)',
    playPause: 'Putar/jeda (K)',
    seekBar: 'Posisi video',
    jumpTo: 'Klik untuk lompat ke waktu tertentu',
    openPip: 'Buka PiP',
    modeLabel: 'Mode tampilan',
    modeClean: 'Bersih',
    modeFull: 'Lengkap',
    hintClean: 'Tanpa bilah judul. Subtitle digambar di video.',
    hintFull: 'Ada tombol ukuran teks & muat .srt. Chrome menampilkan nama situs di atas.',
    autoLabel: 'PiP otomatis saat pindah tab',
    autoHint: 'Video harus main & bersuara, di situs yang sering kamu tonton.',
    checkScore: 'Cek skor',
    ccLabel: 'Tampilkan subtitle',
    ccHint: 'Menyalakan CC di player bila belum aktif.',
    sizeLabel: 'Ukuran teks',
    volumeLabel: 'Volume',
    volumeNone: '—',
    noVideoTab: 'Tidak ada video yang bisa di-PiP di tab ini.',
    langLabel: 'Bahasa',
    langAuto: 'Auto',
  },
};

// 'auto' → Indonesian for an Indonesian browser (id / legacy in), English otherwise.
function pipsubLang(setting) {
  if (setting === 'en' || setting === 'id') return setting;
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  return /^(id|in)\b/i.test(nav) ? 'id' : 'en';
}
