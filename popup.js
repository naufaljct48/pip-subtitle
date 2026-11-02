// Popup: opens PiP in the active tab and edits the settings content.js reads from storage.
'use strict';

const NO_VIDEO = 'Tidak ada video yang bisa di-PiP di tab ini.';
const MODE_HINTS = {
  clean: 'Tanpa bilah judul. Subtitle digambar di video.',
  full: 'Ada tombol ukuran teks & muat .srt. Chrome menampilkan nama situs di atas.',
};
const DEFAULTS = { fontScale: 1, ccOn: true, mode: 'clean', autoPip: true };
const SCALE_MIN = 0.6;
const SCALE_MAX = 2.0;

const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
const hasStorage = hasChrome && !!chrome.storage && !!chrome.storage.local;
const hasScripting = hasChrome && !!chrome.tabs && !!chrome.scripting;

const $ = (id) => document.getElementById(id);
const openBtn = $('open');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const autoSwitch = $('auto');
const ccSwitch = $('cc');
const msg = $('msg');

let state = { ...DEFAULTS };

function normalize(s) {
  const v = s || {};
  const n = Number(v.fontScale);
  return {
    ...v,
    fontScale: Number.isFinite(n) ? Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) * 10) / 10 : 1,
    ccOn: v.ccOn !== false,
    mode: v.mode === 'full' ? 'full' : 'clean',
    autoPip: v.autoPip !== false,
  };
}

function render() {
  for (const b of modeButtons) b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
  $('mode-hint').textContent = MODE_HINTS[state.mode];
  autoSwitch.setAttribute('aria-checked', String(state.autoPip));
  ccSwitch.setAttribute('aria-checked', String(state.ccOn));
  $('size').textContent = Math.round(state.fontScale * 100) + '%';
  $('smaller').disabled = state.fontScale <= SCALE_MIN;
  $('bigger').disabled = state.fontScale >= SCALE_MAX;
}

function update(patch) {
  state = normalize({ ...state, ...patch });
  render();
  if (!hasStorage) return;
  // Merge into what is stored so keys written elsewhere are kept.
  chrome.storage.local.get('pipsub', (res) => {
    const prev = (res && res.pipsub) || {};
    chrome.storage.local.set({ pipsub: { ...prev, ...patch, fontScale: state.fontScale } });
  });
}

function showMessage(text) {
  msg.textContent = text;
  msg.hidden = !text;
}

// Runs in the tab's top frame. Toggles there when it has the main video; a visible iframe
// bigger than that video (embedded player) means another frame should win instead.
function toggleInTopFrame() {
  if (typeof window.__pipSubScore !== 'function') return false;
  const score = window.__pipSubScore();
  if (!(score > 0)) return false;
  if (score < Number.MAX_SAFE_INTEGER) {
    const vw = innerWidth;
    const vh = innerHeight;
    for (const f of document.querySelectorAll('iframe')) {
      const r = f.getBoundingClientRect();
      const a = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (a * 2 > score) return false;
    }
  }
  window.__pipSub.toggle();
  return true;
}

// executeScript (not tabs.sendMessage) keeps the click's user activation, which PiP needs.
async function openInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return false;
  const [top] = await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    func: toggleInTopFrame,
  });
  if (top && top.result === true) return true;

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => (typeof window.__pipSubScore === 'function' ? window.__pipSubScore() : 0),
  });
  let best = null;
  for (const r of results || []) {
    const score = Number(r.result);
    if (score > 0 && (!best || score > best.score)) best = { score, frameId: r.frameId };
  }
  if (!best) return false;
  const [hit] = await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [best.frameId] },
    func: () => {
      if (!window.__pipSub) return false;
      window.__pipSub.toggle();
      return true;
    },
  });
  return !!(hit && hit.result);
}

openBtn.addEventListener('click', async () => {
  showMessage('');
  if (!hasScripting) { showMessage(NO_VIDEO); return; }
  openBtn.disabled = true;
  let opened = false;
  try {
    opened = await openInActiveTab();
  } catch (_) {
    // chrome:// pages, the Web Store and other pages where injection is not allowed.
    opened = false;
  }
  openBtn.disabled = false;
  if (opened) window.close();
  else showMessage(NO_VIDEO);
});

for (const b of modeButtons) {
  b.addEventListener('click', () => update({ mode: b.dataset.mode }));
}
// Arrow keys move between the two segments, as in a radio group.
document.querySelector('.segmented').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const next = state.mode === 'clean' ? 'full' : 'clean';
  update({ mode: next });
  modeButtons.find((b) => b.dataset.mode === next).focus();
});
autoSwitch.addEventListener('click', () => update({ autoPip: !state.autoPip }));
ccSwitch.addEventListener('click', () => update({ ccOn: !state.ccOn }));
$('smaller').addEventListener('click', () => update({ fontScale: state.fontScale - 0.1 }));
$('bigger').addEventListener('click', () => update({ fontScale: state.fontScale + 0.1 }));

render();
if (hasStorage) {
  chrome.storage.local.get('pipsub', (res) => {
    state = normalize(res && res.pipsub);
    render();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pipsub) {
      state = normalize(changes.pipsub.newValue);
      render();
    }
  });
}
