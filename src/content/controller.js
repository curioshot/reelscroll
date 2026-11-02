/* ReelScroll — video controller for every IG video (isolated world, Shadow DOM so IG styles can't touch it).
   Navigation scaffolding (next/prev, auto-advance) stays Reels-only via reels.js. */
(() => {
  'use strict';

  const HOST_ID = 'reelscroll-controller-host';
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const DEFAULTS = {
    enabled: true,
    controllerEnabled: true,
    autoAdvance: true,
    playbackRate: 1,
    controllerMini: false,
    controllerPos: null,
    controllerAnchor: 'bottom-center' // 'tl'|'t'|'tr'|'l'|'c'|'r'|'bl'|'b'|'br'|'free'
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
  let pendingAdvance = null; // {src, fireAt, retried}: polled, so rebinds can't cancel it
  let advancedFor = null; // src+duration key the watchdog already queued, fires once per reel
  let endedStamp = null; // {src, at}: `ended` fired recently, survives IG's instant replay
  let lastTime = 0; // last seen currentTime, for loop-wrap detection
  let lastSrc = ''; // bound video src, for same-element reuse detection
  let lastSeekAt = 0; // our own seeks never count as loop wraps
  let pipGen = 0; // generation counter: overlapping followPip() calls don't clear each other
  let bindMarkAt = 0; // performance.now() of the last video bind/src swap: download entries must postdate it
  // Loop range state
  let loopStart = null; // seconds
  let loopEnd = null;   // seconds
  let loopActive = false;

  // Anchor system
  const ANCHORS = {
    'tl': { left: 'env(safe-area-inset-left, 16px)', top: 'env(safe-area-inset-top, 16px)', transform: 'none' },
    't':  { left: '50%', top: 'env(safe-area-inset-top, 16px)', transform: 'translateX(-50%)' },
    'tr': { right: 'env(safe-area-inset-right, 16px)', top: 'env(safe-area-inset-top, 16px)', transform: 'none' },
    'l':  { left: 'env(safe-area-inset-left, 16px)', top: '50%', transform: 'translateY(-50%)' },
    'c':  { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' },
    'r':  { right: 'env(safe-area-inset-right, 16px)', top: '50%', transform: 'translateY(-50%)' },
    'bl': { left: 'env(safe-area-inset-left, 16px)', bottom: 'env(safe-area-inset-bottom, 92px)', transform: 'none' },
    'b':  { left: '50%', bottom: 'env(safe-area-inset-bottom, 92px)', transform: 'translateX(-50%)' },
    'br': { right: 'env(safe-area-inset-right, 16px)', bottom: 'env(safe-area-inset-bottom, 92px)', transform: 'none' },
    'bottom-center': { left: '50%', bottom: 'env(safe-area-inset-bottom, 92px)', transform: 'translateX(-50%)' }
  };

  // Popover state
  let speedPopoverGen = 0;
  let speedPopoverCleanup = null;

  const SVG = {
    // All icons: 16x16, 2px stroke, currentColor, stroke-linecap/join round
    back: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M11 4l-5 4 5 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fwd: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 4l5 4-5 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 3.5v9l7-4.5L5 3.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" fill="currentColor"/><rect x="9" y="3" width="3" height="10" fill="currentColor"/></svg>',
    rev: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M11 12.5v-9l-5 4.5L11 12.5z" fill="currentColor"/></svg>',
    dl: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3.5v8M5 8.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12.5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    pip: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2" y="4" width="12" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="8.5" width="5" height="3.5" rx="0.8" fill="currentColor"/></svg>',
    speed: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 11h10M3 11l2-4 2 4 2-4 2 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    minimize: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    loopStart: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 4v8l7-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    loopEnd: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M11 4v8l-7-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    help: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 5v3M8 10v.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  const CSS = `
    /* ===== Design Tokens ===== */
    :host {
      /* Colors (Dark theme default) */
      --rs-bg: rgba(10,10,12,0.88);
      --rs-bg-hover: rgba(10,10,12,0.95);
      --rs-border: rgba(255,255,255,0.18);
      --rs-border-focus: var(--rs-accent);
      --rs-accent: #bc2a8d;
      --rs-accent-hover: #d633a0;
      --rs-text: #fff;
      --rs-text-dim: rgba(255,255,255,0.7);
      --rs-fill: var(--rs-accent);
      --rs-rail: rgba(255,255,255,0.25);
      --rs-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08);
      /* Geometry */
      --rs-radius: 14px;
      --rs-btn-size: 32px;
      --rs-gap: 8px;
      --rs-pad-x: 14px;
      --rs-pad-y: 8px;
      --rs-timeline-w: clamp(160px, 30vw, 280px);
      --rs-thumb-size: 14px;
      --rs-font: 500 13px/1.2 system-ui, -apple-system, sans-serif;
      /* Motion */
      --rs-transition: 120ms cubic-bezier(0.2, 0, 0, 1);
      /* Z-index */
      --rs-z: 2147483647;
    }

    /* Light theme (auto via prefers-color-scheme) */
    @media (prefers-color-scheme: light) {
      :host {
        --rs-bg: rgba(250,250,252,0.92);
        --rs-bg-hover: rgba(255,255,255,0.98);
        --rs-border: rgba(0,0,0,0.12);
        --rs-text: #1c1c1e;
        --rs-text-dim: rgba(0,0,0,0.5);
        --rs-rail: rgba(0,0,0,0.18);
        --rs-shadow: 0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
      }
    }

    /* Explicit light theme (via data-theme="light") */
    :host([data-theme="light"]) {
      --rs-bg: rgba(250,250,252,0.92);
      --rs-bg-hover: rgba(255,255,255,0.98);
      --rs-border: rgba(0,0,0,0.12);
      --rs-text: #1c1c1e;
      --rs-text-dim: rgba(0,0,0,0.5);
      --rs-rail: rgba(0,0,0,0.18);
      --rs-shadow: 0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
    }

    /* Explicit dark theme (via data-theme="dark") */
    :host([data-theme="dark"]) {
      --rs-bg: rgba(10,10,12,0.88);
      --rs-bg-hover: rgba(10,10,12,0.95);
      --rs-border: rgba(255,255,255,0.18);
      --rs-text: #fff;
      --rs-text-dim: rgba(255,255,255,0.7);
      --rs-rail: rgba(255,255,255,0.25);
      --rs-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      :host { --rs-transition: 0ms; }
    }

    /* ===== Base ===== */
    :host { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: var(--rs-z); }

    .pill, .chip {
      position: fixed;
      font: var(--rs-font);
      color: var(--rs-text);
      background: var(--rs-bg);
      border: 1px solid var(--rs-border);
      border-radius: var(--rs-radius);
      backdrop-filter: blur(8px);
      box-shadow: var(--rs-shadow);
      user-select: none;
      transition: background var(--rs-transition), border-color var(--rs-transition), box-shadow var(--rs-transition);
    }

    .pill:hover, .chip:hover {
      background: var(--rs-bg-hover);
      border-color: rgba(255,255,255,0.25);
    }

    .pill {
      left: 50%; bottom: 92px; transform: translateX(-50%);
      display: flex; align-items: center; gap: var(--rs-gap);
      padding: var(--rs-pad-y) var(--rs-pad-x); cursor: grab;
    }

    .pill.dragging { cursor: grabbing; transition: none; }

    .chip {
      left: 50%; bottom: 92px; transform: translateX(-50%);
      display: flex; align-items: center; gap: calc(var(--rs-gap) - 2px);
      padding: calc(var(--rs-pad-y) - 1px) calc(var(--rs-pad-x) + 2px); cursor: pointer;
    }

    /* Compact mode styling */
    .pill.compact {
      width: 100px;
      justify-content: space-between;
      padding: var(--rs-pad-y) calc(var(--rs-pad-x) / 2);
    }
    .pill.compact .track { display: none; }
    .pill.compact .time { display: none; }
    .pill.compact .speed { width: auto; min-width: auto; font-size: 11px; }
    .pill.compact button { width: 24px; height: 24px; }
    .chip.compact { width: 70px; justify-content: space-between; }
    .chip.compact .chipText { font-size: 11px; }





    .hidden { display: none !important; }

    button {
      all: unset;
      display: flex; align-items: center; justify-content: center;
      width: var(--rs-btn-size); height: var(--rs-btn-size);
      border-radius: 999px; cursor: pointer; color: var(--rs-text);
      box-sizing: border-box;
      transition: background var(--rs-transition), color var(--rs-transition), transform var(--rs-transition);
    }

    button:not(:disabled):hover {
      background: var(--rs-bg-hover);
      transform: scale(1.04);
    }

    button:not(:disabled):active {
      transform: scale(0.96);
      transition-duration: 40ms;
    }

    button:focus-visible {
      outline: 2px solid var(--rs-accent);
      outline-offset: 2px;
    }

    button:disabled { opacity: 0.4; cursor: not-allowed; }

    button.on { background: var(--rs-accent); color: var(--rs-text); }
    button.on:hover { background: var(--rs-accent-hover); }

    .speed { font-variant-numeric: tabular-nums; min-width: 44px; text-align: center; }

    .time { font-variant-numeric: tabular-nums; color: var(--rs-text-dim);
      white-space: nowrap; padding: 0 4px; }

    .track {
      position: relative; width: var(--rs-timeline-w); height: 24px;
      display: flex; align-items: center; cursor: pointer;
    }

    .rail {
      position: relative; width: 100%; height: 4px; border-radius: 999px;
      background: var(--rs-rail); overflow: visible;
    }

    .buffer {
      position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
      background: rgba(255,255,255,0.15); border-radius: 999px;
      pointer-events: none;
    }

    .fill {
      position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
      background: var(--rs-fill); border-radius: 999px;
      transition: width 0.1s linear;
    }

    .thumb {
      position: absolute; top: 50%; transform: translate(-50%, -50%);
      width: var(--rs-thumb-size); height: var(--rs-thumb-size);
      background: var(--rs-fill); border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      opacity: 0; pointer-events: none;
      transition: opacity var(--rs-transition), transform var(--rs-transition);
    }

    .track:hover .thumb, .track:focus-within .thumb {
      opacity: 1;
    }

    .track.dragging .thumb {
      opacity: 1; transform: translate(-50%, -50%) scale(1.3);
    }

    .track.disabled { opacity: 0.35; pointer-events: none; }

    /* Compact mode */
    .pill.compact {
      width: 100px;
      justify-content: space-between;
      padding: var(--rs-pad-y) calc(var(--rs-pad-x) / 2);
    }
    .pill.compact .track { display: none; }
    .pill.compact .time { display: none; }
    .pill.compact .speed { width: auto; min-width: auto; font-size: 11px; }
    .pill.compact button { width: 24px; height: 24px; }
    .chip.compact { width: 70px; justify-content: space-between; }
    .chip.compact .chipText { font-size: 11px; }

    /* Overflow menu (shown in compact mode) */
    .overflow-menu {
      position: absolute;
      bottom: calc(100% + 8px);
      right: 0;
      background: var(--rs-bg);
      border: 1px solid var(--rs-border);
      border-radius: var(--rs-radius);
      box-shadow: var(--rs-shadow);
      backdrop-filter: blur(8px);
      padding: 6px;
      min-width: 120px;
      z-index: 51;
      animation: rs-pop-in var(--rs-transition) ease-out;
      pointer-events: none;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity var(--rs-transition), transform var(--rs-transition);
    }
    .overflow-menu.open {
      pointer-events: auto;
      opacity: 1;
      transform: translateY(0);
    }
    .overflow-item {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 8px 10px; border-radius: 6px;
      background: transparent; border: none; color: var(--rs-text);
      font: var(--rs-font); font-size: 13px; cursor: pointer;
      text-align: left;
    }
    .overflow-item:hover, .overflow-item:focus {
      background: var(--rs-bg-hover);
    }
    .overflow-item:focus-visible {
      outline: 2px solid var(--rs-accent); outline-offset: -2px;
    }



    /* Compact mode */
    .pill.compact {
      width: 100px;
      justify-content: space-between;
      padding: var(--rs-pad-y) calc(var(--rs-pad-x) / 2);
    }
    .pill.compact .track { display: none; }
    .pill.compact .time { display: none; }
    .pill.compact .speed { width: auto; min-width: auto; font-size: 11px; }
    .pill.compact button { width: 24px; height: 24px; }
    .chip.compact { width: 70px; justify-content: space-between; }
    .chip.compact .chipText { font-size: 11px; }

    /* Overflow menu (shown in compact mode) */
    .overflow-menu {
      position: absolute;
      bottom: calc(100% + 8px);
      right: 0;
      background: var(--rs-bg);
      border: 1px solid var(--rs-border);
      border-radius: var(--rs-radius);
      box-shadow: var(--rs-shadow);
      backdrop-filter: blur(8px);
      padding: 6px;
      min-width: 120px;
      z-index: 51;
      animation: rs-pop-in var(--rs-transition) ease-out;
      pointer-events: none;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity var(--rs-transition), transform var(--rs-transition);
    }
    .overflow-menu.open {
      pointer-events: auto;
      opacity: 1;
      transform: translateY(0);
    }
    .overflow-item {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 8px 10px; border-radius: 6px;
      background: transparent; border: none; color: var(--rs-text);
      font: var(--rs-font); font-size: 13px; cursor: pointer;
      text-align: left;
    }
    .overflow-item:hover, .overflow-item:focus {
      background: var(--rs-bg-hover);
    }
    .overflow-item:focus-visible {
      outline: 2px solid var(--rs-accent); outline-offset: -2px;
    }



    /* Tooltip for timeline preview */
    .tooltip {
      position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
      margin-bottom: 6px; padding: 4px 8px; border-radius: 6px;
      background: rgba(0,0,0,0.85); color: #fff; font-size: 11px;
      white-space: nowrap; pointer-events: none; opacity: 0;
      transition: opacity var(--rs-transition);
      z-index: 10;
    }

    .tooltip img {
      width: 160px; height: 90px; object-fit: cover; border-radius: 4px;
      margin-top: 4px; display: block;
    }

    .track:hover .tooltip { opacity: 1; }

    /* Download progress ring */
    .dl-progress {
      position: absolute; inset: 0; border-radius: 50%;
      transform: rotate(-90deg); pointer-events: none;
    }

    .dl-progress circle {
      fill: none; stroke: var(--rs-accent); stroke-width: 2.5;
      stroke-linecap: round; stroke-dasharray: 88; stroke-dashoffset: 88;
      transition: stroke-dashoffset 0.2s linear;
      r: 14; cx: 16; cy: 16;
    }

    /* Downloading state on download button */
    button.downloading {
      position: relative;
    }

    button.downloading .dl-ring {
      position: absolute; inset: 0; border-radius: 50%;
      transform: rotate(-90deg); pointer-events: none;
    }

    button.downloading .dl-ring circle {
      fill: none; stroke: var(--rs-accent); stroke-width: 2.5;
      stroke-linecap: round; stroke-dasharray: 88;
      stroke-dashoffset: var(--dl-progress, 88);
      transition: stroke-dashoffset 0.2s linear;
      r: 14; cx: 16; cy: 16;
    }

    /* Popover base */
    .popover {
      position: absolute; z-index: 20;
      background: var(--rs-bg); border: 1px solid var(--rs-border);
      border-radius: 10px; padding: 6px;
      box-shadow: var(--rs-shadow);
      backdrop-filter: blur(8px);
      min-width: 160px;
      animation: rs-pop-in var(--rs-transition) ease-out;
    }

    @keyframes rs-pop-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .popover::before {
      content: '';
      position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
      border: 6px solid transparent; border-bottom-color: var(--rs-border);
    }

    .popover-header {
      font-size: 11px; font-weight: 600; color: var(--rs-text-dim);
      text-transform: uppercase; letter-spacing: 0.5px;
      padding: 4px 8px 2px; margin: -6px -6px 4px;
    }

    .popover-list { list-style: none; margin: 0; padding: 0; }

    .popover-item {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; padding: 8px 12px; border-radius: 6px;
      background: transparent; border: none; color: var(--rs-text);
      font: var(--rs-font); font-size: 13px; cursor: pointer;
      text-align: left; gap: 8px;
    }

    .popover-item:hover, .popover-item:focus {
      background: var(--rs-bg-hover);
    }

    .popover-item:focus-visible {
      outline: 2px solid var(--rs-accent); outline-offset: -2px;
    }

    .popover-item.active { color: var(--rs-accent); font-weight: 600; }

    .popover-item .check { display: none; }
    .popover-item.active .check { display: inline; color: var(--rs-accent); }

    .popover-item kbd {
      font-size: 11px; padding: 1px 5px; border-radius: 4px;
      background: var(--rs-rail); color: var(--rs-text-dim);
      font-family: inherit; margin-left: 8px;
    }

    /* Segmented control (for reverse) */
    .segmented {
      display: inline-flex; background: var(--rs-rail);
      border-radius: 999px; padding: 2px; gap: 2px;
    }

    .segmented-btn {
      all: unset; padding: 6px 14px; border-radius: 999px;
      font: var(--rs-font); font-size: 12px; color: var(--rs-text-dim);
      cursor: pointer; transition: all var(--rs-transition);
      white-space: nowrap;
    }

    .segmented-btn:hover { color: var(--rs-text); background: rgba(255,255,255,0.1); }

    .segmented-btn.active {
      background: var(--rs-accent); color: var(--rs-text);
      box-shadow: 0 2px 8px rgba(188,42,141,0.3);
    }

    .segmented-btn:focus-visible {
      outline: 2px solid var(--rs-accent); outline-offset: 2px;
    }

    /* Shortcuts overlay */
    .shortcuts-overlay {
      position: fixed; inset: 0; z-index: 50;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
      animation: rs-fade-in var(--rs-transition) ease-out;
    }

    .shortcuts-panel {
      background: var(--rs-bg); border: 1px solid var(--rs-border);
      border-radius: 14px; padding: 24px; width: 90%; max-width: 360px;
      box-shadow: var(--rs-shadow); backdrop-filter: blur(8px);
      animation: rs-pop-in var(--rs-transition) ease-out;
    }

    .shortcuts-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px; padding-bottom: 12px;
      border-bottom: 1px solid var(--rs-border);
    }

    .shortcuts-title {
      font: 600 16px/1 var(--rs-font); color: var(--rs-text);
    }

    .shortcuts-close {
      all: unset; width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: var(--rs-text-dim); cursor: pointer;
      transition: all var(--rs-transition);
    }

    .shortcuts-close:hover { background: var(--rs-bg-hover); color: var(--rs-text); }

    .shortcuts-grid {
      display: grid; grid-template-columns: auto 1fr; gap: 10px 16px;
    }

    .shortcut-key {
      font: 500 12px/1 var(--rs-font); color: var(--rs-text);
      background: var(--rs-rail); padding: 4px 8px; border-radius: 6px;
      text-align: right; min-width: 80px;
    }

    .shortcut-desc {
      font: 400 13px/1 var(--rs-font); color: var(--rs-text-dim);
    }

    @keyframes rs-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Help button */
    .help-btn {
      width: var(--rs-btn-size); height: var(--rs-btn-size);
      border-radius: 999px; cursor: pointer; color: var(--rs-text);
      display: flex; align-items: center; justify-content: center;
      transition: all var(--rs-transition);
    }

    .help-btn:hover { background: var(--rs-bg-hover); transform: scale(1.04); }
    .help-btn:focus-visible { outline: 2px solid var(--rs-accent); outline-offset: 2px; }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      :host { --rs-transition: 0ms; }
    }
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
    // Theme change: apply immediately
    if (changes.controllerTheme) applyTheme(changes.controllerTheme.newValue);
    // Toggling auto-advance at runtime takes effect on the live reel:
    // on restores the loop-off behavior, off gives the loop back.
    if (video && changes.autoAdvance) {
      if (changes.autoAdvance.newValue) {
        stripLocks(video);
      } else if (video.loop !== origLoop) {
        try {
          video.loop = origLoop;
        } catch (err) {
          // Read-only loop flag: leave it.
        }
      }
    }
  });

  function isReelsPage() {
    const p = location.pathname || '';
    return p === '/reels' || p === '/reels/' || p.startsWith('/reels/') || p.startsWith('/reel/');
  }

  // Pill + media tools show wherever a video plays. Reels-only behavior is
  // gated separately: auto-advance checks isReelsPage(), and
  // navigation itself lives in reels.js.
  function controllerActive() {
    return settings.enabled && settings.controllerEnabled;
  }

  function fmt(t) {
    if (!isFinite(t) || t < 0) return '--:--';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // The centered, viewport-sized video is the one the user is watching.
  // Feed preloads neighbors, so never just grab the first <video>.
  // Prefer the one actually playing: a paused preload can sit dead-center.
  // Ended videos keep only a small penalty — the just-finished centered reel
  // is exactly what the advance path needs to stay bound to.
  function detectVideo() {
    const midY = window.innerHeight / 2;
    let best = null;
    let bestScore = Infinity;
    document.querySelectorAll('video').forEach((v) => {
      const r = v.getBoundingClientRect();
      if (r.height < 200 || r.width < 150) return;
      let score = Math.abs(r.top + r.height / 2 - midY);
      if (v.paused) score += window.innerHeight * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    });
    return best;
  }

  function setMediaHandlers(on) {
    // Puts working prev/next buttons INTO the PiP window and OS media OSD,
    // and keeps hardware keys alive when the PiP window (not the tab) is focused.
    try {
      if (!('mediaSession' in navigator)) return;
      if (on) {
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          window.dispatchEvent(new CustomEvent('reelscroll:prev', { detail: { source: 'media-session' } }));
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          window.dispatchEvent(new CustomEvent('reelscroll:next', { detail: { source: 'media-session' } }));
        });
        // Media keys map to Reels turns; on other pages the events no-op in reels.js.
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'Instagram Video', artist: 'ReelScroll' });
      } else {
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      }
    } catch (err) {
      // Media Session unsupported here: PiP buttons just won't appear.
    }
  }

  function bindVideo(v) {
    if (v === video) return;
    const keepFloating = wantPip;
    unbindVideo();
    video = v;
    stopReverse();
    // Reset loop range when video changes
    loopStart = null;
    loopEnd = null;
    loopActive = false;
    // A pending advance survives rebinds; pumpAdvance drops it once the
    // centered video is a different reel. Only a truly empty feed cancels.
    if (!v) pendingAdvance = null;
    advancedFor = null;
    lastTime = v ? v.currentTime || 0 : 0;
    lastSrc = v ? v.currentSrc : '';
    setMediaHandlers(!!v);
    if (!video) return;
    origLoop = video.loop;
    stripLocks(video);
    bindMarkAt = performance.now();
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('enterpictureinpicture', onPipEnter);
    video.addEventListener('leavepictureinpicture', onPipLeave);
    applyRate(video);
    if (keepFloating) followPip();
    paint();
  }

  function unbindVideo() {
    if (!video) return;
    if (video.loop !== origLoop) {
      try {
        video.loop = origLoop;
      } catch (err) {
        // Read-only loop flag on this player: leave it.
      }
    }
    video.removeEventListener('loadedmetadata', onMeta);
    video.removeEventListener('play', onPlay);
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('timeupdate', onTime);
    video.removeEventListener('enterpictureinpicture', onPipEnter);
    video.removeEventListener('leavepictureinpicture', onPipLeave);
    setMediaHandlers(false);
    video = null;
  }

  // Instagram ships reels with loop + disablepictureinpicture (+ controlslist).
  // A looping video never fires `ended`, and a PiP-blocked one refuses the float.
  // On Reels pages with auto-advance we take the loop off so the reel can finish;
  // feed/story loops stay intact. The PiP locks come off whenever we're bound
  // (React re-adds attrs, tick re-strips).
  function stripLocks(v) {
    try {
      v.removeAttribute('disablepictureinpicture');
      v.removeAttribute('controlslist');
      if (settings.autoAdvance && isReelsPage() && v.loop) v.loop = false;
    } catch (err) {
      // Player ignores it: the watchdog still catches the wrap.
    }
  }

  // Usable length: finite duration normally; seekable end if IG ever serves
  // a stream with Infinity duration; NaN when nothing is known yet.
  function effectiveDuration(v) {
    if (isFinite(v.duration) && v.duration > 0) return v.duration;
    try {
      if (v.seekable && v.seekable.length > 0) {
        const end = v.seekable.end(v.seekable.length - 1);
        if (isFinite(end) && end > 0) return end;
      }
    } catch (err) {
      // Seekable unreadable on this player.
    }
    return NaN;
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

  function nearEnd(v) {
    if (!v) return false;
    if (v.ended) return true;
    // A fresh `ended` counts even if IG already replayed the reel underneath us.
    if (endedStamp && endedStamp.src === v.currentSrc && Date.now() - endedStamp.at < 3000) return true;
    const dur = effectiveDuration(v);
    return isFinite(dur) && dur - v.currentTime <= 0.5;
  }

  function scheduleAdvance() {
    // Queue only: pumpAdvance (called from rAF AND timeupdate) does the timed
    // dispatch. Polled state survives video-element swaps that would kill a timer.
    if (!settings.autoAdvance || !isReelsPage() || !video) return;
    if (pendingAdvance && pendingAdvance.el === video) return;
    pendingAdvance = { el: video, src: video.currentSrc, fireAt: Date.now() + 800, retried: false };
  }

  function clearEndedStampFor(src) {
    if (endedStamp && (!src || endedStamp.src === src)) endedStamp = null;
  }

  function pumpAdvance() {
    if (!pendingAdvance || !settings.autoAdvance || !isReelsPage() || !video) return;
    // Element identity first (same-element src swaps keep it), src second
    // (a reused element showing a new reel cancels it). Empty src never mismatches.
    if (video !== pendingAdvance.el ||
        (video.currentSrc && pendingAdvance.src && video.currentSrc !== pendingAdvance.src)) {
      pendingAdvance = null; // centered reel is a different video: previous turn is moot
      return;
    }
    if (Date.now() < pendingAdvance.fireAt || !nearEnd(video)) return;
    window.dispatchEvent(new CustomEvent('reelscroll:next', {
      detail: { source: pendingAdvance.retried ? 'auto-advance-retry' : 'auto-advance' }
    }));
    clearEndedStampFor(video.currentSrc); // a later back-nav to this reel must not re-fire
    if (!pendingAdvance.retried) {
      // Cooldown may have eaten that turn: one retry after it expires.
      // After a real nav the centered element differs, so this can't double-fire.
      pendingAdvance.retried = true;
      pendingAdvance.fireAt = Date.now() + 2000;
    } else {
      pendingAdvance = null;
      advancedFor = null; // both turns eaten (e.g. maxed-out cooldown): let the watchdog re-queue
    }
  }

  // End watchdog: catches reels whose `ended` never fires (loop, MSE, races).
  // Runs from rAF while the tab is visible AND from `timeupdate` while it isn't
  // (background tab + PiP: rAF stops, media events keep flowing).
  // Fires once per reel; re-arms when the user scrubs back away from the end.
  function checkNearEnd() {
    if (!video || !settings.autoAdvance) return;
    if (!isReelsPage()) return; // feed/other pages: no auto-advance, no watchdog
    pumpAdvance(); // first: an `ended`-queued turn must fire even with unknown duration
    const dur = effectiveDuration(video);
    if (!isFinite(dur)) return;
    const key = video.currentSrc + '#' + dur;
    const remaining = dur - video.currentTime;
    if (remaining > 0.5) {
      advancedFor = null;
      pendingAdvance = null;
      clearEndedStampFor(video.currentSrc);
    } else if (remaining <= 0.4 && reverseRate === 0 && advancedFor !== key) {
      advancedFor = key;
      scheduleAdvance();
    }
    pumpAdvance();
  }

  function onTime() {
    if (!video) return;
    // Same element showing a new reel (IG reuse): reset end-tracking first,
    // or the old reel's tail instantly advances the new one.
    if (video.currentSrc !== lastSrc) {
      lastSrc = video.currentSrc;
      lastTime = video.currentTime || 0;
      return;
    }
    const dur = effectiveDuration(video);
    if (!isFinite(dur)) {
      // Unknown length (unreadable stream): a playing video wrapping from well
      // into playback back to ~0 is a loop end. Normal progress re-arms.
      if (video.currentTime > 1) advancedFor = null;
      if (settings.autoAdvance && reverseRate === 0 && !video.paused &&
          Date.now() - lastSeekAt > 1000 &&
          lastTime > 2 && video.currentTime < 1) {
        const key = video.currentSrc + '#stream';
        if (advancedFor !== key) {
          advancedFor = key;
          scheduleAdvance();
        }
      }
      lastTime = video.currentTime;
      pumpAdvance();
      return;
    }
    // Loop-wrap catch: time jumped backwards from the very end, so the reel
    // restarted instead of ending — advance instead of replaying.
    // (Our own seeks are excluded: they set lastSeekAt.)
    if (settings.autoAdvance && reverseRate === 0 && Date.now() - lastSeekAt > 1000 &&
        lastTime - video.currentTime > 1) {
      if (isFinite(dur) && lastTime >= dur - 1.5) {
        const key = video.currentSrc + '#' + dur;
        if (advancedFor !== key) {
          advancedFor = key;
          scheduleAdvance();
        }
      } else {
        advancedFor = null; // manual seek backwards: re-arm
        pendingAdvance = null;
        clearEndedStampFor(video.currentSrc);
      }
    }
    lastTime = video.currentTime;
    checkNearEnd();
  }

  function onEnded() {
    // Stamp it: IG replays fast, and by the time our delay fires the reel may
    // already show currentTime ~0 again. The stamp keeps the advance valid.
    if (video) endedStamp = { src: video.currentSrc, at: Date.now() };
    scheduleAdvance();
    paint();
  }

  function onPipEnter() {
    wantPip = true;
    paint();
  }

  function onPipLeave() {
    // A migration closes the old float on purpose, and a replaced float already
    // has a successor: only a real close with nothing floating drops the wish.
    if (!pipFollow && !document.pictureInPictureElement) wantPip = false;
    paint();
  }

  // Move the floating window onto the newly centered reel.
  // Request FIRST without closing: when Chrome allows it (key/PiP-button
  // navs carry a gesture) the old float is replaced seamlessly. Timer-driven
  // auto-advance has no gesture to spend, so that path closes the float instead.
  async function followPip() {
    if (!video || !wantPip || typeof video.requestPictureInPicture !== 'function') return;
    const my = ++pipGen;
    pipFollow = true;
    try {
      await video.requestPictureInPicture();
      if (my === pipGen) wantPip = true;
    } catch (err) {
      if (my !== pipGen) return; // superseded by a newer migration
      try {
        await document.exitPictureInPicture().catch(() => {});
      } catch (err2) {
        // Nothing floating: nothing to close.
      }
      wantPip = false;
    } finally {
      if (my === pipGen) pipFollow = false;
    }
    paint();
  }

  async function togglePip() {
    pipGen++; // invalidate any in-flight followPip: the user's click wins
    if (video) stripLocks(video); // React may have re-added the PiP block since the tick
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        wantPip = false;
      } else if (video && typeof video.requestPictureInPicture === 'function' && !video.disablePictureInPicture) {
        await video.requestPictureInPicture();
        wantPip = true;
      }
    } catch (err) {
      // PiP refused (not allowed on this video, no gesture): stay inline.
      wantPip = !!document.pictureInPictureElement;
    }
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

  // Best file URL for the download button. A direct MP4 src is the whole file
  // and wins outright; MSE videos expose only a blob:, so the URL must come
  // from the network entries fetched since this reel bound to the element
  // (a per-reel baseline, NOT clearResourceTimings — that wipes the shared
  // buffer and can erase the very entries we need).
  //
  // IG's CDN is segment-based: every request URL carries &bytestart=N and
  // &byteend=M, and fetching the segment URL back returns just that bytes
  // range — a fragment with no ftyp/moov, which plays as nothing (the classic
  // "downloaded but contains nothing" file). Verified live: the same signed
  // asset path WITHOUT those two params serves the whole MP4 (200, ftyp at
  // byte 4). So entries are grouped per asset path (query ignored), audio
  // lanes are skipped — the audio asset carries &efg=...heaac..., a base64
  // tag naming the codec — and the most recently active video asset wins.
  // The Range/0- header is sent next anyway because some CDNs require it;
  // IG ignores the header when bytestart params exist but honours it here.
  function pickVideoFileUrl() {
    if (!video) return null;
    const src = video.currentSrc || video.src || '';
    if (/^https:/.test(src)) return { url: src, whole: true };
    const entries = performance.getEntriesByType('resource').filter((e) =>
      /^https:/.test(e.name) && /\.mp4(\?|$)/.test(e.name) &&
      e.startTime >= bindMarkAt - 250);
    if (!entries.length) return null;
    const assets = new Map();
    for (const e of entries) {
      let u;
      try { u = new URL(e.name); } catch (err) { continue; }
      const asset = u.origin + u.pathname;
      let rec = assets.get(asset);
      if (!rec) { rec = { last: 0, name: e.name, audio: false }; assets.set(asset, rec); }
      if (e.startTime > rec.last) { rec.last = e.startTime; rec.name = e.name; }
      const efg = u.searchParams.get('efg') || '';
      try {
        if (/heaac|aac/i.test(atob(efg))) rec.audio = true;
      } catch (err) {
        // Non-base64 efg: assume video, the ftyp check guards the save.
      }
    }
    const vids = [...assets.values()].filter((a) => !a.audio);
    if (!vids.length) return null;
    vids.sort((a, b) => b.last - a.last);
    const fullUrl = new URL(vids[0].name);
    fullUrl.searchParams.delete('bytestart');
    fullUrl.searchParams.delete('byteend');
    return { url: fullUrl.href, whole: false };
  }

  function fileNameFor(url) {
    let name = '';
    try {
      name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    } catch (err) {
      // Malformed URL: fall back to a generic name.
    }
    name = name.replace(/[^\w.\-]+/g, '_').slice(-60) || 'instagram-video.mp4';
    if (!/\.mp4$/i.test(name)) name += '.mp4';
    return name;
  }

  // The service worker hands the URL to Chrome's downloader, so no CORS and
  // no extra host permissions are involved.
  function flashDl(good, note, progress) {
    if (!els.dl) return;
    // Handle progress ring (0-100)
    if (typeof progress === 'number' && progress >= 0 && progress <= 100) {
      const circumference = 2 * Math.PI * 14; // r=14
      const offset = circumference * (1 - progress / 100);
      els.dl.style.setProperty('--dl-progress', offset);
      els.dl.classList.add('downloading');
    } else {
      els.dl.classList.remove('downloading');
      els.dl.style.removeProperty('--dl-progress');
    }
    if (typeof progress !== 'number') {
      els.dl.classList.toggle('on', !!good);
      if (note) {
        els.dl.title = note;
        showToast(note, good);
      }
      clearTimeout(flashDl._t);
      flashDl._t = setTimeout(() => {
        if (els.dl) {
          els.dl.classList.remove('on');
          els.dl.title = 'Download video';
        }
      }, 1500);
    }
  }

  // Centralized toast system for download feedback
  function showToast(message, isSuccess = true) {
    let toast = document.getElementById('reelscroll-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'reelscroll-toast';
      toast.style.cssText = `
        position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%);
        padding: 10px 16px; border-radius: 8px;
        background: rgba(10,10,12,0.95); border: 1px solid rgba(255,255,255,0.18);
        backdrop-filter: blur(8px); color: #fff; font: 500 13px/1 system-ui;
        box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08);
        z-index: 2147483647; opacity: 0; transition: opacity 120ms ease-out;
        pointer-events: none; max-width: 90vw; text-align: center;
      `;
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.borderColor = isSuccess ? '#bc2a8d' : '#ff2d55';
    toast.style.opacity = '1';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  async function downloadVideo() {
    if (!video) return;
    const pick = pickVideoFileUrl();
    if (!pick) {
      flashDl(false, 'Not downloadable');
      return;
    }

    const filename = fileNameFor(pick.url);

    // Classify error for actionable feedback
    const classifyError = (err, res) => {
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) return { type: 'network', msg: 'Network error — check connection' };
      if (res && res.status === 0) return { type: 'network', msg: 'Network error — offline or blocked' };
      if (res && res.status === 403) return { type: 'cors', msg: 'Blocked by CORS — try again' };
      if (res && res.status === 404) return { type: 'notfound', msg: 'Video not found on server' };
      if (res && res.status >= 500) return { type: 'server', msg: 'Server error — try again later' };
      return { type: 'unknown', msg: err?.message || 'Download failed' };
    };

    // Format bytes/speed for ETA display
    const formatSpeed = (bytesPerSec) => {
      if (bytesPerSec >= 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
      if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
      return bytesPerSec + ' B/s';
    };

    // Format ETA
    const formatETA = (seconds) => {
      if (!isFinite(seconds) || seconds < 0) return '—';
      if (seconds < 60) return Math.ceil(seconds) + 's';
      const m = Math.floor(seconds / 60);
      const s = Math.ceil(seconds % 60);
      return m + 'm ' + s + 's';
    };

    const looksLikeMp4 = async (blob) => {
      const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      return head.length === 8 && String.fromCharCode(...head.slice(4)) === 'ftyp';
    };

    if (!pick.whole) {
      const attempts = [
        () => fetch(pick.url, { headers: { Range: 'bytes=0-' } }),
        () => fetch(pick.url)
      ];
      for (const attempt of attempts) {
        try {
          const startTime = performance.now();
          const res = await attempt();

          // Progress tracking for large files
          const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
          let blob;
          if (contentLength > 0 && res.body) {
            // Stream with progress
            const reader = res.body.getReader();
            const chunks = [];
            let received = 0;
            let lastUpdate = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              received += value.length;
              const now = performance.now();
              if (now - lastUpdate > 200) { // Throttle updates
                const elapsed = (now - startTime) / 1000;
                const speed = elapsed > 0 ? received / elapsed : 0;
                const eta = contentLength > received && speed > 0 ? (contentLength - received) / speed : 0;
                const pct = Math.min(100, (received / contentLength) * 100);
                flashDl(false, '', pct);
                // Update title with speed/ETA
                els.dl.title = `Downloading… ${formatSpeed(speed)} • ETA: ${formatETA(eta)}`;
                lastUpdate = now;
              }
            }
            blob = new Blob(chunks, { type: res.headers.get('content-type') || 'video/mp4' });
          } else {
            blob = res.ok ? await res.blob() : null;
          }

          const type = res.headers.get('content-type') || '';
          if (!res.ok || !blob) {
            const errInfo = classifyError(new Error('HTTP ' + res.status), res);
            throw Object.assign(new Error(errInfo.msg), { type: errInfo.type });
          }

          if (blob.size <= 60000 ||
              !(type.includes('video/') || type.includes('octet-stream')) ||
              !(await looksLikeMp4(blob))) {
            throw Object.assign(new Error('Invalid video file'), { type: 'validation' });
          }

          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          document.documentElement.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);
          flashDl(true, `Saved: ${filename}`);
          return;

        } catch (err) {
          // Classify and re-throw for outer handler
          const errInfo = classifyError(err, err.response);
          throw Object.assign(err, { type: errInfo.type, userMsg: errInfo.msg });
        }
      }
    }

    // Worker fallback
    try {
      const startTime = performance.now();
      let progressInterval;

      // Simulate progress for worker route (unknown size)
      const animateProgress = () => {
        let p = 10;
        progressInterval = setInterval(() => {
          p = Math.min(90, p + Math.random() * 5);
          flashDl(false, '', p);
        }, 300);
      };

      animateProgress();

      chrome.runtime.sendMessage({ type: 'REELS_DOWNLOAD', url: pick.url }, (res) => {
        clearInterval(progressInterval);
        flashDl(false, '', 100); // Complete the ring
        setTimeout(() => flashDl(false, ''), 500); // Clear progress

        if (chrome.runtime.lastError) {
          flashDl(false, 'Download failed — extension busy');
          return;
        }
        if (res && res.ok) {
          flashDl(true, `Saved: ${filename}`);
        } else {
          const errInfo = classifyError(new Error('Worker download failed'), null);
          flashDl(false, errInfo.msg);
        }
      });
    } catch (err) {
      const errInfo = classifyError(err, null);
      flashDl(false, errInfo.msg);
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
    try {
      video.pause();
    } catch (err) {
      return; // unable to take over playback: leave reverse off
    }
    reverseRate = rate;
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
    lastSeekAt = Date.now();
    pendingAdvance = null; // manual seek cancels a queued advance; watchdog re-queues at a fresh end
    advancedFor = null;
    clearEndedStampFor(video.currentSrc);
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
    lastSeekAt = Date.now();
    pendingAdvance = null;
    advancedFor = null;
    clearEndedStampFor(video.currentSrc);
    const next = Math.max(0, Math.min(video.duration - 0.05, video.currentTime + d));
    try {
      video.currentTime = next;
    } catch (err) {
      // Ignore out-of-range seeks.
    }
    paint();
  }

  function setPlaybackRate(rate) {
    chrome.storage.sync.set({ playbackRate: rate });
    settings.playbackRate = rate;
    stopReverse();
    if (video && !video.paused) applyRate(video);
    buildSpeedPopover(); // refresh active state
    paint();
  }

  function buildSpeedPopover() {
    if (!els.speedList) return;
    els.speedList.innerHTML = SPEEDS.map(s => `
      <li class="popover-item${s === settings.playbackRate ? ' active' : ''}"
          role="option"
          data-speed="${s}"
          tabindex="-1">
        ${s}x
      </li>
    `).join('');
    // Attach click listeners
    els.speedList.querySelectorAll('.popover-item').forEach(item => {
      item.addEventListener('click', () => {
        setPlaybackRate(parseFloat(item.dataset.speed));
        closeSpeedPopover();
      });
    });
  }

  function toggleSpeedPopover(e) {
    e.stopPropagation();
    const myGen = ++speedPopoverGen;
    const isOpen = !els.speedPopover.classList.contains('hidden');
    closeAllPopovers();
    if (isOpen) return;
    buildSpeedPopover();
    els.speedPopover.classList.remove('hidden');
    els.speed.setAttribute('aria-expanded', 'true');
    // Focus first item
    const active = els.speedList.querySelector('.popover-item.active');
    if (active) active.focus();
    // Close on outside click
    const closeOnClick = (ev) => {
      if (!els.speedPopover.contains(ev.target) && ev.target !== els.speed) {
        closeSpeedPopover();
        document.removeEventListener('click', closeOnClick);
      }
    };
    document.addEventListener('click', closeOnClick);
    // Keyboard navigation
    const keyHandler = (ev) => {
      const items = [...els.speedList.querySelectorAll('.popover-item')];
      const idx = items.findIndex(i => i === document.activeElement);
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        items[(idx + 1) % items.length].focus();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        items[(idx - 1 + items.length) % items.length].focus();
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (document.activeElement.classList.contains('popover-item')) {
          document.activeElement.click();
        }
      } else if (ev.key === 'Escape') {
        closeSpeedPopover();
      }
    };
    els.speedPopover.addEventListener('keydown', keyHandler);
    const cleanup = () => {
      els.speedPopover.removeEventListener('keydown', keyHandler);
      document.removeEventListener('click', closeOnClick);
    };
    // Store cleanup for gen tracking
    speedPopoverCleanup = cleanup;
  }

  function closeSpeedPopover() {
    if (speedPopoverCleanup) speedPopoverCleanup();
    speedPopoverCleanup = null;
    els.speedPopover.classList.add('hidden');
    els.speed.setAttribute('aria-expanded', 'false');
  }

  function closeAllPopovers() {
    closeSpeedPopover();
  }

  function setReverse(rate) {
    // 0 = off, 1 = -1x, 2 = -2x
    if (rate === 0) {
      stopReverse();
    } else if (rate === 1 || rate === 2) {
      startReverse(rate);
    }
    updateRevSegments();
    paint();
  }

  function updateRevSegments() {
    els.revSegments.forEach(btn => {
      const r = parseInt(btn.dataset.rev, 10);
      const active = (reverseRate === r);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active);
    });
  }

  function cycleReverse() {
    // off -> -1x -> -2x -> off
    if (reverseRate === 0) startReverse(1);
    else if (reverseRate === 1) startReverse(2);
    else stopReverse();
    updateRevSegments();
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
    const dur = video ? effectiveDuration(video) : NaN;
    const hasMeta = isFinite(dur);
    els.play.innerHTML = video && !video.paused && reverseRate === 0 ? SVG.pause : SVG.play;
    els.play.title = video && !video.paused && reverseRate === 0 ? 'Pause' : 'Play';
    els.play.setAttribute('aria-label', video && !video.paused && reverseRate === 0 ? 'Pause' : 'Play');
    els.time.textContent = video
      ? fmt(video.currentTime) + ' / ' + fmt(dur)
      : '--:-- / --:--';
    const progress = hasMeta ? (video.currentTime / dur * 100) : 0;
    els.fill.style.width = progress + '%';
    if (els.thumb) {
      els.thumb.style.left = progress + '%';
    }
    // Update buffer visualization
    if (els.buffer && video && video.buffered && video.buffered.length > 0) {
      try {
        const bufEnd = video.buffered.end(video.buffered.length - 1);
        if (isFinite(bufEnd) && bufEnd > 0) {
          const bufPercent = (bufEnd / dur * 100);
          els.buffer.style.width = Math.min(100, bufPercent) + '%';
        }
      } catch (err) {
        // buffered not accessible
      }
    }
    els.track.classList.toggle('disabled', !hasMeta);
    if (hasMeta) {
      els.track.setAttribute('aria-valuenow', Math.round(progress));
    }
    els.speed.textContent = settings.playbackRate + 'x';
    els.rev.classList.toggle('on', reverseRate !== 0);
    els.rev.innerHTML = SVG.rev + '<span>' + (reverseRate !== 0 ? '-' + reverseRate + 'x' : 'rev') + '</span>';
    els.pip.classList.toggle('on', !!document.pictureInPictureElement);
    els.chipText.textContent = (reverseRate !== 0 ? '-' + reverseRate + 'x' : settings.playbackRate + 'x');
    els.loopStart.classList.toggle('active', loopActive && loopStart !== null);
    els.loopEnd.classList.toggle('active', loopActive && loopEnd !== null);
  }

  function applyVisibility() {
    if (!els.pill) return;
    const show = controllerActive() && !!video;
    els.pill.classList.toggle('hidden', !show || settings.controllerMini);
    els.chip.classList.toggle('hidden', !show || !settings.controllerMini);
    if (show) applyAnchorPosition();
  }

  function applyAnchorPosition() {
    if (!els.pill || settings.controllerAnchor === 'free') return;
    const anchor = ANCHORS[settings.controllerAnchor] || ANCHORS['bottom-center'];
    Object.assign(els.pill.style, anchor);
  }

  // Snap free position to nearest anchor if within threshold
  function snapToAnchor(pos) {
    const rect = { left: parseFloat(pos.left), top: parseFloat(pos.top) };
    if (isNaN(rect.left) || isNaN(rect.top)) return null;
    let bestAnchor = null;
    let bestDist = Infinity;
    const threshold = 60; // px
    for (const [name, anchor] of Object.entries(ANCHORS)) {
      if (name === 'free') continue;
      // Compute anchor position in viewport coordinates
      const el = els.pill;
      const testStyle = { ...el.style };
      Object.assign(el.style, anchor);
      const r = el.getBoundingClientRect();
      Object.assign(el.style, testStyle); // restore
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(rect.left - cx, rect.top - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestAnchor = { ...anchor, anchor: name };
      }
    }
    if (bestDist < threshold && bestAnchor) return bestAnchor;
    return null;
  }

  // Collision avoidance: detect IG UI elements and nudge pill if overlapping
  function checkCollisions() {
    if (!els.pill || settings.controllerAnchor === 'free') return;
    const pillRect = els.pill.getBoundingClientRect();
    // IG bottom bar, comments sheet, share dialog, etc.
    const avoidSelectors = [
      '[role="dialog"]',           // modals
      '.x1lliihq',                 // bottom nav bar
      '[data-testid="share-sheet"]',
      '._aa4b',                    // comments bottom bar
      '._aagw',                    // action bar
      '[aria-label="Comments"]',
      '[data-bloks-name="bk.components.Footer"]'
    ];
    for (const sel of avoidSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // Check overlap with 16px margin
      const overlap = !(pillRect.right + 16 < r.left ||
                        pillRect.left - 16 > r.right ||
                        pillRect.bottom + 16 < r.top ||
                        pillRect.top - 16 > r.bottom);
      if (overlap) {
        // Nudge pill away: prefer moving up, then left/right
        const dy = r.top - pillRect.bottom - 16;
        const dx = (pillRect.left + pillRect.right) / 2 < window.innerWidth / 2 ? 24 : -24;
        els.pill.style.transform = `translate(${dx}px, ${dy}px)`;
        return true; // nudged
      }
    }
    return false;
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
      '<button data-act="back" title="Back 5s" aria-label="Back 5 seconds">' + SVG.back + '</button>' +
      '<button data-act="play" title="Play/Pause" aria-label="Play or Pause">' + SVG.play + '</button>' +
      '<span class="time" aria-live="polite">--:-- / --:--</span>' +
      '<div class="track" role="slider" aria-label="Video timeline" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">' +
        '<div class="rail">' +
          '<div class="buffer"></div>' +
          '<div class="fill"></div>' +
          '<div class="thumb"></div>' +
          '<div class="tooltip"><img class="thumb-img" style="width:160px;height:90px;object-fit:cover;border-radius:4px;margin-top:4px;display:none;"></div>' +
        '</div>' +
      '</div>' +
      '<button data-act="fwd" title="Forward 5s" aria-label="Forward 5 seconds">' + SVG.fwd + '</button>' +
      '<button data-act="dl" title="Download video" aria-label="Download video">' + SVG.dl +
        '<svg class="dl-ring" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><circle></circle></svg>' +
      '</button>' +
      '<div class="speed-wrap" style="position: relative;">' +
        '<button data-act="speed" class="speed" title="Playback speed" aria-label="Playback speed" aria-haspopup="true" aria-expanded="false">1x</button>' +
        '<div class="popover speed-popover hidden" role="menu" aria-label="Playback speed">' +
          '<div class="popover-header">Playback Speed</div>' +
          '<ul class="popover-list" role="listbox"></ul>' +
        '</div>' +
      '</div>' +
      '<div class="segmented rev-segmented" role="group" aria-label="Reverse playback">' +
        '<button class="segmented-btn" data-rev="0" aria-pressed="true">Off</button>' +
        '<button class="segmented-btn" data-rev="1" aria-pressed="false">-1×</button>' +
        '<button class="segmented-btn" data-rev="2" aria-pressed="false">-2×</button>' +
      '</div>' +
      '<button data-act="pip" title="Picture-in-picture" aria-label="Toggle picture-in-picture">' + SVG.pip + '</button>' +
      '<button data-act="loop-start" title="Loop start" aria-label="Set loop start">' + SVG.loopStart + '</button>' +
      '<button data-act="loop-end" title="Loop end" aria-label="Set loop end">' + SVG.loopEnd + '</button>' +
      '<button data-act="mini" title="Minimize" aria-label="Minimize controller">' + SVG.minimize + '</button>' +
      '<button class="help-btn" data-act="help" title="Keyboard shortcuts" aria-label="Show keyboard shortcuts">' + SVG.help + '</button>' +
      '<button data-act="overflow" title="More options" aria-label="More options" class="overflow-btn">...</button>' +
      '<div class="overflow-menu hidden" role="menu" aria-label="More options">' +
        '<div class="overflow-item" data-act="overflow-speed" aria-label="Playback speed">Speed</div>' +
        '<div class="overflow-item" data-act="overflow-reverse" aria-label="Reverse playback">Reverse</div>' +
        '<div class="overflow-item" data-act="overflow-pip" aria-label="Picture-in-picture">Picture-in-Picture</div>' +
        '<div class="overflow-item" data-act="overflow-mini" aria-label="Minimize controller">Minimize</div>' +
      '</div>';
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
      rail: pill.querySelector('.rail'),
      buffer: pill.querySelector('.buffer'),
      fill: pill.querySelector('.fill'),
      thumb: pill.querySelector('.thumb'),
      tooltip: pill.querySelector('.tooltip'),
      speed: pill.querySelector('[data-act="speed"]'),
      speedPopover: pill.querySelector('.speed-popover'),
      speedList: pill.querySelector('.speed-popover .popover-list'),
      revSegments: pill.querySelectorAll('.rev-segmented .segmented-btn'),
      pip: pill.querySelector('[data-act="pip"]'),
      dl: pill.querySelector('[data-act="dl"]'),
      help: pill.querySelector('[data-act="help"]')
    };

    // Shortcuts overlay (created once)
    const shortcutsOverlay = document.createElement('div');
    shortcutsOverlay.className = 'shortcuts-overlay hidden';
    shortcutsOverlay.innerHTML =
      '<div class="shortcuts-panel" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">' +
        '<div class="shortcuts-header">' +
          '<h2 class="shortcuts-title" id="shortcuts-title">ReelScroll Shortcuts</h2>' +
          '<button class="shortcuts-close" aria-label="Close shortcuts">×</button>' +
        '</div>' +
        '<div class="shortcuts-grid">' +
          '<kbd class="shortcut-key">Space</kbd><span class="shortcut-desc">Play / Pause</span>' +
          '<kbd class="shortcut-key">← / →</kbd><span class="shortcut-desc">Seek ±5s</span>' +
          '<kbd class="shortcut-key">Shift+← / →</kbd><span class="shortcut-desc">Seek ±10s</span>' +
          '<kbd class="shortcut-key">Home / End</kbd><span class="shortcut-desc">Start / End</span>' +
          '<kbd class="shortcut-key">↑ / ↓</kbd><span class="shortcut-desc">Speed up / down</span>' +
          '<kbd class="shortcut-key">R</kbd><span class="shortcut-desc">Cycle reverse</span>' +
          '<kbd class="shortcut-key">P</kbd><span class="shortcut-desc">Toggle PiP</span>' +
          '<kbd class="shortcut-key">D</kbd><span class="shortcut-desc">Download</span>' +
          '<kbd class="shortcut-key">M</kbd><span class="shortcut-desc">Minimize</span>' +
          '<kbd class="shortcut-key">?</kbd><span class="shortcut-desc">Show this help</span>' +
        '</div>' +
      '</div>';
    shadow.appendChild(style);
    shadow.appendChild(pill);
    shadow.appendChild(chip);
    shadow.appendChild(shortcutsOverlay);
    document.documentElement.appendChild(host);

    els.shortcutsOverlay = shortcutsOverlay;
    els.shortcutsClose = shortcutsOverlay.querySelector('.shortcuts-close');

    els = {
      pill,
      chip,
      chipText: chip.querySelector('span'),
      play: pill.querySelector('[data-act="play"]'),
      time: pill.querySelector('.time'),
      track: pill.querySelector('.track'),
      rail: pill.querySelector('.rail'),
      buffer: pill.querySelector('.buffer'),
      fill: pill.querySelector('.fill'),
      thumb: pill.querySelector('.thumb'),
      tooltip: pill.querySelector('.tooltip'),
      speed: pill.querySelector('[data-act="speed"]'),
      speedPopover: pill.querySelector('.speed-popover'),
      speedList: pill.querySelector('.speed-popover .popover-list'),
      revSegments: pill.querySelectorAll('.rev-segmented .segmented-btn'),
      pip: pill.querySelector('[data-act="pip"]'),
      dl: pill.querySelector('[data-act="dl"]'),
      help: pill.querySelector('[data-act="help"]'),
      loopStart: pill.querySelector('[data-act="loop-start"]'),
      loopEnd: pill.querySelector('[data-act="loop-end"]'),
      shortcutsOverlay: shortcutsOverlay,
      shortcutsClose: shortcutsOverlay.querySelector('.shortcuts-close'),
      overflowBtn: pill.querySelector('[data-act="overflow"]'),
      overflowMenu: pill.querySelector('.overflow-menu')
    };

    pill.querySelector('[data-act="back"]').addEventListener('click', () => nudgeSecs(-5));
    pill.querySelector('[data-act="fwd"]').addEventListener('click', () => nudgeSecs(5));
    els.play.addEventListener('click', togglePlay);
    els.speed.addEventListener('click', toggleSpeedPopover);
    els.revSegments.forEach(btn => {
      btn.addEventListener('click', () => setReverse(parseInt(btn.dataset.rev, 10)));
    });
    els.pip.addEventListener('click', togglePip);
    els.dl.addEventListener('click', downloadVideo);
    els.help.addEventListener('click', toggleShortcutsOverlay);
    els.shortcutsClose.addEventListener('click', closeShortcutsOverlay);
    pill.querySelector('[data-act="mini"]').addEventListener('click', () => {
      settings.controllerMini = true;
      chrome.storage.sync.set({ controllerMini: true });
      applyVisibility();
    });
    pill.querySelector('[data-act="loop-start"]').addEventListener('click', () => {
      if (video) {
        loopStart = video.currentTime;
        loopActive = true;
        paint();
      }
    });
    pill.querySelector('[data-act="loop-end"]').addEventListener('click', () => {
      if (video) {
        loopEnd = video.currentTime;
        loopActive = true;
        paint();
      }
    });
    chip.addEventListener('click', () => {
      settings.controllerMini = false;
      chrome.storage.sync.set({ controllerMini: false });
      applyVisibility();
    });
    els.overflow.addEventListener('click', (e) => {
      e.stopPropagation();
      els.overflowMenu.classList.toggle('hidden');
      els.overflowMenu.classList.toggle('open');
    });
    els.overflowMenu.querySelectorAll('.overflow-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = item.dataset.act;
        if (act === 'overflow-speed') {
          els.overflowMenu.classList.remove('open');
          els.overflowMenu.classList.add('hidden');
          toggleSpeedPopover();
        } else if (act === 'overflow-reverse') {
          els.overflowMenu.classList.remove('open');
          els.overflowMenu.classList.add('hidden');
          cycleReverse();
        } else if (act === 'overflow-pip') {
          els.overflowMenu.classList.remove('open');
          els.overflowMenu.classList.add('hidden');
          togglePip();
        } else if (act === 'overflow-mini') {
          els.overflowMenu.classList.remove('open');
          els.overflowMenu.classList.add('hidden');
          settings.controllerMini = true;
          chrome.storage.sync.set({ controllerMini: true });
          applyVisibility();
        }
      });
    });
    // Close overflow menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!els.overflowMenu.contains(e.target) && e.target !== els.overflow) {
        els.overflowMenu.classList.remove('open');
        els.overflowMenu.classList.add('hidden');
      }
    });

    // Overflow button toggle
    els.overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.overflowMenu.classList.toggle('hidden');
      els.overflowMenu.classList.toggle('open');
    });

    // Overflow item handlers
    els.overflowMenu.querySelector('[data-act="overflow-speed"]').addEventListener('click', () => {
      els.overflowMenu.classList.add('hidden');
      els.overflowMenu.classList.remove('open');
      toggleSpeedPopover(new Event('click'));
    });
    els.overflowMenu.querySelector('[data-act="overflow-reverse"]').addEventListener('click', () => {
      els.overflowMenu.classList.add('hidden');
      els.overflowMenu.classList.remove('open');
      cycleReverse();
    });
    els.overflowMenu.querySelector('[data-act="overflow-pip"]').addEventListener('click', () => {
      els.overflowMenu.classList.add('hidden');
      els.overflowMenu.classList.remove('open');
      togglePip();
    });
    els.overflowMenu.querySelector('[data-act="overflow-mini"]').addEventListener('click', () => {
      els.overflowMenu.classList.add('hidden');
      els.overflowMenu.classList.remove('open');
      chrome.storage.sync.set({ controllerMini: true });
      settings.controllerMini = true;
      applyVisibility();
    });

    // Close overflow when clicking outside
    document.addEventListener('click', (e) => {
      if (!els.overflowMenu.contains(e.target) && e.target !== els.overflowBtn) {
        els.overflowMenu.classList.add('hidden');
        els.overflowMenu.classList.remove('open');
      }
    });

    // Keyboard navigation for timeline
    els.track.addEventListener('keydown', (e) => {
      if (!video || !isFinite(video.duration)) return;
      const step = e.shiftKey ? 10 : 5;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft': nudgeSecs(-step); break;
        case 'ArrowRight': nudgeSecs(step); break;
        case 'Home': video.currentTime = 0; break;
        case 'End': video.currentTime = video.duration - 0.1; break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        paint();
      }
    });

    // Scrub: click or drag along the rail.
    const fracFromEvent = (e) => {
      const r = els.rail.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    };

    // Thumbnail cache: Map<videoSrc, Map<time, dataURL>>
    const thumbnailCache = new Map();
    let thumbnailRequestId = 0;
    const MAX_THUMBNAILS_PER_REEL = 50;

    // Capture video frame at given time, return dataURL
    const captureThumbnail = (targetTime) => {
      if (!video || !isFinite(video.duration)) return Promise.resolve(null);
      const src = video.currentSrc || video.src;
      if (!src) return Promise.resolve(null);

      let reelCache = thumbnailCache.get(src);
      if (!reelCache) {
        reelCache = new Map();
        thumbnailCache.set(src, reelCache);
      }

      // Check cache first
      const cachedKey = Math.round(targetTime);
      if (reelCache.has(cachedKey)) return Promise.resolve(reelCache.get(cachedKey));

      // Limit cache size
      if (reelCache.size >= MAX_THUMBNAILS_PER_REEL) {
        const firstKey = reelCache.keys().next().value;
        reelCache.delete(firstKey);
      }

      // Try requestVideoFrameCallback (Chrome 106+)
      if ('requestVideoFrameCallback' in video) {
        return new Promise((resolve) => {
          const id = ++thumbnailRequestId;
          video.requestVideoFrameCallback((now, metadata) => {
            if (thumbnailRequestId !== id) return resolve(null); // Superseded
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            const ctx = canvas.getContext('2d');
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataURL = canvas.toDataURL('image/jpeg', 0.8);
              reelCache.set(cachedKey, dataURL);
              resolve(dataURL);
            } catch (err) {
              resolve(null);
            }
          }, { frameTimestamp: targetTime * 1000 }); // microseconds
        });
      }

      // Fallback: seek + drawImage
      return new Promise((resolve) => {
        if (video.readyState < 2) return resolve(null);
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        const originalTime = video.currentTime;
        const handler = () => {
          video.removeEventListener('seeked', handler);
          try {
            ctx.drawImage(video, 0, 0, 160, 90);
            const dataURL = canvas.toDataURL('image/jpeg', 0.8);
            reelCache.set(cachedKey, dataURL);
            video.currentTime = originalTime;
            resolve(dataURL);
          } catch (err) {
            video.currentTime = originalTime;
            resolve(null);
          }
        };
        video.addEventListener('seeked', handler, { once: true });
        video.currentTime = targetTime;
      });
    };

    const startScrub = (e) => {
      if (!video || !isFinite(video.duration)) return;
      seeking = true;
      els.track.classList.add('dragging');
      els.rail.setPointerCapture(e.pointerId);
      seekTo(fracFromEvent(e));
    };
    const moveScrub = (e) => {
      if (seeking) seekTo(fracFromEvent(e));
    };
    const endScrub = () => {
      seeking = false;
      els.track.classList.remove('dragging');
    };
    // Pinch-to-zoom scrub: two-finger pinch changes seek sensitivity
    let pinchStartDist = 0;
    let pinchStartTime = video.currentTime;
    els.rail.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        pinchStartDist = d;
        pinchStartTime = video.currentTime;
      }
    }, { passive: false });

    els.rail.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        const diff = d - pinchStartDist;
        const step = diff / 20; // sensitivity
        const targetTime = pinchStartTime + step;
        video.currentTime = Math.max(0, Math.min(video.duration, targetTime));
        paint();
      }
    }, { passive: false });

    // Long-press speed button → open popover
    let longPressTimer = null;
    els.speed.addEventListener('pointerdown', () => {
      longPressTimer = setTimeout(() => {
        els.speedPopover.classList.remove('hidden');
        els.speedPopover.classList.add('open');
        longPressTimer = null;
      }, 600);
    });
    els.speed.addEventListener('pointerup', () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    });
    els.speed.addEventListener('pointerleave', () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    });

    els.rail.addEventListener('pointerdown', startScrub);
    els.rail.addEventListener('pointermove', moveScrub);
    els.rail.addEventListener('pointerup', endScrub);
    els.rail.addEventListener('pointercancel', endScrub);
    els.rail.addEventListener('pointerleave', endScrub);

    // Tooltip update on mouse move (with thumbnail preview)
    els.rail.addEventListener('mousemove', (e) => {
      if (!video || !isFinite(video.duration)) return;
      const frac = fracFromEvent(e);
      const t = frac * video.duration;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const timeStr = m + ':' + String(s).padStart(2, '0');

      // Update tooltip text
      els.tooltip.textContent = timeStr;
      // Position tooltip
      const railRect = els.rail.getBoundingClientRect();
      const x = e.clientX - railRect.left;
      els.tooltip.style.left = x + 'px';
      els.tooltip.style.transform = 'translateX(-50%)';

      // Load and show thumbnail (non-blocking)
      captureThumbnail(t).then(thumb => {
        if (thumb) {
          const img = els.tooltip.querySelector('img.thumb-img');
          if (img) {
            img.src = thumb;
            img.style.display = 'block';
          }
        }
      });
    });

    // Drag the pill by its background (never by buttons or the rail).
    let drag = null;
    pill.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('.track')) return;
      const r = pill.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      pill.classList.add('dragging');
      pill.setPointerCapture(e.pointerId);
      // Switch to free mode on drag
      if (settings.controllerAnchor !== 'free') {
        settings.controllerAnchor = 'free';
        chrome.storage.sync.set({ controllerAnchor: 'free' });
      }
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
      // Snap to nearest anchor if close enough
      const pos = { left: pill.style.left, top: pill.style.top };
      const snapped = snapToAnchor(pos);
      if (snapped) {
        Object.assign(els.pill.style, snapped);
        chrome.storage.sync.set({ controllerAnchor: snapped.anchor, controllerPos: null });
        settings.controllerAnchor = snapped.anchor;
        settings.controllerPos = null;
      } else {
        const pos = { left: pill.style.left, top: pill.style.top };
        chrome.storage.sync.set({ controllerPos: pos, controllerAnchor: 'free' });
        settings.controllerPos = pos;
        settings.controllerAnchor = 'free';
      }
    });

    // Global D key to download current reel
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
        downloadVideo();
      }
    });

    // Initial position: use saved free position, or apply anchor
    if (settings.controllerPos && settings.controllerAnchor === 'free') {
      pill.style.left = settings.controllerPos.left;
      pill.style.top = settings.controllerPos.top;
      pill.style.bottom = 'auto';
      pill.style.transform = 'none';
    } else {
      applyAnchorPosition();
    }
  }

  function toggleShortcutsOverlay() {
    const isOpen = !els.shortcutsOverlay.classList.contains('hidden');
    if (isOpen) {
      closeShortcutsOverlay();
      return;
    }
    closeAllPopovers();
    els.shortcutsOverlay.classList.remove('hidden');
    els.help.setAttribute('aria-expanded', 'true');
    els.shortcutsClose.focus();
    // Close on outside click
    const closeOnClick = (ev) => {
      if (!els.shortcutsOverlay.contains(ev.target) && ev.target !== els.help) {
        closeShortcutsOverlay();
        document.removeEventListener('click', closeOnClick);
      }
    };
    document.addEventListener('click', closeOnClick);
    // Keyboard: Esc to close
    const keyHandler = (ev) => {
      if (ev.key === 'Escape') {
        closeShortcutsOverlay();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);
    shortcutsOverlayCleanup = () => {
      document.removeEventListener('click', closeOnClick);
      document.removeEventListener('keydown', keyHandler);
    };
  }

  function closeShortcutsOverlay() {
    if (shortcutsOverlayCleanup) shortcutsOverlayCleanup();
    shortcutsOverlayCleanup = null;
    els.shortcutsOverlay.classList.add('hidden');
    els.help.setAttribute('aria-expanded', 'false');
    els.help.focus();
  }

  function closeAllPopovers() {
    closeSpeedPopover();
    closeShortcutsOverlay();
  }

  let shortcutsOverlayCleanup = null;

  function tick() {
    frame++;
    const now = performance.now();
    // Re-detect twice a second: cheap, catches reel switches the observer misses.
    if (now - lastDetectAt > 500) {
      lastDetectAt = now;
      if (controllerActive()) {
        bindVideo(detectVideo());
        if (video) {
          // Same element, new reel (IG reuses <video>): reset end-tracking so the
          // old reel's tail doesn't instantly advance the new one.
          if (video.currentSrc !== lastSrc) {
            lastSrc = video.currentSrc;
            lastTime = video.currentTime || 0;
            advancedFor = null;
            pendingAdvance = null;
            clearEndedStampFor(video.currentSrc);
            bindMarkAt = performance.now();
          }
          // React re-adds attrs and resets rate on source swaps; heal both.
          stripLocks(video);
          if (reverseRate === 0 && video.playbackRate !== settings.playbackRate) applyRate(video);
        }
      } else {
        bindVideo(null);
        stopReverse();
      }
      applyVisibility();
    }
    // Periodic collision check (every ~2 seconds)
    if (frame % 120 === 0) checkCollisions();
    // End watchdog: catches reels whose `ended` never fires (loop, MSE, races).
    // Fires once per reel; re-arms when the user scrubs back away from the end.
    checkNearEnd();

    // Loop range: when video reaches loopEnd, jump back to loopStart
    if (loopActive && loopStart !== null && loopEnd !== null && video) {
      if (video.currentTime >= loopEnd - 0.1) {
        video.currentTime = loopStart;
      }
    }

    if (video && !seeking && (frame % 6 === 0)) paint();
    requestAnimationFrame(tick);
  }

  // Read-only snapshot for the console: run `__reelscrollDebug()` on a Reels
  // page and paste the result when reporting that advance/nav misbehaves.
  function debugSnapshot() {
    const dur = video ? effectiveDuration(video) : NaN;
    let seekEnd = null;
    try {
      if (video && video.seekable && video.seekable.length > 0) {
        seekEnd = +video.seekable.end(video.seekable.length - 1).toFixed(2);
      }
    } catch (err) {
      // Seekable unreadable.
    }
    return {
      reelsPage: isReelsPage(),
      enabled: settings.enabled,
      controllerEnabled: settings.controllerEnabled,
      autoAdvance: settings.autoAdvance,
      hasVideo: !!video,
      videosOnPage: document.querySelectorAll('video').length,
      paused: video ? video.paused : null,
      ended: video ? video.ended : null,
      loop: video ? video.loop : null,
      pipBlocked: video ? !!video.disablePictureInPicture : null,
      currentTime: video ? +video.currentTime.toFixed(2) : null,
      duration: video ? (isFinite(video.duration) ? +video.duration.toFixed(2) : String(video.duration)) : null,
      effectiveDuration: isFinite(dur) ? +dur.toFixed(2) : null,
      seekableEnd: seekEnd,
      playbackRate: video ? video.playbackRate : null,
      pipOpen: !!document.pictureInPictureElement,
      advancedFor: advancedFor,
      pendingAdvance: pendingAdvance
    };
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
    try {
      window.__reelscrollDebug = debugSnapshot;
    } catch (err) {
      // Sealed window object on this page: snapshot stays unavailable.
    }
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();