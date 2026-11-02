/* ReelScroll popup: quick toggles + binding summary. No inline handlers (MV3 CSP). */
const DEFAULTS = {
  enabled: true,
  controllerEnabled: true,
  autoAdvance: true,
  controllerTheme: 'auto', // 'auto' | 'light' | 'dark'
  nextKey: 'KeyS',
  prevKey: 'KeyW',
  nextLabel: 'S',
  prevLabel: 'W'
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '"',
    "'": "'"
  })[c]);
}

document.addEventListener('DOMContentLoaded', async () => {
  const enabledEl = document.getElementById('enabled');
  const controllerEl = document.getElementById('controllerEnabled');
  const advanceEl = document.getElementById('autoAdvance');
  const themeEl = document.getElementById('controllerTheme');
  const bindingsEl = document.getElementById('bindings');

  const stored = await chrome.storage.sync.get(null);
  const s = { ...DEFAULTS, ...stored };
  enabledEl.checked = s.enabled;
  controllerEl.checked = s.controllerEnabled;
  advanceEl.checked = s.autoAdvance;
  themeEl.value = s.controllerTheme || 'auto';
  bindingsEl.innerHTML =
    `Up: <kbd>${escapeHtml(s.prevLabel)}</kbd> &nbsp; Down: <kbd>${escapeHtml(s.nextLabel)}</kbd>`;

  enabledEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ enabled: enabledEl.checked });
  });
  controllerEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ controllerEnabled: controllerEl.checked });
  });
  advanceEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoAdvance: advanceEl.checked });
  });
  themeEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ controllerTheme: themeEl.value });
  });

  document.getElementById('openOptions').addEventListener('click', async () => {
    await chrome.runtime.openOptionsPage();
  });

  document.getElementById('openShortcuts').addEventListener('click', async () => {
    // chrome:// URLs can't be opened via tabs.create in all builds -- try, else instruct.
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } catch (err) {
      bindingsEl.textContent = 'Open chrome://extensions/shortcuts manually to set media keys.';
    }
  });
});