// Mode B: player inside a cross-origin iframe -> canvas + proxy video PiP with subtitles burned in.
const { puppeteer, chromePath, EXT_DIR, PROFILE_DIR, startFixtureServer } = require('./lib/env.cjs');
const path = require('path');
const SCR = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Any 'FAIL' or 'ERROR' line makes the run exit non-zero (npm run e2e:modeb).
let failed = false;
const log = (...a) => {
  if (a.includes('FAIL') || a.includes('ERROR')) failed = true;
  console.log(new Date().toISOString().slice(11, 19), ...a);
};

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
  try {
    await browser.installExtension(EXT_DIR);
    const page = (await browser.pages())[0];
    page.on('console', (m) => { if (/PiP Subtitle/.test(m.text())) log('console', m.text().slice(0, 200)); });
    await page.goto('http://127.0.0.1:8766/top.html', { waitUntil: 'load' });
    await sleep(2500);
    const frame = page.frames().find((f) => f.url().includes('localhost:8766/frame.html'));
    log('frame found', !!frame);
    // Focus the iframe without touching the video: click its black area below the player.
    await page.mouse.click(400, 560);
    await sleep(300);
    await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
    await sleep(2000);
    let maxWhite = 0;
    for (let i = 0; i < 4; i++) {
      const s = await frame.evaluate(async () => {
        const proxy = document.querySelector('video[data-pipsub]');
        const pipEl = document.pictureInPictureElement;
        let white = null;
        if (proxy && proxy.videoWidth) {
          const c = document.createElement('canvas'); c.width = proxy.videoWidth; c.height = proxy.videoHeight;
          const g = c.getContext('2d'); g.drawImage(proxy, 0, 0);
          const d = g.getImageData(0, Math.floor(c.height * 0.7), c.width, Math.floor(c.height * 0.3)).data;
          white = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 240 && d[k + 1] > 240 && d[k + 2] > 240) white++;
          if (!window.__shot) { window.__shot = c.toDataURL('image/png'); }
        }
        return { proxy: !!proxy, inPip: pipEl === proxy && !!proxy, size: proxy && [proxy.videoWidth, proxy.videoHeight], cue: document.querySelector('.vjs-text-track-cue').textContent, white };
      });
      log('sample', JSON.stringify(s));
      maxWhite = Math.max(maxWhite, s.white || 0);
      await sleep(1000);
    }
    log('subtitle pixels in proxy', maxWhite > 0 ? 'OK' : 'FAIL', maxWhite);

    // Page placeholder: covers the original video's box (black + text), the video itself stays
    // untouched and keeps feeding the canvas, the player's controls stay on top.
    const ph = await frame.evaluate(async () => {
      const v = document.getElementById('v');
      const host = document.querySelector('[data-pipsub]:not(video)');
      const hash = () => {
        const p = document.querySelector('video[data-pipsub]');
        const c = document.createElement('canvas'); c.width = p.videoWidth; c.height = p.videoHeight;
        const g = c.getContext('2d'); g.drawImage(p, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let h = 0; for (let k = 0; k < d.length; k += 4096) h = (h * 31 + d[k] + d[k + 1] + d[k + 2]) | 0;
        return h;
      };
      const h1 = hash();
      await new Promise((r) => setTimeout(r, 2000));
      const h2 = hash();
      const r4 = (r) => r && [r.left, r.top, r.width, r.height].map((n) => Math.round(n));
      const bar = document.querySelector('.vjs-control-bar');
      const cs = getComputedStyle(v);
      return {
        exists: !!host, nextSibling: !!host && v.nextSibling === host,
        video: r4(v.getBoundingClientRect()), box: r4(host && host.getBoundingClientRect()),
        bar: r4(bar.getBoundingClientRect()), framesChange: h1 !== h2,
        videoUntouched: cs.opacity === '1' && cs.visibility === 'visible' && cs.display !== 'none' && !v.paused,
        controlsHit: (() => { const b = bar.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e === bar || bar.contains(e); })(),
      };
    });
    // What is painted where: page screenshot, pixels read back in the page.
    const fb = await (await page.$('#f')).boundingBox();
    const px = async (x, y) => {
      const b64 = await page.screenshot({ encoding: 'base64', clip: { x: fb.x + x, y: fb.y + y, width: 1, height: 1 } });
      return page.evaluate(async (data) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
        const c = document.createElement('canvas'); c.width = 1; c.height = 1;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
      }, b64);
    };
    ph.pxVideoArea = await px(ph.video[0] + ph.video[2] * 0.15, ph.video[1] + ph.video[3] * 0.2); // away from the centered text
    ph.pxControls = await px(ph.bar[0] + ph.bar[2] / 2, ph.bar[1] + ph.bar[3] / 2);
    const near1 = (a, b) => a && b && a.every((n, i) => Math.abs(n - b[i]) <= 1);
    const phOk = ph.exists && ph.nextSibling && near1(ph.video, ph.box) && ph.framesChange && ph.videoUntouched &&
      ph.controlsHit && ph.pxVideoArea.every((c) => c <= 8) && near1(ph.pxControls.map((c) => Math.round(c / 4)), [43, 51, 63].map((c) => Math.round(c / 4)));
    log('placeholder', phOk ? 'OK' : 'FAIL', JSON.stringify(ph));
    await page.screenshot({ path: path.join(SCR, 'modeb-placeholder.png') });
    const shot = await frame.evaluate(() => window.__shot || null);
    if (shot) { require('fs').writeFileSync(path.join(SCR, 'modeb-frame.png'), Buffer.from(shot.split(',')[1], 'base64')); log('proxy frame saved'); }
    // Source changes aspect mid-PiP (next video): the canvas and so the proxy stream must follow.
    const before = await frame.evaluate(() => { const p = document.querySelector('video[data-pipsub]'); return p && [p.videoWidth, p.videoHeight]; });
    await frame.evaluate(() => window.resizeSource());
    await sleep(1500);
    const after = await frame.evaluate(() => {
      const p = document.querySelector('video[data-pipsub]');
      return { size: p && [p.videoWidth, p.videoHeight], src: [document.getElementById('v').videoWidth, document.getElementById('v').videoHeight], inPip: document.pictureInPictureElement === p && !!p };
    });
    const resizeOk = !!(after.size && after.size[0] === 480 && after.size[1] === 480 && after.inPip);
    log('resize', resizeOk ? 'OK' : 'FAIL', JSON.stringify({ before, ...after }));
    // Popup volume path: __pipSub.setVolume in the iframe's isolated world (the iframe is an
    // out-of-process frame, so it has its own CDP target).
    const ft = browser.targets().find((t) => t.url().includes('localhost:8766/frame.html'));
    const fcdp = await ft.createCDPSession();
    const fctx = [];
    fcdp.on('Runtime.executionContextCreated', (e) => fctx.push(e.context));
    await fcdp.send('Runtime.enable');
    await sleep(300);
    const ours = fctx.find((c) => c.name === 'PiP Subtitle');
    const isoEval = async (expr) => (await fcdp.send('Runtime.evaluate', { contextId: ours.id, expression: expr, returnByValue: true })).result.value;
    const setRes = await isoEval('JSON.stringify(window.__pipSub.setVolume(0.3))');
    const vol = await frame.evaluate(() => { const v = document.getElementById('v'); return { volume: v.volume, muted: v.muted }; });
    const getRes = await isoEval('JSON.stringify(window.__pipSub.getVolume())');
    await isoEval('window.__pipSub.setVolume(0)');
    const zero = await frame.evaluate(() => document.getElementById('v').muted);
    const volumeOk = Math.abs(vol.volume - 0.3) < 1e-6 && !vol.muted && zero === true;
    log('volume', volumeOk ? 'OK' : 'FAIL', JSON.stringify({ setRes, page: vol, getRes, mutedAt0: zero }));
    // Pause from the original -> proxy follows; then close with Alt+P.
    log('pause sync', JSON.stringify(await frame.evaluate(async () => { const v = document.getElementById('v'); v.pause(); await new Promise((r) => setTimeout(r, 300)); return { proxyPaused: document.querySelector('video[data-pipsub]')?.paused }; })));
    await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
    await sleep(1000);
    const closed = await frame.evaluate(() => ({ proxy: !!document.querySelector('video[data-pipsub]'), pipEl: !!document.pictureInPictureElement, placeholder: !!document.querySelector('[data-pipsub]') }));
    log('after close', !closed.proxy && !closed.pipEl && !closed.placeholder ? 'OK' : 'FAIL', JSON.stringify(closed));

    // Captions off on the page (native tracks 'disabled'): opening PiP switches one on.
    const tcdp = await page.createCDPSession();
    const tctx = [];
    tcdp.on('Runtime.executionContextCreated', (e) => tctx.push(e.context));
    await page.goto('http://127.0.0.1:8766/track.html', { waitUntil: 'load' });
    await tcdp.send('Runtime.enable');
    await sleep(2000);
    await page.mouse.click(400, 600);
    await sleep(300);
    await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
    await sleep(3000);
    const tours = tctx.filter((c) => c.name === 'PiP Subtitle').pop();
    const src = tours && (await tcdp.send('Runtime.evaluate', { contextId: tours.id, expression: 'window.__pipSub.debugSource()', returnByValue: true })).result.value;
    // Either mode (the e2e profile may hold mode 'full'): in Document PiP the video moved there.
    const tstate = await page.evaluate(() => {
      const w = window.documentPictureInPicture && documentPictureInPicture.window;
      const v = document.getElementById('v') || (w && w.document.querySelector('video'));
      return { mode: w ? 'doc' : 'canvas', modes: [...v.textTracks].map((t) => t.language + ':' + t.mode), inPip: !!(w || document.pictureInPictureElement),
        // top-frame canvas session: the page copy is covered too (Full mode moves the video instead)
        placeholder: !!document.querySelector('[data-pipsub]:not(video)') };
    });
    const tracksOk = tstate.inPip && tstate.modes.join(',') === 'en:disabled,id:hidden' && src === 'Teks dari track Indonesia' &&
      tstate.placeholder === (tstate.mode === 'canvas');
    log('captions on', tracksOk ? 'OK' : 'FAIL', JSON.stringify({ ...tstate, src }));

    // Lengkap volume (only when the profile is in 'full' mode): Vol + slider in the bottom mini player, ArrowUp/Down.
    if (tstate.mode === 'doc') {
      const dv = await page.evaluate(async () => {
        const w = documentPictureInPicture.window;
        const v = w.document.querySelector('video');
        const key = (k) => w.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
        const wait = () => new Promise((r) => setTimeout(r, 100));
        v.muted = false; v.volume = 0.5; await wait();
        const bar = [...w.document.querySelectorAll('.ctl .row > *')].map((n) => n.textContent || n.type);
        const topBar = [...w.document.querySelectorAll('.bar > *')].map((n) => n.textContent);
        const range = w.document.querySelector('.ctl .vol');
        key('ArrowUp'); await wait(); const up = v.volume;
        key('ArrowDown'); key('ArrowDown'); await wait(); const down = v.volume;
        const sliderFollows = range.value === String(Math.round(v.volume * 100));
        [...w.document.querySelectorAll('.ctl button')].find((b) => b.textContent === 'Vol').click(); await wait();
        const mutedByVol = v.muted;
        return { bar, topBar, up, down, sliderFollows, mutedByVol, title: range.title };
      });
      const dvOk = dv.up === 0.6 && dv.down === 0.4 && dv.sliderFollows && dv.mutedByVol && dv.bar.indexOf('range') === dv.bar.indexOf('Vol') + 1 && !dv.topBar.includes('Vol');
      log('mini player volume', dvOk ? 'OK' : 'FAIL', JSON.stringify(dv));
    }
  } catch (e) { log('ERROR', e.stack || e); } finally { await browser.close(); await server.close(); }
  log(failed ? 'FAIL' : 'PASS');
  process.exitCode = failed ? 1 : 0;
})();
