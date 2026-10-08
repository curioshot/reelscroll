/* ReelScroll popup: quick toggles + binding summary. No inline handlers (MV3 CSP). */
const DEFAULTS = {
  enabled: true,
  wheelEnabled: true,
  controllerEnabled: true,
  autoAdvance: true,
  nextKey: 'KeyS',
  prevKey: 'KeyW',
  nextLabel: 'S',
  prevLabel: 'W'
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

document.addEventListener('DOMContentLoaded', async () => {
  const enabledEl = document.getElementById('enabled');
  const wheelEl = document.getElementById('wheelEnabled');
  const controllerEl = document.getElementById('controllerEnabled');
  const advanceEl = document.getElementById('autoAdvance');
  const bindingsEl = document.getElementById('bindings');

  const stored = await chrome.storage.sync.get(null);
  const s = { ...DEFAULTS, ...stored };
  enabledEl.checked = s.enabled;
  wheelEl.checked = s.wheelEnabled;
  controllerEl.checked = s.controllerEnabled;
  advanceEl.checked = s.autoAdvance;
  bindingsEl.innerHTML =
    `Up: <kbd>${escapeHtml(s.prevLabel)}</kbd> &nbsp; Down: <kbd>${escapeHtml(s.nextLabel)}</kbd>`;

  enabledEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ enabled: enabledEl.checked });
  });
  wheelEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ wheelEnabled: wheelEl.checked });
  });
  controllerEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ controllerEnabled: controllerEl.checked });
  });
  advanceEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoAdvance: advanceEl.checked });
  });

  document.getElementById('openOptions').addEventListener('click', async () => {
    await chrome.runtime.openOptionsPage();
  });

  document.getElementById('openShortcuts').addEventListener('click', async () => {
    // chrome:// URLs can't be opened via tabs.create in all builds — try, else instruct.
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } catch (err) {
      bindingsEl.textContent = 'Open chrome://extensions/shortcuts manually to set media keys.';
    }
  });
});
