/* ReelScroll — in-reel video controller (isolated world, Shadow DOM so IG styles can't touch it) */
(() => {
  'use strict';

  const HOST_ID = 'reelscroll-controller-host';
  const SPEEDS = [0.5, 1, 1.5, 2, 3];
  const DEFAULTS = {
    enabled: true,
    controllerEnabled: true,
    playbackRate: 1,
    controllerMini: false,
    controllerPos: null
  };

  let settings = { ...DEFAULTS };
  let host = null;
  let shadow = null;
  let els = {};
  let video = null;
  let reverseRate = 0; // 0 = off, else 1 or 2 (simulated backward play)
  let reverseTimer = 0;
  let reverseLast = 0;
  let seeking = false;
  let lastDetectAt = 0;
  let frame = 0;

  const SVG = {
    back: '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="2" y="3" width="2" height="10" fill="currentColor"/><path d="M13 3v10L5.5 8 13 3z" fill="currentColor"/></svg>',
    fwd: '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="12" y="3" width="2" height="10" fill="currentColor"/><path d="M3 3v10l7.5-5L3 3z" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2.5v11l8.5-5.5L4 2.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3.5" y="2.5" width="3.4" height="11" fill="currentColor"/><rect x="9.1" y="2.5" width="3.4" height="11" fill="currentColor"/></svg>',
    rev: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M12 3v10L4.5 8 12 3z" fill="currentColor"/></svg>'
  };

  const CSS = `
    :host { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; }
    .pill, .chip { position: fixed; font: 500 12px/1 system-ui, sans-serif; color: #fff;
      background: rgba(10,10,12,.82); border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px; backdrop-filter: blur(6px); user-select: none; }
    .pill { left: 50%; bottom: 92px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 4px; padding: 6px 10px; cursor: grab; }
    .pill.dragging { cursor: grabbing; }
    .chip { left: 50%; bottom: 92px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 6px; padding: 7px 12px; cursor: pointer; }
    .hidden { display: none !important; }
    button { all: unset; display: flex; align-items: center; justify-content: center;
      min-width: 26px; height: 26px; border-radius: 999px; cursor: pointer; color: #fff;
      padding: 0 5px; box-sizing: border-box; }
    button:hover { background: rgba(255,255,255,.16); }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
    button.on { background: #bc2a8d; }
    .speed { font-variant-numeric: tabular-nums; min-width: 38px; }
    .time { font-variant-numeric: tabular-nums; color: rgba(255,255,255,.85);
      white-space: nowrap; padding: 0 2px; }
    .track { position: relative; width: 130px; height: 16px; display: flex;
      align-items: center; cursor: pointer; }
    .rail { position: relative; width: 100%; height: 4px; border-radius: 999px;
      background: rgba(255,255,255,.28); overflow: hidden; }
    .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
      background: #fff; border-radius: 999px; }
    .track.disabled { opacity: .35; pointer-events: none; }
  `;

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(null);
      settings = { ...DEFAULTS, ...stored };
    } catch (err) {
      // Storage blocked: stick with defaults.
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (k in settings) settings[k] = newValue;
    }
    applyVisibility();
    if (video && changes.playbackRate) applyRate(video);
  });

  function isReelsPage() {
    const p = location.pathname || '';
    return p === '/reels' || p === '/reels/' || p.startsWith('/reels/') || p.startsWith('/reel/');
  }

  function isActive() {
    return settings.enabled && settings.controllerEnabled && isReelsPage();
  }

  function fmt(t) {
    if (!isFinite(t) || t < 0) return '--:--';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // The centered, viewport-sized video is the one the user is watching.
  // Feed preloads neighbors, so never just grab the first <video>.
  function detectVideo() {
    const midY = window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;
    document.querySelectorAll('video').forEach((v) => {
      const r = v.getBoundingClientRect();
      if (r.height < 200 || r.width < 150) return;
      const d = Math.abs(r.top + r.height / 2 - midY);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    });
    return best;
  }

  function bindVideo(v) {
    if (v === video) return;
    unbindVideo();
    video = v;
    stopReverse();
    if (!video) return;
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('ended', onEnded);
    applyRate(video);
    paint();
  }

  function unbindVideo() {
    if (!video) return;
    video.removeEventListener('loadedmetadata', onMeta);
    video.removeEventListener('play', onPlay);
    video.removeEventListener('ended', onEnded);
    video = null;
  }

  function onMeta() {
    if (video) applyRate(video);
    paint();
  }

  function onPlay() {
    // Real forward play cancels simulated reverse.
    stopReverse();
    if (video) applyRate(video);
    paint();
  }

  function onEnded() {
    stopReverse();
    paint();
  }

  function applyRate(v) {
    try {
      v.playbackRate = settings.playbackRate;
      v.preservesPitch = true;
    } catch (err) {
      // Some embedded players reject rate changes; leave them alone.
    }
  }

  function stopReverse() {
    reverseRate = 0;
    clearInterval(reverseTimer);
    reverseTimer = 0;
  }

  function startReverse(rate) {
    if (!video) return;
    stopReverse();
    reverseRate = rate;
    video.pause();
    reverseLast = performance.now();
    clearInterval(reverseTimer);
    reverseTimer = setInterval(() => {
      if (!video || reverseRate === 0) {
        stopReverse();
        paint();
        return;
      }
      const now = performance.now();
      const dt = (now - reverseLast) / 1000;
      reverseLast = now;
      const next = video.currentTime - reverseRate * dt;
      if (next <= 0) {
        video.currentTime = 0;
        stopReverse();
      } else {
        try {
          video.currentTime = next;
        } catch (err) {
          stopReverse();
        }
      }
      paint();
    }, 50);
    paint();
  }

  function seekTo(frac) {
    if (!video || !isFinite(video.duration)) return;
    stopReverse();
    const clamped = Math.max(0, Math.min(0.9999, frac));
    try {
      video.currentTime = clamped * video.duration;
    } catch (err) {
      // Seeking past buffered range throws on some reels; ignore.
    }
    paint();
  }

  function nudgeSecs(d) {
    if (!video || !isFinite(video.duration)) return;
    stopReverse();
    const next = Math.max(0, Math.min(video.duration - 0.05, video.currentTime + d));
    try {
      video.currentTime = next;
    } catch (err) {
      // Ignore out-of-range seeks.
    }
    paint();
  }

  function cycleSpeed() {
    const i = SPEEDS.indexOf(settings.playbackRate);
    const next = SPEEDS[(i + 1 + SPEEDS.length) % SPEEDS.length];
    chrome.storage.sync.set({ playbackRate: next });
    settings.playbackRate = next;
    stopReverse();
    if (video && !video.paused) applyRate(video);
    paint();
  }

  function cycleReverse() {
    // off -> -1x -> -2x -> off
    if (reverseRate === 0) startReverse(1);
    else if (reverseRate === 1) startReverse(2);
    else stopReverse();
    paint();
  }

  function togglePlay() {
    if (!video) return;
    if (reverseRate !== 0) {
      stopReverse();
      video.play().catch(() => {});
    } else if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    paint();
  }

  function paint() {
    if (!els.pill) return;
    const hasMeta = !!(video && isFinite(video.duration) && video.duration > 0);
    els.play.innerHTML = video && !video.paused && reverseRate === 0 ? SVG.pause : SVG.play;
    els.play.title = video && !video.paused && reverseRate === 0 ? 'Pause' : 'Play';
    els.time.textContent = video
      ? fmt(video.currentTime) + ' / ' + fmt(video.duration)
      : '--:-- / --:--';
    els.fill.style.width = hasMeta ? (video.currentTime / video.duration * 100) + '%' : '0%';
    els.track.classList.toggle('disabled', !hasMeta);
    els.speed.textContent = settings.playbackRate + 'x';
    els.rev.classList.toggle('on', reverseRate !== 0);
    els.rev.innerHTML = SVG.rev + '<span>' + (reverseRate !== 0 ? '-' + reverseRate + 'x' : 'rev') + '</span>';
    els.chipText.textContent = (reverseRate !== 0 ? '-' + reverseRate + 'x' : settings.playbackRate + 'x');
  }

  function applyVisibility() {
    if (!els.pill) return;
    const show = isActive() && !!video;
    els.pill.classList.toggle('hidden', !show || settings.controllerMini);
    els.chip.classList.toggle('hidden', !show || !settings.controllerMini);
  }

  function build() {
    if (host) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const pill = document.createElement('div');
    pill.className = 'pill hidden';
    pill.innerHTML =
      '<button data-act="back" title="Back 5s">' + SVG.back + '</button>' +
      '<button data-act="play" title="Play/Pause">' + SVG.play + '</button>' +
      '<span class="time">--:-- / --:--</span>' +
      '<div class="track"><div class="rail"><div class="fill"></div></div></div>' +
      '<button data-act="fwd" title="Forward 5s">' + SVG.fwd + '</button>' +
      '<button data-act="speed" class="speed" title="Playback speed">1x</button>' +
      '<button data-act="rev" title="Reverse play">rev</button>' +
      '<button data-act="mini" title="Minimize">–</button>';
    const chip = document.createElement('div');
    chip.className = 'chip hidden';
    chip.innerHTML = SVG.play + '<span></span>';
    shadow.appendChild(style);
    shadow.appendChild(pill);
    shadow.appendChild(chip);
    document.documentElement.appendChild(host);

    els = {
      pill,
      chip,
      chipText: chip.querySelector('span'),
      play: pill.querySelector('[data-act="play"]'),
      time: pill.querySelector('.time'),
      track: pill.querySelector('.track'),
      fill: pill.querySelector('.fill'),
      speed: pill.querySelector('[data-act="speed"]'),
      rev: pill.querySelector('[data-act="rev"]')
    };

    pill.querySelector('[data-act="back"]').addEventListener('click', () => nudgeSecs(-5));
    pill.querySelector('[data-act="fwd"]').addEventListener('click', () => nudgeSecs(5));
    els.play.addEventListener('click', togglePlay);
    els.speed.addEventListener('click', cycleSpeed);
    els.rev.addEventListener('click', cycleReverse);
    pill.querySelector('[data-act="mini"]').addEventListener('click', () => {
      chrome.storage.sync.set({ controllerMini: true });
      settings.controllerMini = true;
      applyVisibility();
    });
    chip.addEventListener('click', () => {
      chrome.storage.sync.set({ controllerMini: false });
      settings.controllerMini = false;
      applyVisibility();
    });

    // Scrub: click or drag along the rail.
    const fracFromEvent = (e) => {
      const r = els.track.getBoundingClientRect();
      return (e.clientX - r.left) / Math.max(1, r.width);
    };
    els.track.addEventListener('pointerdown', (e) => {
      seeking = true;
      els.track.setPointerCapture(e.pointerId);
      seekTo(fracFromEvent(e));
    });
    els.track.addEventListener('pointermove', (e) => {
      if (seeking) seekTo(fracFromEvent(e));
    });
    els.track.addEventListener('pointerup', () => { seeking = false; });
    els.track.addEventListener('pointercancel', () => { seeking = false; });

    // Drag the pill by its background (never by buttons or the rail).
    let drag = null;
    pill.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('.track')) return;
      const r = pill.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      pill.classList.add('dragging');
      pill.setPointerCapture(e.pointerId);
    });
    pill.addEventListener('pointermove', (e) => {
      if (!drag) return;
      pill.style.left = (e.clientX - drag.dx) + 'px';
      pill.style.top = (e.clientY - drag.dy) + 'px';
      pill.style.bottom = 'auto';
      pill.style.transform = 'none';
    });
    pill.addEventListener('pointerup', (e) => {
      if (!drag) return;
      drag = null;
      pill.classList.remove('dragging');
      const pos = { left: pill.style.left, top: pill.style.top };
      chrome.storage.sync.set({ controllerPos: pos });
      settings.controllerPos = pos;
    });

    if (settings.controllerPos) {
      pill.style.left = settings.controllerPos.left;
      pill.style.top = settings.controllerPos.top;
      pill.style.bottom = 'auto';
      pill.style.transform = 'none';
    }
  }

  function tick() {
    frame++;
    const now = performance.now();
    // Re-detect twice a second: cheap, catches reel switches the observer misses.
    if (now - lastDetectAt > 500) {
      lastDetectAt = now;
      if (isActive()) {
        bindVideo(detectVideo());
      } else {
        bindVideo(null);
        stopReverse();
      }
      applyVisibility();
    }
    if (video && !seeking && (frame % 6 === 0)) paint();
    requestAnimationFrame(tick);
  }

  function initObservers() {
    // URL watcher for SPA navigation; detection itself runs in tick().
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        bindVideo(null);
        stopReverse();
        applyVisibility();
      }
    }, 1000);
  }

  async function init() {
    await loadSettings();
    build();
    initObservers();
    applyVisibility();
    paint();
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
