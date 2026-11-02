// Tab switch while in PiP on a site that pauses its own video on visibilitychange.
// Starts the fixture server (test/lib/env.cjs) itself.
// Chrome runs with normal background behaviour (puppeteer's anti-throttling flags removed).
// For each fixture variant: (1) control without PiP: the fixture really pauses when hidden;
// (2) with canvas PiP open: the source keeps playing and the proxy frames keep changing.
const { puppeteer, chromePath, EXT_DIR, PROFILE_DIR, startFixtureServer } = require('./lib/env.cjs');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const STATE = `(() => {
  const v = document.getElementById('v');
  const p = document.querySelector('video[data-pipsub]');
  let hash = null;
  if (p && p.videoWidth) {
    const c = document.createElement('canvas'); c.width = p.videoWidth; c.height = p.videoHeight;
    const g = c.getContext('2d'); g.drawImage(p, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    hash = 0; for (let k = 0; k < d.length; k += 4096) hash = (hash * 31 + d[k] + d[k + 1] + d[k + 2]) | 0;
  }
  return { t: +v.currentTime.toFixed(2), paused: v.paused, hidden: document.hidden, inPip: !!p && document.pictureInPictureElement === p, hash };
})()`;

async function altP(page) {
  await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
}

async function runVariant(browser, page, variant) {
  const results = {};
  await page.goto(`http://127.0.0.1:8766/top.html?pauseOnHide=${variant}`, { waitUntil: 'load' });
  await sleep(2500);
  const frame = page.frames().find((f) => f.url().includes('localhost:8766/frame.html'));
  if (!frame) throw new Error('fixture frame not found');

  // Control: no PiP, switch tab -> the fixture pauses itself.
  const other = await browser.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await sleep(1500);
  const ctl = await frame.evaluate(STATE);
  results.controlPaused = ctl.paused && ctl.hidden;
  log(variant, 'control (no PiP, hidden)', JSON.stringify(ctl));
  await page.bringToFront();
  await sleep(500);
  // Without the anti-occlusion flags, a Chrome window covered by another window or minimized
  // stays hidden after bringToFront, and every later step would fail for that reason.
  if (await page.evaluate(() => document.hidden)) {
    throw new Error('page still hidden after bringToFront: keep the Chrome test window visible and uncovered');
  }
  await frame.evaluate(() => document.getElementById('v').play());
  await sleep(500);

  // Open canvas PiP with Alt+P inside the iframe.
  await page.mouse.click(400, 560);
  await sleep(300);
  await altP(page);
  await sleep(2000);
  const open = await frame.evaluate(STATE);
  log(variant, 'PiP open', JSON.stringify(open));
  results.opened = open.inPip;

  await other.bringToFront();
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await sleep(1000);
    samples.push(await frame.evaluate(STATE));
    log(variant, 'hidden sample', JSON.stringify(samples[samples.length - 1]));
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  results.stayedHidden = samples.every((s) => s.hidden);
  // 'window': the page's listener runs before ours, so its pause can only be undone after the
  // fact by auto-resume; one paused sample is the expected blip. 'document' must never pause.
  const pausedSamples = samples.filter((s) => s.paused).length;
  results.kept = samples.every((s) => s.inPip) && !last.paused &&
    pausedSamples <= (variant === 'window' ? 1 : 0);
  results.timeAdvanced = last.t - first.t >= 2.5;
  results.framesChanged = new Set(samples.map((s) => s.hash)).size >= 3;

  await page.bringToFront();
  await sleep(500);
  await altP(page);
  await sleep(800);
  const closed = await frame.evaluate(STATE);
  results.closed = !closed.inPip;
  // Guard off after close: hiding the tab now pauses the fixture again.
  await other.bringToFront();
  await sleep(1500);
  const after = await frame.evaluate(STATE);
  results.guardOffAfterClose = after.paused && after.hidden;
  log(variant, 'after close, hidden', JSON.stringify(after));
  await other.close();
  await page.bringToFront();
  return results;
}

(async () => {
  // Fixture pages on 127.0.0.1 and localhost (two origins); reuses one already running.
  const server = await startFixtureServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: false, pipe: true, enableExtensions: true,
    userDataDir: PROFILE_DIR,
    defaultViewport: { width: 1280, height: 760 },
    ignoreDefaultArgs: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
    args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,860'],
  });
  let failed = false;
  try {
    await browser.installExtension(EXT_DIR);
    const page = (await browser.pages())[0];
    page.on('console', (m) => { if (/PiP Subtitle/.test(m.text())) log('console', m.text().slice(0, 200)); });
    for (const variant of ['1', 'window']) {
      const r = await runVariant(browser, page, variant);
      const ok = Object.values(r).every(Boolean);
      if (!ok) failed = true;
      log(variant, ok ? 'PASS' : 'FAIL', JSON.stringify(r));
    }
  } catch (e) {
    failed = true;
    log('ERROR', e.stack || e);
  } finally {
    await browser.close();
    await server.close();
  }
  process.exitCode = failed ? 1 : 0;
})();
