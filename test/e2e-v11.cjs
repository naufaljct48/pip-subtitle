// v1.1 e2e in real Chrome (normal background throttling, i.e. puppeteer's anti-throttle flags off).
//   node test/e2e-v11.cjs clean <url> [adWaitSec]   popup "Buka PiP" -> canvas PiP, then tab switch
//   node test/e2e-v11.cjs full  <url> [adWaitSec]   Alt+P -> Document PiP, then Shift+N (YouTube next)
// env PLAY_XY=x,y clicks a play overlay first.
const { puppeteer, chromePath, EXT_DIR, PROFILE_DIR } = require('./lib/env.cjs');
const path = require('path');
const fs = require('fs');
const [mode, url, adWait = '0'] = process.argv.slice(2);
const OUT = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Proxy frame stats inside the page: white subtitle pixels in the bottom 30% + a coarse hash.
const PROXY_STATS = `(() => {
  const p = document.querySelector('video[data-pipsub]');
  const o = [...document.querySelectorAll('video')].find((v) => !v.hasAttribute('data-pipsub'));
  if (!p || !p.videoWidth) return JSON.stringify({ proxy: !!p, inPip: false });
  const c = document.createElement('canvas'); c.width = p.videoWidth; c.height = p.videoHeight;
  const g = c.getContext('2d'); g.drawImage(p, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let white = 0, hash = 0; const y0 = Math.floor(c.height * 0.7) * c.width * 4;
  for (let k = 0; k < d.length; k += 4) { if (k >= y0 && d[k] > 240 && d[k+1] > 240 && d[k+2] > 240) white++; if (k % 4096 === 0) hash = (hash * 31 + d[k] + d[k+1]) | 0; }
  window.__lastShot = c.toDataURL('image/jpeg', 0.8);
  return JSON.stringify({ inPip: document.pictureInPictureElement === p, size: [p.videoWidth, p.videoHeight], white, hash, origT: o && Math.round(o.currentTime), hidden: document.hidden,
    cap: (document.querySelector('.shaka-text-container, .ytp-caption-window-container') || {}).innerText || '' });
})()`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: false, pipe: true, enableExtensions: true,
    ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    userDataDir: PROFILE_DIR,
    defaultViewport: null,
    args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,860'].concat(process.env.NOMUTE ? [] : ['--mute-audio']),
  });
  try {
    const extId = await browser.installExtension(EXT_DIR);
    const page = (await browser.pages())[0];
    browser.on('targetcreated', async (t) => {
      const u = t.url();
      if (t.type() === 'page' && /^https?:/.test(u) && !u.startsWith(url.slice(0, 20)) && !/example\.com/.test(u)) { const p = await t.page().catch(() => null); if (p) p.close().catch(() => {}); }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);
    if (process.env.PLAY_XY) {
      const [x, y] = process.env.PLAY_XY.split(',').map(Number);
      for (let i = 0; i < 3 && !(await page.evaluate(() => document.querySelectorAll('video').length)); i++) { await page.bringToFront(); await page.mouse.click(x, y); await sleep(3000); }
    }
    if (Number(adWait)) { log('waiting', adWait, 's'); await sleep(Number(adWait) * 1000); }
    await page.evaluate(() => { const v = document.querySelector('video'); if (v && v.paused) v.play().catch(() => {}); document.querySelector('.ytp-skip-ad-button,.ytp-ad-skip-button-modern')?.click(); });

    // Set the mode through the popup page itself (real UI), then use its button for 'clean'.
    await page.bringToFront();
    await page.triggerExtensionAction((await browser.extensions()).get(extId));
    const popT = await browser.waitForTarget((t) => t.url().includes(extId) && t.url().endsWith('popup.html'), { timeout: 5000 });
    const pop = await popT.asPage();
    await sleep(500);
    // By attribute: popup text follows the language setting.
    await pop.click(`button[data-mode="${mode === 'full' ? 'full' : 'clean'}"]`);
    await sleep(300);
    log('popup state', await pop.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)));
    if (mode === 'clean') {
      await pop.click('#open');
      log('clicked open in popup');
    } else {
      await pop.close().catch(() => {});
      await page.bringToFront();
      await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
      log('Alt+P');
    }
    await sleep(3000);

    if (mode === 'clean') {
      for (let i = 0; i < 4; i++) { log('visible', await page.evaluate(PROXY_STATS)); await sleep(1500); }
      const shot = await page.evaluate(() => window.__lastShot);
      if (shot) fs.writeFileSync(path.join(OUT, 'v11-clean-frame.jpg'), Buffer.from(shot.split(',')[1], 'base64'));
      if (process.env.CAPTURE) log('capture', await page.evaluate(() => { const o = [...document.querySelectorAll('video')].find((v) => !v.hasAttribute('data-pipsub')); window.__cap = o.captureStream(); return window.__cap.getTracks().length; }));
      if (process.env.NOMUTE) await page.evaluate(() => { const o = [...document.querySelectorAll('video')].find((v) => !v.hasAttribute('data-pipsub')); o.muted = false; o.volume = 0.02; });
      await page.evaluate(() => { const o = [...document.querySelectorAll("video")].find((v) => !v.hasAttribute("data-pipsub")); window.__ev = []; const t0 = performance.now(); const rec = (n) => () => window.__ev.push([n, Math.round(performance.now() - t0), document.hidden]); document.addEventListener("visibilitychange", rec("vis")); o.addEventListener("pause", rec("pause")); o.addEventListener("play", rec("play")); });
      const other = await browser.newPage();
      await other.goto('https://example.com/');
      await other.bringToFront();
      log('switched to another tab');
      for (let i = 0; i < 6; i++) { await sleep(2000); log('hidden', await page.evaluate(PROXY_STATS)); }
      log('events', await page.evaluate(() => JSON.stringify(window.__ev)));
      await page.bringToFront();
      await sleep(1000);
      await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
      await sleep(1000);
      log('after close', await page.evaluate(() => JSON.stringify({ proxy: !!document.querySelector('video[data-pipsub]'), pipEl: !!document.pictureInPictureElement })));
    } else {
      const docStats = () => page.evaluate(() => {
        const w = window.documentPictureInPicture && documentPictureInPicture.window;
        if (!w) return JSON.stringify({ docPip: false });
        const v = w.document.querySelector('video');
        const r = v && v.getBoundingClientRect();
        return JSON.stringify({ docPip: true, title: w.document.title.slice(0, 50), win: [w.innerWidth, w.innerHeight], rect: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inline: v && (v.getAttribute('style') || '').slice(0, 80), t: v && Math.round(v.currentTime), src: v && v.currentSrc.slice(-8) });
      });
      log('pip', await docStats());
      // YouTube: Shift+N = next video. Keys go to the opener page.
      await page.bringToFront();
      await page.keyboard.down('Shift'); await page.keyboard.press('KeyN'); await page.keyboard.up('Shift');
      log('Shift+N sent');
      for (let i = 0; i < 4; i++) { await sleep(2500); log('after next', await docStats()); }
      for (const t of browser.targets()) { if (t.type() === 'page' && t.url() === 'about:blank') { const p = await t.asPage().catch(() => null); if (p) await p.screenshot({ path: path.join(OUT, 'v11-full-after-next.png') }).catch(() => {}); } }
    }
  } catch (e) { log('ERROR', e.stack || e); } finally { await browser.close(); }
})();
