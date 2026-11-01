/* ReelScroll — service worker (MV3, ephemeral: no in-memory state) */

const DEFAULT_SETTINGS = {
  enabled: true,
  controllerEnabled: true,
  autoAdvance: true,
  playbackRate: 1,
  controllerMini: false,
  controllerPos: null,
  smooth: true,
  cooldownMs: 800,
  nextKey: 'KeyS',
  prevKey: 'KeyW',
  nextLabel: 'S',
  prevLabel: 'W',
  allowArrows: false
};

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const current = await chrome.storage.sync.get(null);
    const missing = {};
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(k in current)) missing[k] = v;
    }
    if (Object.keys(missing).length > 0) {
      await chrome.storage.sync.set(missing);
    }
  }
});

async function sendToReelsTabs(message) {
  // Query broadly — content script itself gates on /reels/ or /reel/ URL.
  const tabs = await chrome.tabs.query({
    url: ['https://www.instagram.com/*', 'https://instagram.com/*']
  });
  const results = [];
  for (const tab of tabs) {
    if (tab.id == null) continue;
    try {
      const res = await chrome.tabs.sendMessage(tab.id, message);
      results.push(res);
    } catch (err) {
      // Content script not ready on this tab (navigated away / not injected yet).
    }
  }
  return results;
}

// Download button: hand the URL to Chrome's downloader (no CORS, no hosts needed).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'REELS_DOWNLOAD') return;
  const url = typeof message.url === 'string' ? message.url.trim() : '';
  saveVideo(url, (res) => sendResponse(res));
  return true; // the answer comes from the download callback
});

function saveVideo(url, done) {
  if (!/^https:\/\//.test(url)) return done({ ok: false, error: 'no direct file URL' });
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  } catch (err) {
    // Malformed URL: fall through with an empty basename.
  }
  name = name.replace(/[^\w.\-]+/g, '_').slice(-60) || 'instagram-video.mp4';
  if (!/\.mp4$/i.test(name)) name += '.mp4';
  try {
    chrome.downloads.download({ url, filename: name, saveAs: false }, (id) => {
      done({ ok: id != null });
    });
  } catch (err) {
    done({ ok: false, error: 'download refused' });
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'next-reel' && command !== 'prev-reel') return;
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  if (!enabled) return;
  const type = command === 'next-reel' ? 'REELS_NEXT' : 'REELS_PREV';
  await sendToReelsTabs({ type, source: 'media-key' });
});
