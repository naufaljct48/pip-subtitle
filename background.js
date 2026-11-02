// Toolbar click: ask every frame for its best-video score (content.js exposes
// window.__pipSubScore in the isolated world), then toggle PiP in the winner.
async function flagFailure(tabId) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#d50032' });
    await chrome.action.setBadgeText({ tabId, text: '!' });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 3000);
  } catch (_) { /* tab closed */ }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  try {
    // First call goes straight to the top frame while the click's user activation is fresh;
    // most players live there. Only if it has no video do we score the other frames.
    const [top] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      func: () => {
        if (typeof window.__pipSubScore !== 'function') return false;
        const score = window.__pipSubScore();
        if (!(score > 0)) return false;
        // A bigger iframe (embedded player) beats a small top-level video such as an ad.
        if (score < Number.MAX_SAFE_INTEGER) {
          const vw = innerWidth, vh = innerHeight;
          for (const f of document.querySelectorAll('iframe')) {
            const r = f.getBoundingClientRect();
            const a = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
              Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            if (a * 2 > score) return false;
          }
        }
        window.__pipSub.toggle();
        return true;
      },
    });
    if (top && top.result === true) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => (typeof window.__pipSubScore === 'function' ? window.__pipSubScore() : 0),
    });
    let best = null;
    for (const r of results || []) {
      const score = Number(r.result);
      if (score > 0 && (!best || score > best.score)) best = { score, frameId: r.frameId };
    }
    if (!best) return flagFailure(tab.id);
    // Direct call via executeScript instead of tabs.sendMessage, which drops the click's
    // user activation; Document PiP then has a chance to open without the retry toast.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [best.frameId] },
      func: () => { if (window.__pipSub) window.__pipSub.toggle(); },
    });
  } catch (_) {
    // chrome:// pages, Web Store, or injection forbidden.
    flagFailure(tab.id);
  }
});
