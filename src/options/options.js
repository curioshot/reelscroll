/* Options page: fully customizable up/down keys + wheel tuning. No inline handlers. */
const DEFAULTS = {
  enabled: true,
  wheelEnabled: true,
  invertWheel: false,
  smooth: true,
  cooldownMs: 800,
  wheelThreshold: 30,
  nextKey: 'KeyS',
  prevKey: 'KeyW',
  nextLabel: 'S',
  prevLabel: 'W',
  allowArrows: false
};

function prettyLabel(e) {
  if (e.key === ' ') return 'Space';
  if (e.key === 'ArrowUp') return '↑';
  if (e.key === 'ArrowDown') return '↓';
  if (e.key === 'ArrowLeft') return '←';
  if (e.key === 'ArrowRight') return '→';
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

async function load() {
  const stored = await chrome.storage.sync.get(null);
  return { ...DEFAULTS, ...stored };
}

function flash(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { el.textContent = ''; }, 1500);
}

function armCapture(btn, get, set) {
  btn.addEventListener('click', () => {
    btn.classList.add('capturing');
    btn.textContent = 'Press a key… (Esc cancels)';
    const handler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        btn.classList.remove('capturing');
        btn.textContent = get().label;
        window.removeEventListener('keydown', handler, true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // keep pure keys, modifiers reserved
      const code = e.code;
      const label = prettyLabel(e);
      await chrome.storage.sync.set(set(code, label));
      btn.textContent = label;
      btn.classList.remove('capturing');
      window.removeEventListener('keydown', handler, true);
      flash('Saved ✓');
    };
    window.addEventListener('keydown', handler, true);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const s = await load();

  const enabled = document.getElementById('enabled');
  const wheelEnabled = document.getElementById('wheelEnabled');
  const invertWheel = document.getElementById('invertWheel');
  const smooth = document.getElementById('smooth');
  const allowArrows = document.getElementById('allowArrows');
  const cooldown = document.getElementById('cooldownMs');
  const cooldownVal = document.getElementById('cooldownVal');
  const threshold = document.getElementById('wheelThreshold');
  const thresholdVal = document.getElementById('wheelThresholdVal');
  const prevBtn = document.getElementById('prevCapture');
  const nextBtn = document.getElementById('nextCapture');

  enabled.checked = s.enabled;
  wheelEnabled.checked = s.wheelEnabled;
  invertWheel.checked = s.invertWheel;
  smooth.checked = s.smooth;
  allowArrows.checked = s.allowArrows;
  cooldown.value = s.cooldownMs;
  threshold.value = s.wheelThreshold;
  cooldownVal.textContent = `${s.cooldownMs} ms`;
  thresholdVal.textContent = `${s.wheelThreshold} px`;
  prevBtn.textContent = s.prevLabel;
  nextBtn.textContent = s.nextLabel;

  const save = async (patch) => {
    await chrome.storage.sync.set(patch);
    flash('Saved ✓');
  };

  enabled.addEventListener('change', () => save({ enabled: enabled.checked }));
  wheelEnabled.addEventListener('change', () => save({ wheelEnabled: wheelEnabled.checked }));
  invertWheel.addEventListener('change', () => save({ invertWheel: invertWheel.checked }));
  smooth.addEventListener('change', () => save({ smooth: smooth.checked }));
  allowArrows.addEventListener('change', () => save({ allowArrows: allowArrows.checked }));
  cooldown.addEventListener('input', () => { cooldownVal.textContent = `${cooldown.value} ms`; });
  cooldown.addEventListener('change', () => save({ cooldownMs: Number(cooldown.value) }));
  threshold.addEventListener('input', () => { thresholdVal.textContent = `${threshold.value} px`; });
  threshold.addEventListener('change', () => save({ wheelThreshold: Number(threshold.value) }));

  armCapture(prevBtn, () => ({ label: prevBtn.textContent }),
    (code, label) => ({ prevKey: code, prevLabel: label }));
  armCapture(nextBtn, () => ({ label: nextBtn.textContent }),
    (code, label) => ({ nextKey: code, nextLabel: label }));

  document.getElementById('reset').addEventListener('click', async () => {
    await chrome.storage.sync.set(DEFAULTS);
    prevBtn.textContent = DEFAULTS.prevLabel;
    nextBtn.textContent = DEFAULTS.nextLabel;
    enabled.checked = DEFAULTS.enabled;
    wheelEnabled.checked = DEFAULTS.wheelEnabled;
    invertWheel.checked = DEFAULTS.invertWheel;
    smooth.checked = DEFAULTS.smooth;
    allowArrows.checked = DEFAULTS.allowArrows;
    cooldown.value = DEFAULTS.cooldownMs;
    threshold.value = DEFAULTS.wheelThreshold;
    cooldownVal.textContent = `${DEFAULTS.cooldownMs} ms`;
    thresholdVal.textContent = `${DEFAULTS.wheelThreshold} px`;
    flash('Defaults restored ✓');
  });
});
