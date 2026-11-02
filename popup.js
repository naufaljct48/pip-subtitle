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

// Runs in the tab's top frame. It wins when it has the main video; a visible iframe bigger
// than that video (embedded player) means another frame should be used instead. With
// doToggle the toggle happens in this same call, while the click's activation is fresh.
function topFrameWins(doToggle) {
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
  if (doToggle) window.__pipSub.toggle();
  return true;
}

// The frame "Buka PiP" acts on: top frame first, else the best-scoring frame.
// executeScript (not tabs.sendMessage) keeps the click's user activation, which PiP needs.
async function pickFrame(doToggle) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return null;
  const [top] = await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    func: topFrameWins,
    args: [doToggle],
  });
  if (top && top.result === true) return { tabId: tab.id, frameId: 0 };

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => (typeof window.__pipSubScore === 'function' ? window.__pipSubScore() : 0),
  });
  let best = null;
  for (const r of results || []) {
    const score = Number(r.result);
    if (score > 0 && (!best || score > best.score)) best = { score, frameId: r.frameId };
  }
  if (!best) return null;
  if (doToggle) {
    const [hit] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [best.frameId] },
      func: () => {
        if (!window.__pipSub) return false;
        window.__pipSub.toggle();
        return true;
      },
    });
    if (!(hit && hit.result)) return null;
  }
  return { tabId: tab.id, frameId: best.frameId };
}

openBtn.addEventListener('click', async () => {
  showMessage('');
  if (!hasScripting) { showMessage(NO_VIDEO); return; }
  openBtn.disabled = true;
  let opened = false;
  try {
    opened = !!(await pickFrame(true));
  } catch (_) {
    // chrome:// pages, the Web Store and other pages where injection is not allowed.
    opened = false;
  }
  openBtn.disabled = false;
  if (opened) window.close();
  else showMessage(NO_VIDEO);
});

// Volume: the page video's own volume (not a setting), read from and written to the same
// frame "Buka PiP" would use. One executeScript in flight; the latest value wins.
const volRange = $('volume');
const volLabel = $('volume-value');
let volFrame = null;
let volPending = null;
let volBusy = false;

function renderVolume(v) {
  const ok = !!v;
  volRange.disabled = !ok;
  volRange.closest('.volume').classList.toggle('disabled', !ok);
  if (!ok) { volLabel.textContent = '—'; return; }
  const pct = v.muted ? 0 : Math.round(v.volume * 100);
  volRange.value = String(pct);
  volLabel.textContent = pct + '%';
}

async function flushVolume() {
  if (volBusy || volPending == null || !volFrame) return;
  volBusy = true;
  const value = volPending;
  volPending = null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: volFrame.tabId, frameIds: [volFrame.frameId] },
      func: (x) => (window.__pipSub && window.__pipSub.setVolume ? window.__pipSub.setVolume(x) : null),
      args: [value],
    });
  } catch (_) { /* tab navigated or closed */ }
  volBusy = false;
  flushVolume();
}

volRange.addEventListener('input', () => {
  volLabel.textContent = volRange.value + '%';
  volPending = Number(volRange.value) / 100;
  flushVolume();
});

async function loadVolume() {
  if (!hasScripting) { renderVolume(null); return; }
  try {
    const frame = await pickFrame(false);
    if (!frame) { renderVolume(null); return; }
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: frame.tabId, frameIds: [frame.frameId] },
      func: () => (window.__pipSub && window.__pipSub.getVolume ? window.__pipSub.getVolume() : null),
    });
    volFrame = r && r.result ? frame : null;
    renderVolume(r && r.result);
  } catch (_) {
    renderVolume(null);
  }
}

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
// Chrome only fires auto PiP for sites whose media engagement is "high"; that page shows it.
$('mei-link').addEventListener('click', (e) => {
  e.preventDefault();
  if (hasScripting) chrome.tabs.create({ url: 'chrome://media-engagement' });
});

render();
loadVolume();
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
