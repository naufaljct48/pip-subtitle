// After the extension is reloaded/updated, an already-open tab has only an orphaned copy of the
// content script. Expect: the popup injects a fresh copy and opens PiP without a page refresh, and
// Alt+P toggles once (the orphan steps aside). Fixture: test/modeb/seek.html (top-frame video).
//   node test/e2e-reload.cjs
const path = require('path');
const { puppeteer, chromePath, EXT_DIR, PROFILE_DIR, startFixtureServer } = require('./lib/env.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const server = await startFixtureServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: false, pipe: true, enableExtensions: true,
    userDataDir: PROFILE_DIR + '-reload', defaultViewport: null,
    args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,860', '--mute-audio'],
  });
  const fail = [];
  try {
    let extId = await browser.installExtension(EXT_DIR);
    const page = (await browser.pages())[0];
    await page.goto('http://127.0.0.1:8766/seek.html', { waitUntil: 'load' });
    await sleep(2500);
    await page.evaluate(() => document.querySelector('video').play().catch(() => {}));

    // "Reload" the extension: the tab keeps the old (now orphaned) content script.
    await browser.uninstallExtension(extId);
    await sleep(500);
    extId = await browser.installExtension(EXT_DIR);
    await sleep(800);

    const state = () => page.evaluate(() => ({
      pip: !!document.pictureInPictureElement || !!(window.documentPictureInPicture && documentPictureInPicture.window),
    }));

    // 1) Popup "Open PiP" works without refreshing the page.
    await page.bringToFront();
    await page.triggerExtensionAction((await browser.extensions()).get(extId));
    const pop = await (await browser.waitForTarget((t) => t.url().includes(extId) && t.url().endsWith('popup.html'))).asPage();
    await sleep(600);
    await pop.click('#open');
    await sleep(2500);
    const s1 = await state();
    log('popup open after reload', JSON.stringify(s1));
    if (!s1.pip) fail.push('popup did not open PiP after reload');

    // Close it with Alt+P (the fresh copy owns the session now).
    await page.bringToFront();
    await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
    await sleep(1500);
    const s2 = await state();
    log('Alt+P closes', JSON.stringify(s2));
    if (s2.pip) fail.push('Alt+P did not close PiP');

    // 2) Alt+P opens exactly once (orphan + fresh copy must not both toggle).
    await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
    await sleep(2500);
    const s3 = await state();
    log('Alt+P opens', JSON.stringify(s3));
    if (!s3.pip) fail.push('Alt+P did not open PiP (double toggle?)');
    await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
    await sleep(1200);
  } catch (e) { fail.push(String(e && e.stack || e)); } finally {
    await browser.close().catch(() => {});
    await server.close();
  }
  log(fail.length ? 'FAIL ' + JSON.stringify(fail) : 'PASS');
  process.exit(fail.length ? 1 : 0);
})();
