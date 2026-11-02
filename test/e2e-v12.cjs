// v1.2 e2e on YouTube: CC off on the page, popup volume slider -> 30 %, popup "Buka PiP" (Bersih).
// Expect: page video volume 0.3, YouTube CC switched on by the extension, canvas PiP open.
//   node test/e2e-v12.cjs [youtubeUrl]
const { puppeteer, chromePath, EXT_DIR, PROFILE_DIR } = require('./lib/env.cjs');
const path = require('path');
const url = process.argv[2] || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: false, pipe: true, enableExtensions: true,
    userDataDir: PROFILE_DIR, defaultViewport: null,
    args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,860', '--mute-audio'],
  });
  const result = {};
  try {
    const extId = await browser.installExtension(EXT_DIR);
    const page = (await browser.pages())[0];
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    for (let i = 0; i < 15 && await page.evaluate(() => !!document.querySelector('.ad-showing')); i++) {
      await page.evaluate(() => document.querySelector('.ytp-skip-ad-button,.ytp-ad-skip-button-modern')?.click()); await sleep(1500);
    }
    await page.evaluate(() => { const v = document.querySelector('video'); v.play().catch(() => {}); v.volume = 1; });
    // Make sure YouTube's CC is OFF before we start.
    const ccBefore = await page.evaluate(async () => { const b = document.querySelector('.ytp-subtitles-button'); if (b && b.getAttribute('aria-pressed') === 'true') { b.click(); await new Promise((r) => setTimeout(r, 500)); } return b && b.getAttribute('aria-pressed'); });
    log('CC before', ccBefore);

    await page.bringToFront();
    await page.triggerExtensionAction((await browser.extensions()).get(extId));
    const pop = await (await browser.waitForTarget((t) => t.url().includes(extId) && t.url().endsWith('popup.html'))).asPage();
    await sleep(800);
    await pop.click('button[data-mode="clean"]'); // by attribute: popup text follows the language
    const range = await pop.$('input[type="range"]');
    log('popup volume before', await pop.evaluate((r) => [r.value, r.disabled, r.parentElement.innerText.replace(/\s+/g, ' ')], range));
    await range.evaluate((r) => { r.value = '30'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(800);
    result.volume = await page.evaluate(() => document.querySelector('video').volume);
    await pop.click('#open');
    await sleep(3500);
    Object.assign(result, await page.evaluate(() => ({
      pip: document.pictureInPictureElement === document.querySelector('video[data-pipsub]') && !!document.pictureInPictureElement,
      ccAfter: document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed'),
    })));
    log('result', JSON.stringify(result));
    log(result.volume > 0.29 && result.volume < 0.31 && result.pip && result.ccAfter === 'true' ? 'PASS' : 'FAIL');
  } catch (e) { log('ERROR', e.stack || e); } finally { await browser.close(); }
})();
