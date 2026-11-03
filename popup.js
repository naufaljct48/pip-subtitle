// Popup: opens PiP in the active tab and edits the settings content.js reads from storage.
'use strict';

// Strings come from i18n.js (loaded first): T(key) in the language the setting resolves to.
const T = (key) => (PIPSUB_STRINGS[pipsubLang(state.lang)] || PIPSUB_STRINGS.en)[key] || key;
const MODE_HINT_KEYS = { clean: 'hintClean', full: 'hintFull' };
const DEFAULTS = { fontScale: 1, ccOn: true, mode: 'clean', autoPip: true, lang: 'auto' };
const SCALE_MIN = 0.6;
const SCALE_MAX = 2.0;

const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
const hasStorage = hasChrome && !!chrome.storage && !!chrome.storage.local;
const hasScripting = hasChrome && !!chrome.tabs && !!chrome.scripting;

const $ = (id) => document.getElementById(id);
const openBtn = $('open');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const langButtons = [...document.querySelectorAll('[data-lang]')];
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
    lang: v.lang === 'en' || v.lang === 'id' ? v.lang : 'auto',
  };
}

// Static copy (data-i18n → text, data-i18n-aria → aria-label) in the current language.
let messageKey = '';
function renderText() {
  document.documentElement.lang = pipsubLang(state.lang);
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', T(el.dataset.i18nAria));
  if (messageKey) msg.textContent = T(messageKey);
  if (volRange && volRange.disabled) volLabel.textContent = T('volumeNone');
}

function render() {
  renderText();
  for (const b of modeButtons) b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
  for (const b of langButtons) b.setAttribute('aria-checked', String(b.dataset.lang === state.lang));
  $('mode-hint').textContent = T(MODE_HINT_KEYS[state.mode]);
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

// key '' hides the message; kept as a key so a language change re-renders it.
function showMessage(key) {
  messageKey = key;
  msg.textContent = key ? T(key) : '';
  msg.hidden = !key;
}

// Runs in the tab's top frame. It wins when it has the main video; a visible iframe bigger
// than that video (embedded player) means another frame should be used instead. With
// doToggle the toggle happens in this same call, while the click's activation is fresh.
function topFrameWins(doToggle) {
  if (typeof window.__pipSubScore !== 'function') return 'missing';
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

// The frame "Open PiP" acts on: top frame first, else the best-scoring frame.
// executeScript (not tabs.sendMessage) keeps the click's user activation, which PiP needs.
async function pickFrame(doToggle, injected = false) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return null;
  const [top] = await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    func: topFrameWins,
    args: [doToggle],
  });
  if (top && top.result === true) return { tabId: tab.id, frameId: 0 };

  // -1 = our content script is not in that frame.
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => (typeof window.__pipSubScore === 'function' ? window.__pipSubScore() : -1),
  });
  // Tabs opened before the extension was installed, reloaded or updated have no content script
  // until they are refreshed: add it now and look again, once.
  const missing = (results || []).filter((r) => r.result === -1).map((r) => r.frameId);
  if (missing.length && !injected) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: missing },
        files: ['i18n.js', 'content.js'],
      });
      return pickFrame(doToggle, true);
    } catch (_) { /* frames we may not script (chrome://, store pages): fall through */ }
  }
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
  if (!hasScripting) { showMessage('noVideoTab'); return; }
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
  else showMessage('noVideoTab');
});

// Volume: the page video's own volume (not a setting), read from and written to the same
// frame "Open PiP" would use. One executeScript in flight; the latest value wins.
const volRange = $('volume');
const volLabel = $('volume-value');
let volFrame = null;
let volPending = null;
let volBusy = false;

function renderVolume(v) {
  const ok = !!v;
  volRange.disabled = !ok;
  volRange.closest('.volume').classList.toggle('disabled', !ok);
  if (!ok) { volLabel.textContent = T('volumeNone'); return; }
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
for (const b of langButtons) {
  b.addEventListener('click', () => update({ lang: b.dataset.lang }));
}
// Arrow keys move between segments, as in a radio group.
function radioKeys(buttons, key) {
  buttons[0].parentElement.addEventListener('keydown', (e) => {
    const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const i = buttons.findIndex((b) => b.dataset[key] === state[key]);
    const next = buttons[(i + dir + buttons.length) % buttons.length];
    update({ [key]: next.dataset[key] });
    next.focus();
  });
}
radioKeys(modeButtons, 'mode');
radioKeys(langButtons, 'lang');
autoSwitch.addEventListener('click', () => update({ autoPip: !state.autoPip }));
ccSwitch.addEventListener('click', () => update({ ccOn: !state.ccOn }));
$('smaller').addEventListener('click', () => update({ fontScale: state.fontScale - 0.1 }));
$('bigger').addEventListener('click', () => update({ fontScale: state.fontScale + 0.1 }));
// Chrome only fires auto PiP for sites whose media engagement is "high"; that page shows it.
$('mei-link').addEventListener('click', (e) => {
  e.preventDefault();
  if (hasScripting) chrome.tabs.create({ url: 'chrome://media-engagement' });
});

$('version').textContent = 'v' + (hasChrome && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '');

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
