// Mode B: player inside a cross-origin iframe -> canvas + proxy video PiP with subtitles burned in.
const puppeteer = require(process.env.PUPPETEER_CORE || 'D:/laragon/www/dimensi-v2/node_modules/puppeteer-core');
const path = require('path');
const SCR = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: false, pipe: true, enableExtensions: true,
    userDataDir: path.join(SCR, 'e2e-profile'),
    defaultViewport: { width: 1280, height: 760 },
    args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,860'],
  });
  try {
    await browser.installExtension('D:/tools/pip-subtitle-ext');
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
      await sleep(1000);
    }
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
    log('after close', JSON.stringify(await frame.evaluate(() => ({ proxy: !!document.querySelector('video[data-pipsub]'), pipEl: !!document.pictureInPictureElement }))));

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
      return { mode: w ? 'doc' : 'canvas', modes: [...v.textTracks].map((t) => t.language + ':' + t.mode), inPip: !!(w || document.pictureInPictureElement) };
    });
    const tracksOk = tstate.inPip && tstate.modes.join(',') === 'en:disabled,id:hidden' && src === 'Teks dari track Indonesia';
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
  } catch (e) { log('ERROR', e.stack || e); } finally { await browser.close(); }
})();
