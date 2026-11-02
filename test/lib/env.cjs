// Shared setup for the e2e scripts: puppeteer-core, the Chrome binary, paths, and the fixture
// server. Nothing machine-specific: override with PUPPETEER_CORE (module path) and CHROME_PATH.
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EXT_DIR = process.env.EXT_DIR || ROOT;
const PROFILE_DIR = path.join(ROOT, 'test', 'e2e-profile');
const FIXTURES = path.join(ROOT, 'test', 'modeb');

// Real Chrome (stable): branded Chrome is what users run, and Chromium builds may lack codecs.
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  // Linux: puppeteer needs an existing file, so resolve the command on PATH.
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      const full = path.join(dir, name);
      if (dir && fs.existsSync(full)) return full;
    }
  }
  return 'google-chrome';
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8', '.png': 'image/png',
};

function isUp(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// Static server for test/modeb on 127.0.0.1 and ::1, so http://127.0.0.1:<port> and
// http://localhost:<port> are two origins (cross-origin iframe fixture). Reuses a server that
// is already listening on the port.
async function startFixtureServer(dir = FIXTURES, port = 8766) {
  if (await isUp(port)) return { reused: true, close: async () => {} };
  const handler = (req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(dir, rel);
    const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (!file.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, headers);
      res.end('not found');
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  };
  const servers = [];
  for (const host of ['127.0.0.1', '::1']) {
    const server = http.createServer(handler);
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      servers.push(server);
    } catch (err) {
      if (host === '127.0.0.1') throw err; // IPv6 loopback is optional
    }
  }
  return {
    reused: false,
    close: () => Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections(); s.close(r); }))),
  };
}

module.exports = {
  // Lazy, so the fixture server runs without puppeteer installed.
  get puppeteer() { return require(process.env.PUPPETEER_CORE || 'puppeteer-core'); },
  chromePath, ROOT, EXT_DIR, PROFILE_DIR, FIXTURES, startFixtureServer,
};

// node test/lib/env.cjs [dir] [port]: run the fixture server on its own (manual testing).
if (require.main === module) {
  const [dir = FIXTURES, port = '8766'] = process.argv.slice(2);
  startFixtureServer(path.resolve(dir), Number(port)).then((s) => {
    console.log(s.reused ? `port ${port} already serving` : `serving ${dir} on http://127.0.0.1:${port} and http://localhost:${port}`);
  });
}
