// PiP Subtitle: Picture-in-Picture that keeps the page's captions. See docs/SPEC.md.
(() => {
  'use strict';
  if (window.__pipSubLoaded) return;
  window.__pipSubLoaded = true;

  // ==== Environment, copy, settings ====

  const extAlive = () =>
    typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  const storageOk = () => extAlive() && !!chrome.storage && !!chrome.storage.local;

  const COPY = {
    noVideo: 'Tidak ada video yang bisa di-PiP di halaman ini.',
    retry: 'Klik untuk membuka PiP',
    retryBtn: 'Buka PiP',
    crossOrigin: 'Subtitle tidak bisa ditampilkan di player ini (video lintas-domain)',
    smaller: 'Perkecil teks',
    bigger: 'Perbesar teks',
    cc: 'Subtitle on/off',
    loadFile: 'Muat file subtitle (.srt/.vtt)',
    volume: 'Volume (↑/↓)',
    back15: 'Mundur 15 detik (J)',
    playPause: 'Putar/jeda (K)',
    fwd15: 'Maju 15 detik (L)',
    seekBar: 'Posisi video',
    jumpTo: 'Klik untuk lompat ke waktu tertentu',
    mute: 'Bisukan / nyalakan suara',
    back: 'Mundurkan subtitle 0,5 detik',
    fwd: 'Majukan subtitle 0,5 detik',
    unload: 'Lepas file subtitle',
  };

  const SCALE_MIN = 0.6;
  const SCALE_MAX = 2.0;
  // mode: 'clean' = native PiP of a canvas with burned-in subtitles, 'full' = Document PiP.
  const settings = { fontScale: 1, ccOn: true, mode: 'clean', autoPip: true };
  const settingsListeners = new Set();

  function clampScale(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 1;
    return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) * 10) / 10;
  }

  function applyStored(s) {
    const v = s || {};
    settings.fontScale = clampScale(v.fontScale == null ? 1 : v.fontScale);
    settings.ccOn = v.ccOn !== false;
    settings.mode = v.mode === 'full' ? 'full' : 'clean';
    settings.autoPip = v.autoPip !== false;
    for (const fn of settingsListeners) {
      try { fn(); } catch (err) { console.warn('[PiP Subtitle]', err); }
    }
  }

  function loadSettings() {
    if (!storageOk()) return;
    try {
      chrome.storage.local.get('pipsub', (res) => {
        if (chrome.runtime.lastError || !res) return;
        applyStored(res.pipsub);
      });
      // The popup and other tabs write here; apply their changes live.
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.pipsub) applyStored(changes.pipsub.newValue);
      });
    } catch (_) { /* extension context gone */ }
  }

  // Only the keys this script edits are written; the rest of the stored object is kept.
  function saveSettings() {
    if (!storageOk()) return;
    try {
      chrome.storage.local.get('pipsub', (res) => {
        if (chrome.runtime.lastError) return;
        const prev = (res && res.pipsub) || {};
        const p = chrome.storage.local.set({
          pipsub: { ...prev, fontScale: settings.fontScale, ccOn: settings.ccOn },
        });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      });
    } catch (_) { /* extension context gone */ }
  }

  loadSettings();

  // ==== Small helpers ====

  const isOurs = (el) => !!(el && el.closest && el.closest('[data-pipsub]'));

  // Only used by our PiP controls, so a pause here is the user's own.
  function togglePlay(v) {
    if (v.paused) v.play().catch(() => {});
    else { markUserPause(); v.pause(); }
  }

  function seekBy(v, delta) {
    try {
      let t = v.currentTime + delta;
      if (t < 0) t = 0;
      if (Number.isFinite(v.duration) && t > v.duration) t = v.duration;
      v.currentTime = t;
    } catch (_) { /* not seekable */ }
  }

  // 0..1; above 0 also unmutes, 0 mutes.
  function applyVolume(v, x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return;
    const vol = Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
    v.volume = vol;
    v.muted = vol === 0;
  }

  function waitEvent(target, name, ms) {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); target.removeEventListener(name, done); resolve(); };
      const timer = setTimeout(done, ms);
      target.addEventListener(name, done, { once: true });
    });
  }

  function isEditableEvent(e) {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!t || t.nodeType !== 1) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const type = (t.type || 'text').toLowerCase();
      return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image']
        .includes(type);
    }
    return false;
  }

  // ==== Picking the video ====

  function videoScore(v) {
    if (!v || !v.isConnected || v.readyState === 0 || isOurs(v)) return 0;
    const r = v.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const area = w * h;
    if (area < 100 * 60) return 0;
    const playing = !v.paused && !v.ended;
    return area * (playing ? 2 : 1);
  }

  // Videos inside open shadow roots (web-component players); the walk is capped.
  function shadowVideos(limit) {
    const out = [];
    let seen = 0;
    const visit = (root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n && seen < limit; n = walker.nextNode()) {
        seen++;
        if (n.shadowRoot) {
          out.push(...n.shadowRoot.querySelectorAll('video'));
          visit(n.shadowRoot);
        }
      }
    };
    if (document.documentElement) visit(document.documentElement);
    return out;
  }

  function pickVideo() {
    const best = { video: null, score: 0 };
    const consider = (list) => {
      for (const v of list) {
        const s = videoScore(v);
        if (s > best.score) { best.video = v; best.score = s; }
      }
    };
    consider(document.querySelectorAll('video'));
    if (!best.video) consider(shadowVideos(5000));
    return best.video ? best : null;
  }

  // ==== Subtitle files (.srt / .vtt) — pure functions ====

  const TIMING_RE =
    /^\s*((?:\d+:)?\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)/;
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lrm: '', rlm: '' };

  function parseTimestamp(s) {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(String(s).trim());
    if (!m) return NaN;
    const ms = m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0;
    return (m[1] ? Number(m[1]) : 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms;
  }

  function cleanCueText(t) {
    return String(t)
      .replace(/\r\n?/g, '\n')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&(amp|lt|gt|quot|apos|nbsp|lrm|rlm);/g, (_, n) => ENTITIES[n])
      .split('\n')
      .map((s) => s.replace(/[ \t ]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  function parseSubtitles(text) {
    const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    const cues = [];
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const t = cleanCueText(cur.lines.join('\n'));
      if (t && cur.end > cur.start) cues.push({ start: cur.start, end: cur.end, text: t });
      cur = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = TIMING_RE.exec(line);
      if (m) {
        flush();
        const start = parseTimestamp(m[1]);
        const end = parseTimestamp(m[2]);
        if (Number.isFinite(start) && Number.isFinite(end)) cur = { start, end, lines: [] };
        continue;
      }
      if (!line.trim()) { flush(); continue; }
      // Outside a cue: WEBVTT header, NOTE/STYLE/REGION blocks, cue ids, SRT indexes.
      if (!cur) continue;
      // Malformed SRT without a blank line before the next index.
      if (/^\s*\d+\s*$/.test(line) && i + 1 < lines.length && TIMING_RE.test(lines[i + 1])) continue;
      cur.lines.push(line);
    }
    flush();
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  function cueTextAt(cues, t) {
    const out = [];
    for (const c of cues) {
      if (c.start > t) break;
      if (c.end > t) out.push(c.text);
    }
    return out.join('\n');
  }

  function decodeSubtitleBytes(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (_) {
      // Mostly-valid UTF-8 with a few broken bytes stays UTF-8; otherwise it is a legacy codepage.
      const loose = new TextDecoder('utf-8').decode(bytes);
      const bad = (loose.match(/�/g) || []).length;
      const good = (loose.match(/[^\x00-\x7f�]/g) || []).length;
      return good > bad ? loose : new TextDecoder('windows-1252').decode(bytes);
    }
  }

  async function readSubtitleFile(file) {
    return decodeSubtitleBytes(new Uint8Array(await file.arrayBuffer()));
  }

  // ==== Subtitle sources (external file > page container > hidden text tracks) ====

  const CAPTION_SELECTORS = [
    '.shaka-text-container', '.jw-text-track-container', '.jw-captions',
    '.vjs-text-track-display', '.plyr__captions', '.art-subtitle', '.dplayer-subtitle',
    '.fp-captions', '.mejs__captions-layer', '.mejs-captions-layer', '.vds-captions',
    'media-captions', '.ytp-caption-window-container', '.player-timedtext',
    '.dss-subtitle-renderer-wrapper', '.dss-subtitle-renderer',
    '.atvwebplayersdk-captions-overlay', '.bmpui-ui-subtitle-overlay',
    '.bpx-player-subtitle-wrap', '.vp-captions', '.player-captions-container',
    '[data-part="captions"]',
    '[class*="subtitle" i]', '[class*="caption" i]',
  ];
  const GENERIC_FROM = CAPTION_SELECTORS.length - 2;
  const NOT_CAPTION =
    'button, [role="button"], [role="menu"], [role="menuitem"], ' +
    '[class*="button" i], [class*="menu" i], [class*="setting" i]';
  const NOT_CAPTION_TAGS = new Set([
    'VIDEO', 'AUDIO', 'TRACK', 'SOURCE', 'INPUT', 'SELECT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'IMG', 'SVG',
  ]);

  function upFrom(n) {
    if (n.nodeType === 11) return n.host || null;
    if (n.parentElement) return n.parentElement;
    return n.parentNode && n.parentNode.nodeType === 11 ? n.parentNode : null;
  }

  function usableContainer(el, root, avoid) {
    if (NOT_CAPTION_TAGS.has(String(el.tagName).toUpperCase())) return false;
    if (isOurs(el)) return false;
    for (let n = el; n && n !== root && n.nodeType === 1; n = n.parentElement) {
      if (n.matches(NOT_CAPTION)) return false;
    }
    if (el.querySelector('button')) return false;
    for (const a of avoid) if (a && el.contains(a)) return false;
    return true;
  }

  // Known player selectors are tried across all levels before the generic class patterns.
  // Among generic matches, one currently showing text beats an empty one.
  function findCaptionContainer(anchor, avoid) {
    if (!anchor) return null;
    const roots = [];
    for (let n = anchor; n && roots.length <= 6; n = upFrom(n)) roots.push(n);
    let firstGeneric = null;
    const checked = new Set();
    for (let s = 0; s < CAPTION_SELECTORS.length; s++) {
      const generic = s >= GENERIC_FROM;
      for (const root of roots) {
        if (typeof root.querySelectorAll !== 'function') continue;
        let list;
        try { list = root.querySelectorAll(CAPTION_SELECTORS[s]); } catch (_) { continue; }
        for (const el of list) {
          if (generic && checked.has(el)) continue;
          if (!usableContainer(el, root, avoid)) continue;
          if (!generic) return { el, generic: false, hasText: false };
          checked.add(el);
          if (readContainerText(el)) return { el, generic: true, hasText: true };
          if (!firstGeneric) firstGeneric = { el, generic: true, hasText: false };
          if (checked.size >= 200) return firstGeneric;
        }
      }
    }
    return firstGeneric;
  }

  function normalizeLines(t) {
    return String(t)
      .replace(/\r/g, '')
      .split('\n')
      .map((s) => s.replace(/[ \t ]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  function readContainerText(el) {
    // innerText of a display:none element falls back to textContent, so check rendering first.
    if (!el.isConnected || el.getClientRects().length === 0) return '';
    const view = el.ownerDocument.defaultView || window;
    const cs = view.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return '';
    return normalizeLines(el.innerText || '');
  }

  function createSubtitleSource(video, opts) {
    const { getAnchor, avoid, includeShowing } = opts;
    let found = null;
    let observer = null;
    let last = '';
    let external = null;
    let offset = 0;
    let destroyed = false;
    const trackSet = new Set();

    function detach() {
      if (observer) observer.disconnect();
      observer = null;
      found = null;
    }

    function locate() {
      const hit = findCaptionContainer(getAnchor(), avoid());
      if (!hit || (found && hit.el === found.el)) return;
      // A generic match yields only to a known one, or to a generic one showing text while
      // the current one is empty.
      if (found && hit.generic && (!hit.hasText || readContainerText(found.el))) return;
      detach();
      found = hit;
      observer = new MutationObserver(() => refresh());
      observer.observe(hit.el, { childList: true, subtree: true, characterData: true });
    }

    function trackText() {
      const tracks = video.textTracks;
      if (!tracks) return '';
      const out = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.kind && t.kind !== 'subtitles' && t.kind !== 'captions') continue;
        if (!(t.mode === 'hidden' || (includeShowing && t.mode === 'showing'))) continue;
        const cues = t.activeCues;
        if (!cues) continue;
        for (let j = 0; j < cues.length; j++) {
          const txt = cleanCueText(cues[j].text || '');
          if (txt) out.push(txt);
        }
      }
      return out.join('\n');
    }

    function compute() {
      if (external) return cueTextAt(external, video.currentTime + offset);
      return (found ? readContainerText(found.el) : '') || trackText();
    }

    function refresh() {
      if (destroyed) return;
      let t = '';
      try { t = compute(); } catch (_) { t = ''; }
      if (t !== last) {
        last = t;
        if (typeof opts.onChange === 'function') opts.onChange(t);
      }
    }

    const onCue = () => refresh();
    function watchTracks() {
      const tracks = video.textTracks;
      if (!tracks) return;
      for (let i = 0; i < tracks.length; i++) {
        if (trackSet.has(tracks[i])) continue;
        trackSet.add(tracks[i]);
        tracks[i].addEventListener('cuechange', onCue);
      }
    }
    if (video.textTracks) video.textTracks.addEventListener('addtrack', watchTracks);
    watchTracks();
    locate();

    const pollTimer = setInterval(() => {
      if (found && !found.el.isConnected) detach();
      refresh();
    }, 250);
    // Players create their caption layer late; a generic match may still be upgraded.
    const searchTimer = setInterval(() => {
      if (found && !found.generic) return;
      const before = found;
      locate();
      if (found !== before) refresh();
    }, 2000);

    return {
      get text() { return last; },
      get offset() { return offset; },
      hasExternal: () => !!external,
      compute,
      refresh,
      setExternal(cues) { external = cues; offset = 0; refresh(); },
      clearExternal() { external = null; offset = 0; refresh(); },
      shiftOffset(d) { offset = Math.round((offset + d) * 10) / 10; refresh(); },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        clearInterval(pollTimer);
        clearInterval(searchTimer);
        detach();
        if (video.textTracks) video.textTracks.removeEventListener('addtrack', watchTracks);
        for (const t of trackSet) t.removeEventListener('cuechange', onCue);
        trackSet.clear();
      },
    };
  }

  // ==== Toast (in page, shadow DOM) ====

  let toastHost = null;
  let toastTimer = 0;

  const TOAST_CSS = `
    .pill{display:flex;align-items:center;gap:12px;max-width:min(92vw,520px);box-sizing:border-box;
      padding:10px 14px;border-radius:999px;background:rgba(20,20,20,.94);color:#fff;
      font:14px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)}
    .msg{flex:1 1 auto}
    button{flex:0 0 auto;border:0;border-radius:999px;padding:6px 14px;background:#fff;color:#111;
      font:600 13px/1.2 system-ui,sans-serif;cursor:pointer}
    button:hover{background:#e6e6e6}`;

  function hideToast() {
    clearTimeout(toastTimer);
    if (toastHost) toastHost.remove();
    toastHost = null;
  }

  function toast(message, action) {
    hideToast();
    const host = document.createElement('pipsub-toast');
    host.setAttribute('data-pipsub', '');
    host.style.cssText =
      'all:initial!important;display:block!important;position:fixed!important;left:50%!important;' +
      'bottom:24px!important;transform:translateX(-50%)!important;z-index:2147483647!important;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = TOAST_CSS;
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.setAttribute('role', 'status');
    const msg = document.createElement('span');
    msg.className = 'msg';
    msg.textContent = message;
    pill.append(msg);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideToast();
        action.run();
      });
      pill.append(btn);
    }
    root.append(style, pill);
    const fs = document.fullscreenElement;
    const parent = fs && fs.tagName !== 'VIDEO' ? fs : (document.body || document.documentElement);
    parent.appendChild(host);
    toastHost = host;
    toastTimer = setTimeout(hideToast, 6000);
  }

  const offerRetry = () => toast(COPY.retry, { label: COPY.retryBtn, run: () => toggle() });

  // ==== Session state & toggle ====

  let session = null; // { kind: 'doc' | 'canvas' | 'native' | 'debug', video, source?, close() }
  let opening = false;
  let openingVideo = null;
  let docPipBroken = false;

  // ==== Keep playing while the tab is hidden ====
  // Some sites pause their own video on visibilitychange, which freezes the PiP the user
  // switched tabs to watch. While a session is open or opening we (1) hide that event from the
  // page and (2) undo a pause that lands right after the tab was hidden.

  let hiddenAt = -Infinity;
  let resumedForHide = null;
  let userPauseAt = -Infinity;
  const lastPause = { video: null, at: -Infinity };

  function markUserPause() { userPauseAt = performance.now(); }

  const guardActive = () => opening || !!(session && session.kind !== 'debug');

  // Window capture runs before the page's own listeners on document (where sites usually
  // listen), so stopping it here hides the event from them. Listeners a page added on window
  // capture before us still run; the auto-resume below covers those. Registered at load time
  // (document_idle) in every frame; inert unless this frame has a session.
  window.addEventListener('visibilitychange', (e) => {
    if (document.visibilityState === 'hidden') hiddenAt = performance.now();
    if (guardActive()) e.stopImmediatePropagation();
  }, true);

  // A pause within 1.5 s of hiding that we or the user did not ask for is the site reacting
  // to the tab switch: resume once per hide.
  function pausedByHide(video, at) {
    return document.hidden && at - hiddenAt < 1500 && at - userPauseAt > 1000 &&
      resumedForHide !== hiddenAt && !!video;
  }

  // Page videos paused just before auto PiP fires (no session yet, so not guarded).
  document.addEventListener('pause', (e) => {
    if (!e.target || e.target.tagName !== 'VIDEO') return;
    lastPause.video = e.target;
    lastPause.at = performance.now();
  }, true);

  const guardedVideos = new WeakSet();
  function guardVideo(video) {
    if (guardedVideos.has(video)) return;
    guardedVideos.add(video);
    video.addEventListener('pause', () => {
      const now = performance.now();
      lastPause.video = video;
      lastPause.at = now;
      const mine = (session && session.kind !== 'debug' && session.video === video) ||
        (opening && openingVideo === video);
      if (!mine || !pausedByHide(video, now)) return;
      resumedForHide = hiddenAt;
      video.play().catch(() => {});
    });
  }

  // Top frame: 'full' → Document PiP; 'clean' → canvas PiP, except videos a canvas cannot read
  // (cross-origin, EME/DRM, tainted), which Document PiP can still move. Iframes: canvas PiP.
  function openPip(video) {
    guardVideo(video);
    openingVideo = video;
    const docPipOk = window === window.top && !!window.documentPictureInPicture && !docPipBroken;
    if (!docPipOk) return openCanvasPip(video, openNativePip);
    if (settings.mode === 'full' || looksCrossOrigin(video) || video.mediaKeys) return openDocPip(video);
    return openCanvasPip(video, openDocPip);
  }

  async function toggle() {
    if (session) { session.close(); return; }
    if (opening) return;
    const pick = pickVideo();
    if (!pick) { toast(COPY.noVideo); return; }
    opening = true;
    try {
      await openPip(pick.video);
    } catch (err) {
      console.warn('[PiP Subtitle]', err);
    } finally {
      opening = false;
    }
  }

  function handleOpenError(err) {
    if (err && err.name === 'NotAllowedError') offerRetry();
    else if (!err || err.name !== 'AbortError') console.warn('[PiP Subtitle]', err);
  }

  // ==== Turning on the site's captions ====
  // The overlay only mirrors captions the player shows. If nothing shows ~1.5 s after PiP
  // opens (or after CC is switched on), switch the site's captions on once per session.
  // Never switches them off.

  const isShown = (el) => el.getClientRects().length > 0 &&
    !/display:\s*none/i.test(el.getAttribute('style') || '');

  function pickTrack(list) {
    const langs = ['id', 'in', String(navigator.language || '').toLowerCase().split('-')[0]];
    for (const l of langs) {
      const t = list.find((x) => String(x.language || '').toLowerCase().split('-')[0] === l);
      if (t) return t;
    }
    return list[0];
  }

  function enableSiteCaptions(video, nativeMode) {
    // YouTube: CC button in the same frame; aria-pressed="true" means already on.
    for (const b of document.querySelectorAll('.ytp-subtitles-button')) {
      if (b.getAttribute('aria-pressed') === 'false' && isShown(b)) { b.click(); return 'youtube'; }
    }
    // JW Player: a plain CC toggle only.
    for (const b of document.querySelectorAll('.jw-icon-cc[role="button"]')) {
      if (b.getAttribute('aria-checked') === 'false' && isShown(b)) { b.click(); return 'jw'; }
    }
    // Native tracks: 'hidden' lets our overlay / canvas render them without Chrome drawing them
    // a second time. Native PiP (no overlay) needs 'showing' to display them at all.
    const tracks = video.textTracks ? [...video.textTracks] : [];
    const subs = tracks.filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
    if (subs.length && !subs.some((t) => t.mode === 'showing' || t.mode === 'hidden')) {
      pickTrack(subs).mode = nativeMode ? 'showing' : 'hidden';
      return 'track';
    }
    return null;
  }

  function scheduleCaptionsOn(sess) {
    if (!sess || sess.captionsTried || sess.captionsTimer) return;
    sess.captionsTimer = setTimeout(() => {
      sess.captionsTimer = 0;
      if (session !== sess || !settings.ccOn || sess.captionsTried) return;
      sess.captionsTried = true;
      let text = '';
      try { text = sess.source ? sess.source.compute() : ''; } catch (_) { /* source gone */ }
      if (text) return;
      try {
        if (enableSiteCaptions(sess.video, sess.kind === 'native') && sess.source) {
          setTimeout(() => { if (session === sess) sess.source.refresh(); }, 300);
        }
      } catch (err) { console.warn('[PiP Subtitle]', err); }
    }, 1500);
  }

  // CC switched on (popup, other tab, or the Lengkap toolbar) while a session is open.
  settingsListeners.add(() => {
    if (settings.ccOn && session && session.kind !== 'debug') scheduleCaptionsOn(session);
  });

  // ==== Mode A — Document PiP ====

  const DOC_CSS = `
    :root{--scale:1}
    html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}
    body{position:relative}
    [hidden]{display:none!important}
    video{position:absolute!important;inset:0!important;left:0!important;top:0!important;
      right:auto!important;bottom:auto!important;width:100%!important;height:100%!important;
      max-width:none!important;max-height:none!important;margin:0!important;
      transform:none!important;object-fit:contain!important}
    .sub{position:absolute;left:50%;bottom:7%;transform:translateX(-50%);width:max-content;
      max-width:92%;text-align:center;white-space:pre-line;color:#fff;
      font:600 calc(5.5vh * var(--scale)) system-ui,sans-serif;line-height:1.3;
      text-shadow:0 0 4px #000,0 1px 2px #000;pointer-events:none;z-index:10}
    .sub span{background:rgba(0,0,0,.55);padding:.1em .45em;border-radius:4px;
      -webkit-box-decoration-break:clone;box-decoration-break:clone}
    .bar{position:absolute;top:8px;right:8px;display:flex;align-items:center;gap:4px;
      z-index:2147483647;opacity:0;pointer-events:none;transition:opacity .15s}
    .bar.show{opacity:1;pointer-events:auto}
    .bar button,.bar .lbl{background:rgba(0,0,0,.6);color:#fff;font:12px/1.2 system-ui,sans-serif;
      border:0;border-radius:6px;padding:4px 7px;margin:0}
    .bar button{cursor:pointer}
    .bar button:hover{background:rgba(0,0,0,.85)}
    .bar button.off{opacity:.45}
    .ctl{position:absolute;left:0;right:0;bottom:0;padding:18px 10px 8px;display:flex;
      flex-direction:column;gap:4px;background:linear-gradient(transparent,rgba(0,0,0,.75));
      z-index:2147483646;opacity:0;pointer-events:none;transition:opacity .15s}
    .ctl.show{opacity:1;pointer-events:auto}
    .ctl .seekwrap{position:relative}
    .ctl .seek{display:block;width:100%;margin:0;accent-color:#fff;cursor:pointer}
    .ctl .tip{position:absolute;bottom:100%;margin-bottom:4px;transform:translateX(-50%);
      padding:2px 6px;border-radius:4px;background:rgba(0,0,0,.8);color:#fff;
      font:12px/1.2 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;
      pointer-events:none}
    .ctl .row{display:flex;align-items:center;gap:2px}
    .ctl .spacer{flex:1}
    .ctl button{background:transparent;color:#fff;font:13px/1 system-ui,sans-serif;border:0;
      border-radius:4px;padding:4px 6px;margin:0;min-width:28px;cursor:pointer;
      font-variant-numeric:tabular-nums}
    .ctl button:hover,.ctl .time:hover{background:rgba(255,255,255,.15)}
    .ctl button.off{opacity:.5}
    .ctl .time{margin-left:6px;padding:4px;border-radius:4px;color:#fff;cursor:text;
      font:13px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}
    .ctl .timein{width:9ch;margin-left:6px;padding:3px 4px;border:1px solid rgba(255,255,255,.5);
      border-radius:4px;background:rgba(0,0,0,.6);color:#fff;outline:none;
      font:13px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}
    .ctl .timein.bad{border-color:#f87171;animation:pipsub-shake .3s}
    @keyframes pipsub-shake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
    .ctl .vol{width:72px;margin:0 0 0 4px;accent-color:#fff;cursor:pointer}
    body.ctl-on .sub{bottom:max(7%,calc(var(--ctlh,64px) + 8px))}`;

  // Players such as YouTube rewrite the video's inline px box on every new video; the
  // !important rules in DOC_CSS win over that, this attribute only covers the first paint.
  const VIDEO_PIP_STYLE =
    'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;margin:0;padding:0;' +
    'border:0;max-width:none;max-height:none;transform:none;background:#000';

  function formatOffset(o) {
    const sign = o > 0 ? '+' : o < 0 ? '−' : '';
    return sign + Math.abs(o).toFixed(1).replace('.', ',') + ' s';
  }

  function buildDocUi(pipWin, video, source, sess) {
    const doc = pipWin.document;
    const make = (tag, cls, text) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    const style = make('style');
    style.textContent = DOC_CSS;
    (doc.head || doc.documentElement).append(style);

    const sub = make('div', 'sub');
    const span = make('span');
    sub.append(span);
    sub.hidden = true;

    const input = make('input');
    input.type = 'file';
    input.accept = '.srt,.vtt';
    input.hidden = true;

    const bar = make('div', 'bar');
    const button = (label, title, fn) => {
      const b = make('button', null, label);
      b.type = 'button';
      b.title = title;
      b.tabIndex = -1;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
        b.blur();
      });
      return b;
    };
    const setScale = (v) => { settings.fontScale = clampScale(v); saveSettings(); sync(); };
    const bSmaller = button('A−', COPY.smaller, () => setScale(settings.fontScale - 0.1));
    const bBigger = button('A+', COPY.bigger, () => setScale(settings.fontScale + 0.1));
    const bCC = button('CC', COPY.cc, () => {
      settings.ccOn = !settings.ccOn;
      saveSettings();
      sync();
      if (settings.ccOn) scheduleCaptionsOn(sess);
    });
    const bFile = button('.srt', COPY.loadFile, () => input.click());
    const bBack = button('−0.5s', COPY.back, () => { source.shiftOffset(-0.5); sync(); });
    const lbl = make('span', 'lbl');
    const bFwd = button('+0.5s', COPY.fwd, () => { source.shiftOffset(0.5); sync(); });
    const bUnload = button('✕', COPY.unload, () => { source.clearExternal(); sync(); });
    bar.append(bSmaller, bBigger, bCC, bFile, bBack, lbl, bFwd, bUnload);

    // ---- Bottom mini player: seek bar on top; play, −15, +15, time · spacer · Vol, volume.
    // Listeners on the video are removed in destroy(): it goes back to the page on close.
    const ctl = make('div', 'ctl');
    const seekWrap = make('div', 'seekwrap');
    const seekRange = make('input', 'seek');
    seekRange.type = 'range';
    seekRange.min = '0';
    seekRange.step = 'any';
    seekRange.tabIndex = -1;
    seekRange.setAttribute('aria-label', COPY.seekBar);
    const tip = make('div', 'tip');
    tip.hidden = true;
    seekWrap.append(seekRange, tip);
    let dragging = false;
    seekRange.addEventListener('pointerdown', () => { dragging = true; });
    // Scrub with fastSeek while dragging; land exactly on change.
    seekRange.addEventListener('input', () => seekVideo(video, Number(seekRange.value), dragging));
    seekRange.addEventListener('change', () => {
      dragging = false;
      seekVideo(video, Number(seekRange.value));
      seekRange.blur();
    });
    seekRange.addEventListener('click', (e) => e.stopPropagation());
    seekRange.addEventListener('pointermove', (e) => {
      if (!seekable(video)) return;
      const r = seekRange.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)));
      tip.textContent = formatTime(ratio * video.duration, video.duration >= 3600);
      tip.style.left = (ratio * 100) + '%';
      tip.hidden = false;
    });
    seekRange.addEventListener('pointerleave', () => { tip.hidden = true; });

    const row = make('div', 'row');
    const bPlay = button('▶', COPY.playPause, () => togglePlay(video));
    const bBack15 = button('−15', COPY.back15, () => seekBy(video, -SEEK_STEP));
    const bFwd15 = button('+15', COPY.fwd15, () => seekBy(video, SEEK_STEP));
    const timeEl = make('span', 'time');
    timeEl.title = COPY.jumpTo;
    timeEl.setAttribute('role', 'button');
    const timeIn = make('input', 'timein');
    timeIn.type = 'text';
    timeIn.hidden = true;
    timeIn.setAttribute('aria-label', COPY.jumpTo);
    const spacer = make('span', 'spacer');
    const bVol = button('Vol', COPY.mute, () => {
      if (video.muted || video.volume === 0) applyVolume(video, video.volume || 0.5);
      else video.muted = true;
    });
    const volRange = make('input', 'vol');
    volRange.type = 'range';
    volRange.min = '0';
    volRange.max = '100';
    volRange.step = '5';
    volRange.title = COPY.volume;
    volRange.tabIndex = -1;
    volRange.setAttribute('aria-label', COPY.volume);
    volRange.addEventListener('input', () => applyVolume(video, Number(volRange.value) / 100));
    volRange.addEventListener('change', () => volRange.blur());
    volRange.addEventListener('click', (e) => e.stopPropagation());
    row.append(bPlay, bBack15, bFwd15, timeEl, timeIn, spacer, bVol, volRange);
    ctl.append(seekWrap, row);

    // Click the time to type one: Enter jumps, Esc or blur cancels, invalid input shakes.
    const closeTimeInput = () => {
      if (timeIn.hidden) return;
      timeIn.hidden = true;
      timeIn.classList.remove('bad');
      timeEl.hidden = false;
      scheduleCtlHide();
    };
    timeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      timeIn.value = formatTime(video.currentTime, seekable(video) && video.duration >= 3600);
      timeEl.hidden = true;
      timeIn.hidden = false;
      timeIn.focus();
      timeIn.select();
    });
    timeIn.addEventListener('click', (e) => e.stopPropagation());
    timeIn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeTimeInput(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const sec = parseTimeInput(timeIn.value);
      if (!Number.isFinite(sec) || (seekable(video) && sec > video.duration)) {
        timeIn.classList.remove('bad');
        void timeIn.offsetWidth; // restart the shake animation
        timeIn.classList.add('bad');
        return;
      }
      seekVideo(video, sec);
      closeTimeInput();
    });
    timeIn.addEventListener('blur', closeTimeInput);

    const syncVolume = () => {
      const silent = video.muted || video.volume === 0;
      bVol.classList.toggle('off', silent);
      volRange.value = String(silent ? 0 : Math.round(video.volume * 100));
    };
    video.addEventListener('volumechange', syncVolume);
    syncVolume();

    const syncTimeline = () => {
      bPlay.textContent = video.paused ? '▶' : '❚❚';
      timeEl.textContent = timeLabel(video);
      const ok = seekable(video);
      seekWrap.hidden = !ok;
      if (ok) {
        seekRange.max = String(video.duration);
        if (!dragging) seekRange.value = String(Math.min(video.duration, video.currentTime));
      }
    };
    const TIMELINE_EVENTS = ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked', 'play', 'pause'];
    for (const ev of TIMELINE_EVENTS) video.addEventListener(ev, syncTimeline);
    syncTimeline();

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const cues = parseSubtitles(await readSubtitleFile(file));
        if (cues.length) { source.setExternal(cues); sync(); }
      } catch (err) {
        console.warn('[PiP Subtitle]', err);
      }
    });

    doc.body.append(sub, ctl, bar, input);

    function render(text) {
      span.textContent = text || '';
      sub.hidden = !text || !settings.ccOn;
    }

    function sync() {
      doc.documentElement.style.setProperty('--scale', String(settings.fontScale));
      bCC.classList.toggle('off', !settings.ccOn);
      const ext = source.hasExternal();
      for (const n of [bBack, lbl, bFwd, bUnload]) n.hidden = !ext;
      lbl.textContent = formatOffset(source.offset);
      source.refresh();
      render(source.text);
    }

    // Toolbar: shows on mousemove, hides after 2 s idle. Mini player: hides after 2.5 s idle
    // unless paused, hovered, or the time input has focus. Subtitles move up while it shows.
    let barTimer = 0;
    let ctlTimer = 0;
    let overCtl = false;
    const ctlPinned = () => video.paused || overCtl || doc.activeElement === timeIn;
    const setCtl = (on) => {
      ctl.classList.toggle('show', on);
      doc.body.classList.toggle('ctl-on', on);
      if (on) doc.documentElement.style.setProperty('--ctlh', ctl.offsetHeight + 'px');
    };
    function scheduleCtlHide() {
      clearTimeout(ctlTimer);
      ctlTimer = setTimeout(() => { if (!ctlPinned()) setCtl(false); }, 2500);
    }
    const showControls = () => {
      bar.classList.add('show');
      clearTimeout(barTimer);
      barTimer = setTimeout(() => bar.classList.remove('show'), 2000);
      setCtl(true);
      scheduleCtlHide();
    };
    doc.addEventListener('mousemove', showControls);
    ctl.addEventListener('mouseenter', () => { overCtl = true; });
    ctl.addEventListener('mouseleave', () => { overCtl = false; scheduleCtlHide(); });
    const onPlayState = () => { if (video.paused) setCtl(true); else showControls(); };
    video.addEventListener('play', onPlayState);
    video.addEventListener('pause', onPlayState);
    if (video.paused) setCtl(true);

    doc.body.addEventListener('click', (e) => {
      if (bar.contains(e.target) || ctl.contains(e.target) || e.target === input) return;
      togglePlay(video);
    });

    pipWin.addEventListener('keydown', (e) => {
      if (e.target === timeIn) return; // typing a time: Enter/Esc belong to the input
      const altP = e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyP';
      if (altP || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        sess.close();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(video); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(video, -5); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(video, 5); }
      else if (e.code === 'KeyJ') { e.preventDefault(); seekBy(video, -SEEK_STEP); }
      else if (e.code === 'KeyL') { e.preventDefault(); seekBy(video, SEEK_STEP); }
      else if (e.code === 'KeyK') { e.preventDefault(); togglePlay(video); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cur = video.muted ? 0 : video.volume;
        applyVolume(video, cur + (e.key === 'ArrowUp' ? 0.1 : -0.1));
      }
    }, true);

    settingsListeners.add(sync);
    sync();
    return {
      render,
      destroy() {
        clearTimeout(barTimer);
        clearTimeout(ctlTimer);
        settingsListeners.delete(sync);
        video.removeEventListener('volumechange', syncVolume);
        for (const ev of TIMELINE_EVENTS) video.removeEventListener(ev, syncTimeline);
        video.removeEventListener('play', onPlayState);
        video.removeEventListener('pause', onPlayState);
      },
    };
  }

  async function openDocPip(video) {
    const aspect = video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoWidth / video.videoHeight
      : 16 / 9;
    const width = 480;
    const height = Math.min(480, Math.max(200, Math.round(width / aspect)));

    let pipWin;
    try {
      pipWin = await window.documentPictureInPicture.requestWindow({ width, height });
    } catch (err) {
      if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        handleOpenError(err);
        return;
      }
      // API present but unusable (e.g. embedded browsers: "no window"): use Mode B from now on.
      console.warn('[PiP Subtitle]', err);
      docPipBroken = true;
      return openCanvasPip(video, openNativePip);
    }
    if (!video.isConnected || !video.parentNode) { pipWin.close(); return; }

    const doc = pipWin.document;
    // Chrome's bar always shows the origin; the title shows in the taskbar / Alt+Tab.
    try { doc.title = document.title; } catch (_) { /* no title */ }
    const placeholder = document.createComment('pipsub-placeholder');
    video.parentNode.insertBefore(placeholder, video.nextSibling);
    const origStyle = video.getAttribute('style');
    const origControls = video.controls;
    const wasPlaying = !video.paused;

    let ui = null;
    // Resolved while the video is still in place; later searches start from the placeholder.
    const source = createSubtitleSource(video, {
      getAnchor: () => (placeholder.isConnected ? placeholder.parentNode : null),
      avoid: () => [video, placeholder],
      includeShowing: false,
      onChange: (t) => { if (ui) ui.render(t); },
    });

    let closed = false;
    let watch = 0;
    const sess = { kind: 'doc', video, source, close: () => { restore(); try { pipWin.close(); } catch (_) {} } };

    function restore() {
      if (closed) return;
      closed = true;
      clearInterval(watch);
      source.destroy();
      if (ui) ui.destroy();
      const inPip = video.ownerDocument === doc && doc.contains(video);
      if (inPip && placeholder.isConnected) {
        const playing = !video.paused;
        placeholder.parentNode.insertBefore(video, placeholder);
        if (origStyle === null) video.removeAttribute('style');
        else video.setAttribute('style', origStyle);
        video.controls = origControls;
        if (playing) video.play().catch(() => {});
      } else if (inPip) {
        // Player re-rendered or page navigated: the old slot is gone.
        try { video.pause(); } catch (_) {}
        video.remove();
      }
      placeholder.remove();
      if (session === sess) session = null;
    }

    session = sess;
    pipWin.addEventListener('pagehide', restore, { once: true });

    video.setAttribute('style', VIDEO_PIP_STYLE);
    video.controls = false;
    doc.body.append(video);
    if (wasPlaying) video.play().catch(() => {});

    ui = buildDocUi(pipWin, video, source, sess);
    source.refresh();
    ui.render(source.text);
    scheduleCaptionsOn(sess);

    watch = setInterval(() => {
      if (!placeholder.isConnected || !doc.contains(video)) { sess.close(); return; }
      // SPA players (YouTube autoplay) change the page title per video.
      if (doc.title !== document.title) doc.title = document.title;
    }, 500);
  }

  // ==== Mode B — canvas + proxy video PiP ====

  function wrapLines(ctx, text, maxWidth) {
    const out = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (cur && ctx.measureText(test).width > maxWidth) { out.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) out.push(cur);
    }
    return out;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // bottomInset: px kept free above the bottom edge (progress bar + time label when shown).
  function drawSubtitle(ctx, text, W, H, bottomInset = 0) {
    const size = Math.max(8, Math.round(H * 0.055 * settings.fontScale));
    ctx.save();
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapLines(ctx, text, W * 0.9);
    const lineH = Math.round(size * 1.3);
    const padX = size * 0.45;
    let y = Math.min(H * 0.93, H - bottomInset) - lines.length * lineH;
    for (const line of lines) {
      const bw = ctx.measureText(line).width + padX * 2;
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      roundRectPath(ctx, (W - bw) / 2, y, bw, lineH, Math.max(2, size * 0.15));
      ctx.fill();
      ctx.shadowColor = '#000';
      ctx.shadowBlur = Math.max(2, size * 0.12);
      ctx.fillStyle = '#fff';
      ctx.fillText(line, W / 2, y + lineH / 2);
      y += lineH;
    }
    ctx.restore();
  }

  // ==== Timeline (time label, progress bar, media session seeking) ====

  const SEEK_STEP = 15;
  const seekable = (v) => Number.isFinite(v.duration) && v.duration > 0;

  // "1:02:03", "12:30" or "90" (seconds) → seconds; NaN when invalid.
  function parseTimeInput(str) {
    const t = String(str).trim();
    if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return NaN;
    const parts = t.split(':').map(Number);
    if (parts.length > 1 && parts.slice(1).some((n) => n >= 60)) return NaN;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  // "m:ss", or "h:mm:ss" when the video is an hour or longer.
  function formatTime(sec, longForm) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return longForm ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${h * 60 + m}:${ss}`;
  }

  function timeLabel(v) {
    if (!seekable(v)) return formatTime(v.currentTime, false);
    const long = v.duration >= 3600;
    return `${formatTime(Math.min(v.currentTime, v.duration), long)} / ${formatTime(v.duration, long)}`;
  }

  function seekVideo(v, t, fast) {
    let x = Math.max(0, Number(t) || 0);
    if (Number.isFinite(v.duration)) x = Math.min(v.duration, x);
    try {
      if (fast && typeof v.fastSeek === 'function') v.fastSeek(x);
      else v.currentTime = x;
    } catch (_) { /* not seekable */ }
  }

  // Bersih windows show a MediaStream, which Chrome treats as live (no timeline, no seeking).
  // The page's media session gives its PiP controls the original's position and seek actions.
  // Only seek actions are registered; play/pause and previous/next stay the page's own.
  function attachTimeline(video) {
    const ms = navigator.mediaSession;
    let positionSet = false;
    const actions = {
      // Always 15 s (one step size everywhere), whatever seekOffset Chrome suggests.
      seekbackward: () => seekVideo(video, video.currentTime - SEEK_STEP),
      seekforward: () => seekVideo(video, video.currentTime + SEEK_STEP),
      seekto: (d) => { if (d && Number.isFinite(d.seekTime)) seekVideo(video, d.seekTime, !!d.fastSeek); },
    };
    const registered = [];
    const updatePosition = () => {
      if (!ms || typeof ms.setPositionState !== 'function' || !seekable(video)) return;
      try {
        ms.setPositionState({
          duration: video.duration,
          position: Math.min(video.duration, Math.max(0, video.currentTime)),
          playbackRate: video.playbackRate || 1,
        });
        positionSet = true;
      } catch (_) { /* invalid state mid-load */ }
    };
    const EVENTS = ['timeupdate', 'ratechange', 'durationchange', 'seeked', 'loadedmetadata'];
    for (const e of EVENTS) video.addEventListener(e, updatePosition);
    if (ms) {
      for (const [k, fn] of Object.entries(actions)) {
        try { ms.setActionHandler(k, fn); registered.push(k); } catch (_) { /* unsupported */ }
      }
    }
    updatePosition();
    return {
      actions,
      detach() {
        for (const e of EVENTS) video.removeEventListener(e, updatePosition);
        for (const k of registered) { try { ms.setActionHandler(k, null); } catch (_) {} }
        if (positionSet) { try { ms.setPositionState(); } catch (_) {} }
      },
    };
  }

  // Bottom progress bar + time label on the canvas; returns the height it takes (0 = hidden).
  function drawTimeline(ctx, video, W, H) {
    if (!seekable(video)) return 0;
    const area = Math.max(6, Math.round(H * 0.04));
    const lineH = Math.max(2, Math.round(H / 120));
    const marginX = Math.round(W * 0.03);
    const trackW = W - marginX * 2;
    const lineY = H - Math.round(area / 2) - Math.round(lineH / 2);
    const ratio = Math.min(1, Math.max(0, video.currentTime / video.duration));
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(marginX, lineY, trackW, lineH);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(marginX, lineY, Math.round(trackW * ratio), lineH);
    const size = Math.max(8, Math.round(H * 0.04));
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = Math.max(2, size * 0.12);
    ctx.fillStyle = '#fff';
    ctx.fillText(timeLabel(video), marginX, H - area);
    ctx.restore();
    return area + Math.round(size * 1.4);
  }

  function canvasSizeFor(vw, vh) {
    const w = vw || 640;
    const h = vh || 360;
    const W = Math.min(w, 1280);
    return [W, Math.max(2, Math.round((h * W) / w))];
  }

  function startCanvas(video) {
    let [W, H] = canvasSizeFor(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Next video or quality switch: follow the new intrinsic size, because the native PiP
    // window locks to the stream's aspect ratio and would otherwise letterbox.
    let srcW = video.videoWidth;
    let srcH = video.videoHeight;
    const fitToVideo = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh || (vw === srcW && vh === srcH)) return;
      srcW = vw;
      srcH = vh;
      [W, H] = canvasSizeFor(vw, vh);
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
    };
    video.addEventListener('resize', fitToVideo);
    const source = createSubtitleSource(video, {
      getAnchor: () => video.parentNode,
      avoid: () => [video],
      includeShowing: true,
    });
    source.refresh();

    // Timeline shows while paused and for 2.5 s after a seek or play/pause; hidden otherwise.
    let activityAt = performance.now();
    const ACTIVITY = ['seeking', 'seeked', 'play', 'pause'];
    const onActivity = () => { activityAt = performance.now(); };
    for (const e of ACTIVITY) video.addEventListener(e, onActivity);

    const draw = () => {
      fitToVideo();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const s = Math.min(W / video.videoWidth, H / video.videoHeight);
        const dw = video.videoWidth * s;
        const dh = video.videoHeight * s;
        ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      const showTimeline = video.paused || performance.now() - activityAt < 2500;
      const inset = showTimeline ? drawTimeline(ctx, video, W, H) : 0;
      if (settings.ccOn && source.text) drawSubtitle(ctx, source.text, W, H, inset);
    };

    let running = true;
    let timer = 0;
    // setTimeout, not rAF: rAF stops in background tabs.
    const loop = () => {
      if (!running) return;
      try { draw(); } catch (_) { /* transient decode state */ }
      timer = setTimeout(loop, 33);
    };
    draw();
    timer = setTimeout(loop, 33);

    return {
      canvas,
      source,
      stop() {
        running = false;
        clearTimeout(timer);
        video.removeEventListener('resize', fitToVideo);
        for (const e of ACTIVITY) video.removeEventListener(e, onActivity);
        source.destroy();
      },
    };
  }

  function looksCrossOrigin(video) {
    const src = video.currentSrc || video.src || '';
    if (!/^https?:/i.test(src) || video.crossOrigin != null) return false;
    try { return new URL(src, location.href).origin !== location.origin; } catch (_) { return false; }
  }

  async function openNativePip(video) {
    let ended = false;
    const sess = {
      kind: 'native',
      video,
      close: () => {
        if (document.pictureInPictureElement === video) document.exitPictureInPicture().catch(() => {});
        end();
      },
    };
    let timeline = null;
    function end() {
      if (ended) return;
      ended = true;
      if (timeline) timeline.detach();
      video.removeEventListener('leavepictureinpicture', end);
      if (session === sess) session = null;
    }
    session = sess;
    try {
      await video.requestPictureInPicture();
    } catch (err) {
      end();
      handleOpenError(err);
      return;
    }
    video.addEventListener('leavepictureinpicture', end);
    timeline = attachTimeline(video);
    sess.seekActions = timeline.actions;
    toast(COPY.crossOrigin);
    scheduleCaptionsOn(sess);
  }

  // onUnreadable: where to go when the canvas cannot read the video (still within activation).
  async function openCanvasPip(video, onUnreadable = openNativePip) {
    if (looksCrossOrigin(video)) return onUnreadable(video);
    const r = startCanvas(video);
    let stream;
    try {
      stream = r.canvas.captureStream(30);
    } catch (err) {
      r.stop();
      if (err && err.name === 'SecurityError') return onUnreadable(video);
      throw err;
    }

    const proxy = document.createElement('video');
    proxy.setAttribute('data-pipsub', '');
    proxy.muted = true;
    proxy.playsInline = true;
    proxy.style.cssText =
      'position:fixed!important;left:0!important;top:0!important;width:1px!important;' +
      'height:1px!important;opacity:0!important;pointer-events:none!important;';
    proxy.srcObject = stream;
    (document.body || document.documentElement).appendChild(proxy);

    // A paused MediaStream video freezes on its last frame, so the proxy is paused a moment
    // after the original (the canvas has drawn the paused frame with the timeline by then),
    // and briefly replayed after a seek while paused. selfSync: proxy events we caused.
    let selfSync = false;
    let pauseTimer = 0;
    const pauseProxySoon = () => {
      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => {
        if (video.paused && !proxy.paused) { selfSync = true; proxy.pause(); selfSync = false; }
      }, 150);
    };
    const onOrigPlay = () => { clearTimeout(pauseTimer); proxy.play().catch(() => {}); };
    const onOrigPause = () => pauseProxySoon();
    const onOrigSeeked = () => {
      if (!video.paused || !proxy.paused) return;
      selfSync = true;
      proxy.play().catch(() => {}).finally(() => { selfSync = false; pauseProxySoon(); });
    };
    const onProxyPlay = () => { if (!selfSync && video.paused) video.play().catch(() => {}); };
    const onProxyPause = () => {
      if (!selfSync && document.pictureInPictureElement === proxy && !video.paused) {
        markUserPause();
        video.pause();
      }
    };
    // Chrome's PiP speaker button acts on the proxy (which has no audio): mirror it to the
    // original, and the original's mute/volume back to the proxy. Compare-and-set ends loops.
    const onProxyVolume = () => {
      if (video.muted !== proxy.muted) video.muted = proxy.muted;
      if (Math.abs(video.volume - proxy.volume) > 0.001) video.volume = proxy.volume;
    };
    const onOrigVolume = () => {
      if (proxy.muted !== video.muted) proxy.muted = video.muted;
      if (Math.abs(proxy.volume - video.volume) > 0.001) proxy.volume = video.volume;
    };
    // play/pause stay with the page's own handlers (overriding them broke media keys after
    // close); the proxy's play/pause events already sync to the original.
    let timeline = null;

    let done = false;
    let watch = 0;
    function cleanup() {
      if (done) return;
      done = true;
      clearInterval(watch);
      clearTimeout(pauseTimer);
      r.stop();
      if (timeline) timeline.detach();
      video.removeEventListener('play', onOrigPlay);
      video.removeEventListener('pause', onOrigPause);
      video.removeEventListener('seeked', onOrigSeeked);
      video.removeEventListener('volumechange', onOrigVolume);
      proxy.removeEventListener('volumechange', onProxyVolume);
      proxy.removeEventListener('play', onProxyPlay);
      proxy.removeEventListener('pause', onProxyPause);
      proxy.removeEventListener('leavepictureinpicture', cleanup);
      for (const t of stream.getTracks()) t.stop();
      proxy.srcObject = null;
      proxy.remove();
      if (session === sess) session = null;
    }
    const sess = {
      kind: 'canvas',
      video,
      source: r.source,
      close: () => {
        if (document.pictureInPictureElement === proxy) document.exitPictureInPicture().catch(() => {});
        cleanup();
      },
    };
    session = sess;

    try {
      await proxy.play();
      if (proxy.readyState < 1) await waitEvent(proxy, 'loadedmetadata', 1000);
      if (done) return;
      await proxy.requestPictureInPicture();
    } catch (err) {
      const wasClosed = done;
      cleanup();
      if (!wasClosed) handleOpenError(err);
      return;
    }
    if (done) { if (document.pictureInPictureElement === proxy) document.exitPictureInPicture().catch(() => {}); return; }

    if (video.paused) pauseProxySoon();
    video.addEventListener('play', onOrigPlay);
    video.addEventListener('pause', onOrigPause);
    video.addEventListener('seeked', onOrigSeeked);
    // The proxy starts muted (autoplay-safe) and takes the original's state once in PiP.
    onOrigVolume();
    video.addEventListener('volumechange', onOrigVolume);
    proxy.addEventListener('volumechange', onProxyVolume);
    proxy.addEventListener('play', onProxyPlay);
    proxy.addEventListener('pause', onProxyPause);
    proxy.addEventListener('leavepictureinpicture', cleanup);
    timeline = attachTimeline(video);
    sess.seekActions = timeline.actions;
    watch = setInterval(() => { if (!video.isConnected) sess.close(); }, 500);
    scheduleCaptionsOn(sess);
  }

  // ==== Triggers ====

  window.addEventListener('keydown', (e) => {
    if (!(e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyP')) return;
    if (isEditableEvent(e)) return;
    // Without a candidate video, leave the key to the page and other frames.
    if (!session && !pickVideo()) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    toggle();
  }, true);

  window.addEventListener('pagehide', () => { if (session) session.close(); });

  // Auto PiP: Chrome calls this media session action when the user leaves a tab that is playing
  // (only for sites with enough media engagement). Top frame only; checked every 2 s.
  let autoPipOn = false;
  function onAutoPip() {
    if (session || opening) return;
    const pick = pickVideo();
    if (!pick) return;
    const v = pick.video;
    // The site may already have paused it in reaction to the tab switch: that still counts as
    // playing, and it is resumed.
    const hidePaused = v.paused && lastPause.video === v && pausedByHide(v, lastPause.at);
    if (v.paused && !hidePaused) return;
    opening = true;
    if (hidePaused) {
      resumedForHide = hiddenAt;
      v.play().catch(() => {});
    }
    // Called synchronously: the permission Chrome grants lasts only while this handler runs.
    let p;
    try { p = openPip(v); } catch (err) { p = Promise.reject(err); }
    p.catch((err) => console.warn('[PiP Subtitle]', err)).finally(() => { opening = false; });
  }
  function syncAutoPip() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const want = settings.autoPip && (!!session || !!pickVideo());
    if (want === autoPipOn) return;
    try {
      ms.setActionHandler('enterpictureinpicture', want ? onAutoPip : null);
      autoPipOn = want;
    } catch (_) { /* action unsupported in this Chrome */ }
  }
  if (window === window.top) {
    settingsListeners.add(syncAutoPip);
    setInterval(syncAutoPip, 2000);
    syncAutoPip();
  }

  if (extAlive() && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg || msg.type !== 'pipsub:toggle') return;
        toggle();
        try { sendResponse({ ok: true }); } catch (_) { /* port closed */ }
      });
    } catch (_) { /* extension context gone */ }
  }

  // ==== Exposed hooks (popup frame picking + testing) ====

  window.__pipSubScore = () => {
    // An open session must win so the popup's button reaches this frame to close it.
    if (session && session.kind !== 'debug') return Number.MAX_SAFE_INTEGER;
    const pick = pickVideo();
    return pick ? pick.score : 0;
  };

  function debugSource() {
    if (session && session.source) return session.source.compute();
    const pick = pickVideo();
    if (!pick) return '';
    const src = createSubtitleSource(pick.video, {
      getAnchor: () => pick.video.parentNode,
      avoid: () => [pick.video],
      includeShowing: false,
    });
    try { return src.compute(); } finally { src.destroy(); }
  }

  function debugCanvas() {
    if (session) session.close();
    const pick = pickVideo();
    if (!pick) return null;
    const r = startCanvas(pick.video);
    const sess = {
      kind: 'debug',
      video: pick.video,
      source: r.source,
      close: () => { r.stop(); if (session === sess) session = null; },
    };
    session = sess;
    return r.canvas;
  }

  function stop() {
    hideToast();
    if (session) session.close();
  }

  // Volume for the popup: the session video if one is open, else the best video in this frame.
  function volumeTarget() {
    if (session && session.kind !== 'debug') return session.video;
    const pick = pickVideo();
    return pick ? pick.video : null;
  }

  function getVolume() {
    const v = volumeTarget();
    return v ? { volume: v.volume, muted: v.muted } : null;
  }

  function setVolume(x) {
    const v = volumeTarget();
    if (!v) return null;
    applyVolume(v, x);
    return { volume: v.volume, muted: v.muted };
  }

  // Calls the media session seek handler the open session registered (tests cannot reach
  // Chrome's PiP buttons). Returns false when there is none.
  function debugSeek(action, details) {
    const fn = session && session.seekActions && session.seekActions[action];
    if (!fn) return false;
    fn(details || {});
    return true;
  }

  window.__pipSub = { toggle, debugSource, debugCanvas, stop, getVolume, setVolume, debugSeek };
})();
