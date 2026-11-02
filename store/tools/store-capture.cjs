// Raw captures for Chrome Web Store screenshots, from the real extension in real Chrome:
//   page-<lang>.png         demo page at 1280x800 (CSS px) x1
//   full-<lang>.png         Document PiP window (PrintWindow, incl. Chrome's title bar), paused at a subtitle
//   clean-<lang>.png        native PiP window (canvas, subtitles burned in)
//   popup-<lang>-<scheme>.png popup page at 300 px wide, x2
// usage (Windows, PowerShell for window capture): node store/tools/range-server.cjs store/demo 80, then
//   node store/tools/store-capture.cjs <rawDir>; python store/tools/store-compose.py <rawDir> store/screenshots icons/icon128.png
const { puppeteer, chromePath, EXT_DIR } = require('../../test/lib/env.cjs');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const capWin = (title, file) => {
  try { return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'capture-window.ps1'), '-Title', title, '-Out', path.join(OUT, file)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { return String(e.stdout || e).trim(); }
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: false, pipe: true, enableExtensions: true,
    ignoreDefaultArgs: ['--enable-automation'], // no "controlled by automated test software" bar
    userDataDir: path.join(__dirname, 'store-profile'), defaultViewport: null,
    args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1300,900', '--mute-audio', '--force-device-scale-factor=1'],
  });
  try {
    const extId = await browser.installExtension(EXT_DIR);
    const setSettings = async (patch) => {
      const p = await browser.newPage();
      await p.goto(`chrome-extension://${extId}/popup.html`);
      await p.evaluate((patch) => new Promise((r) => chrome.storage.local.get('pipsub', (res) => chrome.storage.local.set({ pipsub: { ...(res.pipsub || {}), ...patch } }, r))), patch);
      await p.close();
    };
    const page = (await browser.pages())[0];
    await page.setViewport({ width: 1280, height: 800 });

    for (const lang of ['en', 'id']) {
      await setSettings({ lang, fontScale: 1, ccOn: true });
      // Popup shots, light and dark.
      const pop = await browser.newPage();
      await pop.setViewport({ width: 300, height: 560, deviceScaleFactor: 2 });
      await pop.goto(`chrome-extension://${extId}/popup.html`);
      for (const scheme of ['light', 'dark']) {
        await pop.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await sleep(400);
        const h = await pop.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
        await pop.screenshot({ path: path.join(OUT, `popup-${lang}-${scheme}.png`), clip: { x: 0, y: 0, width: 300, height: h } });
      }
      await pop.close();

      // Page shot.
      await page.bringToFront();
      await page.goto(`http://127.0.0.1/index.html?lang=${lang}&t=5.5`, { waitUntil: 'load' });
      await sleep(2500);
      await page.evaluate(() => { const v = document.getElementById('v'); v.pause(); v.currentTime = 6.2; });
      await sleep(800);
      await page.screenshot({ path: path.join(OUT, `page-${lang}.png`) });

      // Full mode: Document PiP, paused at a subtitle so the mini player bar stays visible.
      await setSettings({ mode: 'full' });
      await page.bringToFront();
      // Unmuted (Chrome itself runs with --mute-audio) so the volume slider reads 80 %.
      await page.evaluate(() => { const v = document.getElementById('v'); v.muted = false; v.volume = 0.8; return v.play(); });
      await sleep(300);
      await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
      await sleep(1500);
      await page.evaluate(() => {
        const w = documentPictureInPicture.window;
        const v = w.document.querySelector('video');
        v.currentTime = 12.4;
        v.pause();
        w.document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 200 }));
      });
      await sleep(1200);
      log(lang, 'full', capWin('Coastline', `full-${lang}.png`));
      await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
      await sleep(800);

      // Clean mode: native PiP of the canvas.
      await setSettings({ mode: 'clean' });
      await page.evaluate(() => { const v = document.getElementById('v'); v.currentTime = 1.0; v.play(); });
      await sleep(400);
      await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
      await sleep(4500); // Chrome's site-name overlay fades out
      await page.evaluate(() => { const v = document.getElementById('v'); v.currentTime = 16.0; });
      await sleep(900); // t ≈ 16.9, inside the 15.5–20.5 cue
      log(lang, 'clean', capWin('Picture.in.picture|Gambar.dalam.gambar', `clean-${lang}.png`));
      await page.keyboard.down('Alt'); await page.keyboard.press('KeyP'); await page.keyboard.up('Alt');
      await sleep(800);

      // Regular PiP of the page video (what plain PiP extensions do): no subtitles.
      if (lang === 'en') {
        await page.evaluate(() => {
          const v = document.getElementById('v');
          v.currentTime = 11.5;
          window.addEventListener('click', () => v.requestPictureInPicture(), { once: true, capture: true });
        });
        await page.mouse.click(640, 40);
        await sleep(4500);
        await page.evaluate(() => { document.getElementById('v').currentTime = 12.3; });
        await sleep(700);
        log(lang, 'plain', capWin('Picture.in.picture|Gambar.dalam.gambar', 'plain-en.png'));
        await page.evaluate(() => document.exitPictureInPicture().catch(() => {}));
        await sleep(500);
      }
    }
  } catch (e) { log('ERROR', e.stack || e); } finally { await browser.close(); }
})();
