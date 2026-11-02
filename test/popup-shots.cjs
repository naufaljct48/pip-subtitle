// node test/popup-shots.cjs → test/v14-popup-{en,id}-{light,dark}.png
// Opens the real extension popup page (chrome-extension://<id>/popup.html) in a tab at popup
// size, sets the language through storage, and screenshots both color schemes.
const { puppeteer, chromePath, EXT_DIR, PROFILE_DIR } = require('./lib/env.cjs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: false, pipe: true, enableExtensions: true,
    userDataDir: PROFILE_DIR,
  });
  const out = [];
  try {
    const id = await browser.installExtension(EXT_DIR);
    const page = await browser.newPage();
    await page.setViewport({ width: 300, height: 520, deviceScaleFactor: 2 });
    await page.goto(`chrome-extension://${id}/popup.html`);
    const setLang = (lang) => page.evaluate((l) => new Promise((res) => chrome.storage.local.get('pipsub', (r) => {
      chrome.storage.local.set({ pipsub: { ...((r && r.pipsub) || {}), lang: l } }, res);
    })), lang);
    for (const lang of ['en', 'id']) {
      await setLang(lang);
      for (const scheme of ['light', 'dark']) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await page.reload({ waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 400));
        const info = await page.evaluate(() => ({
          htmlLang: document.documentElement.lang,
          open: document.getElementById('open').textContent,
          langChecked: [...document.querySelectorAll('[data-lang]')].find((b) => b.getAttribute('aria-checked') === 'true').dataset.lang,
          height: document.body.scrollHeight,
        }));
        const file = path.join(__dirname, `v14-popup-${lang}-${scheme}.png`);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 300, height: Math.min(520, info.height) } });
        out.push({ lang, scheme, ...info, file });
      }
    }
    await setLang('auto');
  } finally {
    await browser.close();
  }
  for (const o of out) console.log(JSON.stringify(o));
})();
