// v1.3 timeline: seeking in both modes on a seekable 60 s clip (test/modeb/seek.html).
// Starts the fixture server (test/lib/env.cjs) itself.
// Bersih: media session seek handlers (via __pipSub.debugSeek, the same functions registered
// with navigator.mediaSession) and the canvas progress bar while paused.
// Lengkap: the bottom seek bar in the Document PiP window and the J/K/L keys.
const { puppeteer, chromePath, EXT_DIR, PROFILE_DIR, startFixtureServer } = require('./lib/env.cjs');
const path = require('path');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const results = {};

// Bright pixels in the bottom 4 % of the proxy's current frame (where the progress bar sits).
const BOTTOM_BRIGHT = `(() => {
  const p = document.querySelector('video[data-pipsub]');
  if (!p || !p.videoWidth) return null;
  const c = document.createElement('canvas'); c.width = p.videoWidth; c.height = p.videoHeight;
  const g = c.getContext('2d'); g.drawImage(p, 0, 0);
  const y0 = Math.floor(c.height * 0.96);
  const d = g.getImageData(0, y0, c.width, c.height - y0).data;
  let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 200 && d[k + 1] > 200 && d[k + 2] > 200) n++;
  return { n, size: [c.width, c.height], shot: c.toDataURL('image/png') };
})()`;

async function altP(page) {
  await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
}

(async () => {
  // Fixture pages on 127.0.0.1 and localhost (two origins); reuses one already running.
  const server = await startFixtureServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: false, pipe: true, enableExtensions: true,
    userDataDir: PROFILE_DIR,
    defaultViewport: { width: 1280, height: 760 },
    args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,860'],
  });
  let failed = false;
  try {
    const extId = await browser.installExtension(EXT_DIR);
    // Writes settings the way the popup does (merged into the stored object).
    const setPref = async (patch) => {
      const p = await browser.newPage();
      await p.goto(`chrome-extension://${extId}/popup.html`);
      await p.evaluate((m) => new Promise((res) => chrome.storage.local.get('pipsub', (r) => {
        chrome.storage.local.set({ pipsub: { ...((r && r.pipsub) || {}), ...m } }, res);
      })), patch);
      await p.close();
    };
    const setMode = (mode) => setPref({ mode });

    const page = (await browser.pages())[0];
    page.on('console', (m) => { if (/PiP Subtitle/.test(m.text())) log('console', m.text().slice(0, 200)); });
    const cdp = await page.createCDPSession();
    const ctxs = [];
    cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
    await cdp.send('Runtime.enable');
    const iso = async (expr) => {
      const c = ctxs.filter((x) => x.name === 'PiP Subtitle').pop();
      const r = await cdp.send('Runtime.evaluate', { contextId: c.id, expression: expr, returnByValue: true, awaitPromise: true });
      return r.result.value;
    };
    const t = () => page.evaluate(() => {
      const w = window.documentPictureInPicture && documentPictureInPicture.window;
      const v = document.getElementById('v') || (w && w.document.querySelector('video'));
      return +v.currentTime.toFixed(2);
    });
    const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

    // ---- Bersih
    await setMode('clean');
    await page.goto('http://127.0.0.1:8766/seek.html', { waitUntil: 'load' });
    await page.bringToFront();
    await page.waitForFunction(() => { const v = document.getElementById('v'); return v.readyState >= 2 && !v.paused && v.currentTime > 1; }, { timeout: 15000 });
    await page.mouse.click(1100, 650);
    await sleep(300);
    await altP(page);
    await sleep(2000);
    results.cleanOpened = await page.evaluate(() => { const p = document.querySelector('video[data-pipsub]'); return !!p && document.pictureInPictureElement === p; });

    let t0 = await t();
    await iso("window.__pipSub.debugSeek('seekforward', {})");
    await sleep(600);
    let t1 = await t();
    results.seekforward15 = near(t1, t0 + 15.6);
    await iso("window.__pipSub.debugSeek('seekto', { seekTime: 30 })");
    await sleep(300);
    t1 = await t();
    await iso("window.__pipSub.debugSeek('seekbackward', { seekOffset: 5 })");
    await sleep(600);
    const t2 = await t();
    // seekOffset is ignored: always 15 s.
    results.seekbackward15 = near(t2, t1 - 15 + 0.6);
    await iso("window.__pipSub.debugSeek('seekto', { seekTime: 3 })");
    await sleep(600);
    const t3 = await t();
    results.seekto = near(t3, 3.6);
    log('bersih seeks', JSON.stringify({ t0, t1, t2, t3 }));

    // Progress bar: hidden while playing (after the 2.5 s activity window), shown while paused.
    await iso("window.__pipSub.debugSeek('seekto', { seekTime: 40 })");
    await sleep(3500);
    const playing = await page.evaluate(BOTTOM_BRIGHT);
    await page.evaluate(() => document.getElementById('v').pause());
    await sleep(800);
    const paused = await page.evaluate(BOTTOM_BRIGHT);
    results.progressBarWhilePaused = !!(playing && paused) && paused.n > playing.n + paused.size[0] * 0.3;
    log('bottom 4% bright px', JSON.stringify({ playing: playing && playing.n, paused: paused && paused.n, size: paused && paused.size }));
    if (paused) fs.writeFileSync(path.join(__dirname, 'v13-clean-paused.png'), Buffer.from(paused.shot.split(',')[1], 'base64'));
    // Seek while paused: the frozen proxy is refreshed so the bar/time move.
    await iso("window.__pipSub.debugSeek('seekto', { seekTime: 20 })");
    await sleep(800);
    const pausedSeek = await page.evaluate(BOTTOM_BRIGHT);
    results.pausedSeekRefreshes = !!pausedSeek && pausedSeek.n < paused.n && pausedSeek.n > playing.n;
    log('after seek to 20 while paused', pausedSeek && pausedSeek.n);
    await page.evaluate(() => document.getElementById('v').play());
    await sleep(500);
    const mute = await page.evaluate(async () => {
      const p = document.querySelector('video[data-pipsub]');
      const v = document.getElementById('v');
      const wait = () => new Promise((r) => setTimeout(r, 200));
      const start = { orig: v.muted, proxy: p.muted };
      p.muted = false; await wait();
      const afterProxyUnmute = v.muted;
      v.muted = true; await wait();
      const proxyAfterOrigMute = p.muted;
      p.muted = false; await wait();
      return { start, afterProxyUnmute, proxyAfterOrigMute, proxyPlaying: !p.paused, origPlaying: !v.paused, inPip: document.pictureInPictureElement === p };
    });
    results.muteMirror = mute.start.proxy === mute.start.orig && mute.afterProxyUnmute === false && mute.proxyAfterOrigMute === true;
    results.unmutedProxyKeepsPlaying = mute.proxyPlaying && mute.origPlaying && mute.inPip;
    log('mute mirror', JSON.stringify(mute));
    await altP(page);
    await sleep(800);
    results.cleanClosed = await page.evaluate(() => !document.querySelector('video[data-pipsub]') && !document.pictureInPictureElement);

    // ---- Lengkap
    await setMode('full');
    await sleep(300);
    await page.mouse.click(1100, 650);
    await sleep(300);
    await altP(page);
    await sleep(1500);
    const doc = await page.evaluate(() => {
      const w = window.documentPictureInPicture && documentPictureInPicture.window;
      if (!w) return null;
      const seek = w.document.querySelector('.ctl .seek');
      const row = [...w.document.querySelectorAll('.ctl .row > *')].filter((n) => !n.hidden).map((n) => n.className === 'vol' ? 'range' : n.className === 'spacer' ? '|' : n.textContent);
      const top = [...w.document.querySelectorAll('.bar > *')].map((n) => n.textContent);
      return { hasSeek: !!seek, max: seek && Number(seek.max), row, top };
    });
    log('lengkap controls', JSON.stringify(doc));
    results.fullOpened = !!doc && doc.hasSeek && near(doc.max, 60, 0.5);
    results.miniPlayerLayout = !!doc && ['−15', '+15'].every((x, i) => doc.row[i + 1] === x) &&
      doc.row[4] === '|' && doc.row[5] === 'Vol' && doc.row[6] === 'range' && !doc.top.includes('Vol');

    // Language follows the setting live in the open window (titles, offset label, <html lang>).
    const titles = () => page.evaluate(() => {
      const d = documentPictureInPicture.window.document;
      return { lang: d.documentElement.lang, cc: d.querySelector('.bar button:nth-child(3)').title, play: d.querySelector('.ctl .row button').title, seek: d.querySelector('.ctl .seek').getAttribute('aria-label') };
    });
    await setPref({ lang: 'en' });
    await sleep(400);
    const tEn = await titles();
    await setPref({ lang: 'id' });
    await sleep(400);
    const tId = await titles();
    await setPref({ lang: 'auto' });
    await page.bringToFront();
    log('live language', JSON.stringify({ tEn, tId }));
    results.liveLanguage = tEn.lang === 'en' && tEn.play === 'Play/Pause (K)' && tEn.seek === 'Video position' &&
      tId.lang === 'id' && tId.play === 'Putar/jeda (K)' && tId.seek === 'Posisi video';
    await page.evaluate(() => {
      const w = documentPictureInPicture.window;
      const seek = w.document.querySelector('.ctl .seek');
      seek.value = '20';
      seek.dispatchEvent(new w.Event('input', { bubbles: true }));
      seek.dispatchEvent(new w.Event('change', { bubbles: true }));
    });
    await sleep(500);
    const s20 = await t();
    results.seekBar = near(s20, 20.5);
    const key = (code) => page.evaluate((c) => {
      const w = documentPictureInPicture.window;
      w.dispatchEvent(new w.KeyboardEvent('keydown', { code: c, key: c.slice(3).toLowerCase(), bubbles: true }));
    }, code);
    await key('KeyL'); await sleep(500);
    const sL = await t();
    await key('KeyJ'); await key('KeyJ'); await sleep(500);
    const sJ = await t();
    await key('KeyK'); await sleep(300);
    const pausedByK = await page.evaluate(() => documentPictureInPicture.window.document.querySelector('video').paused);
    const ctlShownPaused = await page.evaluate(() => documentPictureInPicture.window.document.querySelector('.ctl').classList.contains('show'));
    results.keysJKL15 = near(sL, s20 + 15.5) && near(sJ, sL - 30 + 0.5) && pausedByK;
    results.ctlStaysWhilePaused = ctlShownPaused;
    log('lengkap seeks', JSON.stringify({ s20, sL, sJ, pausedByK, ctlShownPaused }));

    // Time input: click the time, type, Enter. Invalid input shakes and does not jump.
    const typed = await page.evaluate(async () => {
      const w = documentPictureInPicture.window;
      const d = w.document;
      const v = d.querySelector('video');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const enter = (el) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      d.querySelector('.ctl .time').click();
      const inp = d.querySelector('.ctl .timein');
      const opened = !inp.hidden && d.activeElement === inp;
      const prefilled = inp.value;
      inp.value = 'abc'; enter(inp); await wait(100);
      const badShown = inp.classList.contains('bad') && !inp.hidden;
      const tBad = v.currentTime;
      inp.value = '0:45'; enter(inp); await wait(400);
      const t45 = v.currentTime;
      const closed = inp.hidden && !d.querySelector('.ctl .time').hidden;
      // Esc while typing cancels the input and must not close PiP.
      d.querySelector('.ctl .time').click();
      inp.value = '0:05';
      inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(200);
      const escCancelled = inp.hidden && !!documentPictureInPicture.window && Math.abs(v.currentTime - t45) < 1;
      // Hover tooltip over the seek bar.
      const seek = d.querySelector('.ctl .seek');
      const r = seek.getBoundingClientRect();
      seek.dispatchEvent(new w.PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + 2, bubbles: true }));
      const tip = d.querySelector('.ctl .tip');
      return { opened, prefilled, badShown, tBad: +tBad.toFixed(1), t45: +t45.toFixed(1), closed, escCancelled, tip: tip.hidden ? null : tip.textContent };
    });
    log('time input', JSON.stringify(typed));
    // Picture of the Lengkap window with the mini player showing (it stays while paused).
    try {
      const pipPage = (await browser.pages()).find((x) => x !== page && x.url() === 'about:blank');
      if (pipPage) {
        await pipPage.screenshot({ path: path.join(__dirname, 'v13-full-paused.png') });
        log('Lengkap window screenshot saved');
      }
    } catch (e) { log('screenshot skipped', e.message); }
    results.timeInput = typed.opened && typed.badShown && Math.abs(typed.t45 - 45) < 1 && typed.closed && typed.escCancelled && Math.abs(typed.tBad - typed.t45) > 5;
    results.hoverTip = typed.tip === '0:30';
    await altP(page);
    await sleep(800);
    await setMode('clean');
  } catch (e) {
    failed = true;
    log('ERROR', e.stack || e);
  } finally {
    await browser.close();
    await server.close();
  }
  const ok = !failed && Object.values(results).length > 0 && Object.values(results).every(Boolean);
  log(ok ? 'PASS' : 'FAIL', JSON.stringify(results));
  process.exitCode = ok ? 0 : 1;
})();
