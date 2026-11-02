// End-to-end: real Chrome + unpacked extension, Alt+P on a page, read the Document PiP window.
// usage: node e2e.cjs <url> [waitAdSeconds]
const { puppeteer, chromePath, EXT_DIR, PROFILE_DIR } = require('./lib/env.cjs');
const path = require('path');
const SCR = __dirname;
const EXT = EXT_DIR;
const url = process.argv[2];
const adWait = Number(process.argv[3] || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: false,
    pipe: true,
    enableExtensions: true,
    userDataDir: PROFILE_DIR,
    defaultViewport: { width: 1280, height: 760 },
    args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,860', '--mute-audio'],
  });
  const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
  try {
    const extId = await browser.installExtension(EXT);
    log('extension', extId);
    // Close popups (ad tabs) as they appear.
    browser.on('targetcreated', async (t) => {
      if (t.type() === 'page' && !/^about:blank/.test(t.url())) { const p = await t.page().catch(() => null); if (p && p !== page) { await sleep(300); p.close().catch(() => {}); } }
    });
    const page = (await browser.pages())[0];
    page.on('console', (m) => { const t = m.text(); if (/PiP Subtitle|pipsub/i.test(t)) log('console', m.type(), t.slice(0, 300)); });
    page.on('pageerror', (e) => log('pageerror', String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);
    if (process.env.PLAY_SEL) {
      await page.click(process.env.PLAY_SEL).catch((e) => log('play click failed', e.message));
    }
    if (process.env.PLAY_XY) {
      const [x, y] = process.env.PLAY_XY.split(',').map(Number);
      for (let i = 0; i < 3; i++) {
        if (await page.evaluate(() => document.querySelectorAll('video').length)) break;
        await page.bringToFront();
        await page.mouse.click(x, y);
        log('clicked play at', x, y);
        await sleep(3000);
      }
    }
    if (adWait) { log('waiting ad', adWait, 's'); await sleep(adWait * 1000); }
    if (process.env.BEFORE_JS) log('before', await page.evaluate(process.env.BEFORE_JS).catch((e) => e.message));
    const info = await page.evaluate(() => {
      const vs = [...document.querySelectorAll('video')].map((v) => ({ src: (v.currentSrc || '').slice(0, 60), paused: v.paused, t: v.currentTime, w: v.clientWidth }));
      return { vs, cap: document.querySelector('.shaka-text-container, .ytp-caption-window-container, .vjs-text-track-display, .jw-text-track-container')?.innerText || null };
    });
    log('page videos', JSON.stringify(info));
    const cdp = await page.createCDPSession();
    const ctxs = [];
    cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
    await cdp.send('Runtime.enable');
    await sleep(500);
    const iso = ctxs.filter((c) => c.auxData && c.auxData.type === 'isolated');
    log('isolated contexts', JSON.stringify(iso.map((c) => [c.id, c.name, c.auxData.frameId === page.mainFrame()._id])));
    for (const c of iso) {
      const r = await cdp.send('Runtime.evaluate', { contextId: c.id, expression: 'JSON.stringify({loaded: !!window.__pipSubLoaded, score: window.__pipSubScore ? window.__pipSubScore() : null, src: window.__pipSub ? window.__pipSub.debugSource() : null})' }).catch((e) => ({ err: e.message }));
      log('iso eval', c.name, JSON.stringify(r.result ? r.result.value : r));
    }
    const ours = iso.find((c) => c.name === 'PiP Subtitle');
    const isoEval = async (expr) => { const r = await cdp.send('Runtime.evaluate', { contextId: ours.id, expression: expr, awaitPromise: true }).catch((e) => ({ err: e.message })); return r.result ? r.result.value : r; };
    await isoEval("window.__keys=[]; window.addEventListener('keydown', e => window.__keys.push([e.key, e.code, e.altKey, e.isTrusted, document.hasFocus(), navigator.userActivation.isActive]), true); 1");
    global.__isoEval = isoEval;
    await page.bringToFront();
    await sleep(500);
    const trigger = async () => {
      if (process.env.TOOLBAR) {
        const exts = await browser.extensions();
        const ext = exts.get ? exts.get(extId) : [...exts].find((e) => e.id === extId);
        await page.triggerExtensionAction(ext);
        log('toolbar action triggered');
      } else {
        await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
      }
    };
    await trigger();
    await sleep(2500);
    log('keys seen', JSON.stringify(await global.__isoEval('JSON.stringify(window.__keys)')));
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const s = await page.evaluate(() => {
        const w = window.documentPictureInPicture && documentPictureInPicture.window;
        if (!w) return { inDoc: document.querySelectorAll('video').length, pip: false, pipEl: !!document.pictureInPictureElement, toast: !!document.querySelector('pipsub-toast') };
        const v = w.document.querySelector('video');
        const sub = w.document.querySelector('.sub');
        const pc = document.querySelector('.ytp-caption-window-container, .shaka-text-container');
        return { pip: true, size: [w.innerWidth, w.innerHeight], video: !!v, playing: v && !v.paused, t: v && Math.round(v.currentTime), src: v && (v.currentSrc || '').slice(-12), ad: !!document.querySelector('.ad-showing'), pageCap: pc ? pc.innerText : null, pageVideos: document.querySelectorAll('video').length, sub: sub && !sub.hidden ? sub.innerText : '' };
      });
      samples.push(s);
      await sleep(1500);
    }
    const seen = [...new Set(samples.map((s) => s.sub))];
    if (process.env.ALL_SAMPLES) samples.forEach((s, i) => log('s' + i, JSON.stringify(s)));
    log('samples', JSON.stringify(samples[0]), JSON.stringify(samples[samples.length - 1]));
    log('distinct subtitles in PiP', JSON.stringify(seen));
    // Screenshot the PiP window if it is exposed as a target.
    for (const t of browser.targets()) {
      if (t.type() === 'page' || t.type() === 'other') {
        const u = t.url();
        if (u === 'about:blank' || u === '') {
          const p = await t.asPage().catch(() => null);
          if (p) { await p.screenshot({ path: path.join(SCR, 'pip-window.png') }).catch(() => {}); log('pip screenshot saved'); }
        }
      }
    }
    await page.screenshot({ path: path.join(SCR, 'page-during-pip.png') });
    // Close the same way and check the video went back.
    await trigger();
    await sleep(1500);
    log('after close', JSON.stringify(await page.evaluate(() => ({
      pip: !!(window.documentPictureInPicture && documentPictureInPicture.window),
      videosInPage: document.querySelectorAll('video').length,
      playing: [...document.querySelectorAll('video')].some((v) => !v.paused),
    }))));
  } catch (e) {
    log('ERROR', e && e.stack || e);
  } finally {
    await browser.close();
  }
})();
