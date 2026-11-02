# ReelScroll Controller — Proportional Feature Plan

> **Status**: Commit 1 (Visual Refresh) ✅ **COMPLETE** — Design tokens, light/dark themes, timeline redesign, download progress, accessibility foundation all implemented in `src/content/controller.js`.

---

## Remaining Phases — Priority-Ordered

| Phase | Title | Est. Effort | Dependencies | Value |
|-------|-------|-------------|--------------|-------|
| **2A** | Speed Popover + Reverse Segmented Control | 1 day | Commit 1 tokens | High — replaces cycle button with discoverable UI |
| **2B** | Keyboard Shortcuts Overlay + Global Hotkeys | 0.5 day | Commit 1 ARIA | High — discoverability & power-user efficiency |
| **2C** | Download Progress Polish (ETA, toast) | 0.5 day | Commit 1 progress ring | Medium — user confidence |
| **3** | Anchor Presets + Collision Avoidance + Safe-Area | 1 day | Commit 1 | Medium — mobile/UX robustness |
| **4** | Theme Toggle in Popup (Auto/Light/Dark) | 0.5 day | Commit 1 tokens + storage | Low-Medium — user preference |
| **5** | Thumbnail Preview on Timeline Hover | 1-2 days | `requestVideoFrameCallback` support | High — TikTok/YouTube parity |
| **6** | Compact Mode + Gesture Support | 1 day | Phase 3 | Medium — mobile power users |

---

## Phase 2A — Speed Popover + Reverse Segmented Control

### Scope
- Replace single **cycle-speed button** with **popover menu** (0.25× → 3×)
- Replace **cycle-reverse button** with **3-state segmented control** (Off | -1× | -2×)
- Both use same popover component (reusable)

### UI Spec
```
Speed Popover (anchored to speed button):
┌─────────────────────┐
│  Playback Speed     │
│  ● 0.25×   ○ 0.5×   │
│  ○ 0.75×   ● 1×     │  ← current = filled dot
│  ○ 1.25×   ○ 1.5×   │
│  ○ 2×      ○ 3×     │
└─────────────────────┘

Reverse Segmented (replaces rev button):
┌─────────────────────────────┐
│  Off    |   -1×    |   -2×  │
└─────────────────────────────┘
```

### Implementation
1. Add `Popover` component to CSS (reuse tooltip positioning logic)
2. Add `buildSpeedPopover()` / `buildReverseSegmented()` in `build()`
3. Click outside / `Esc` closes popover
4. Keyboard: `↑/↓` navigate, `Enter` select, `Esc` close
5. Store last-used speed in settings (already `playbackRate`)

### Acceptance Checks
- [ ] Popover opens on speed button click, closes on outside click/`Esc`
- [ ] Speed options match `SPEEDS` + 0.25×/0.75×/1.25×
- [ ] Reverse segmented shows 3 states, toggles correctly
- [ ] Keyboard navigation works in both
- [ ] No layout shift when opening

---

## Phase 2B — Keyboard Shortcuts Overlay + Global Hotkeys

### Scope
- **Shortcuts overlay** (`?` key or long-press help button) — shows all bindings
- **Global hotkeys** when pill focused (no popover open):
  - `Space` = play/pause
  - `←/→` = seek ±5s (already in Commit 1)
  - `Shift+←/→` = seek ±10s (already)
  - `↑/↓` = speed up/down
  - `R` = cycle reverse
  - `P` = toggle PiP
  - `D` = download
  - `M` = minimize
  - `?` = show overlay

### UI Spec
```
┌──────────────────────────────┐
│  ReelScroll Shortcuts        │
│  ──────────────────────────  │
│  Space         Play / Pause  │
│  ← / →         Seek ±5s      │
│  Shift+←/→     Seek ±10s     │
│  ↑ / ↓         Speed ±       │
│  R             Reverse       │
│  P             Picture-in-Pic│
│  D             Download      │
│  M             Minimize      │
│  ?             This help     │
└──────────────────────────────┘
```

### Implementation
1. Add `ShortcutsOverlay` component (reuses popover CSS)
2. Global `keydown` listener on pill (when focused)
3. Help button in pill (or `?` key) → opens overlay
4. Persist `showKeyboardHints` setting for first-run auto-show

### Acceptance Checks
- [ ] All listed shortcuts work when pill focused
- [ ] Overlay opens on `?` and help button
- [ ] Overlay closes on `Esc`/outside click
- [ ] No conflict with IG's shortcuts when typing in comments

---

## Phase 2C — Download Progress Polish

### Scope
- **ETA tooltip** on download button during fetch (speed + time remaining)
- **Completion toast** with filename + "Open folder" action (if Chrome permits)
- **Error toast** with actionable message (CORS, network, validation fail)
- **Progress ring** already in Commit 1 — ensure smooth updates

### Implementation
1. Track `Content-Length` + bytes received → compute speed/ETA
2. Update progress ring every 100ms during fetch
3. On success: toast with filename, auto-dismiss 3s
4. On error: toast with error type + "Retry" button

### Acceptance Checks
- [ ] Progress ring updates smoothly 0→100%
- [ ] ETA shows in tooltip (e.g., "2.3 MB/s — 4s left")
- [ ] Success toast shows filename, clickable
- [ ] Error toast distinguishes: CORS / network / validation / unknown

---

## Phase 3 — Anchor Presets + Collision Avoidance + Safe-Area

### Scope
- **9 anchor presets**: 4 corners, 4 edges, center-bottom
- **Free drag** (current) + **anchor snap** on release
- **Collision avoidance**: detect IG bottom bar (`.x1lliihq`, `[role="dialog"]`, comments sheet) and nudge pill
- **Safe-area insets**: `env(safe-area-inset-*)` for notched devices

### Settings
```js
controllerAnchor: 'bottom-center', // 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br' | 'free'
controllerPos: { left, top },      // only for 'free'
```

### Implementation
1. Add anchor grid UI in options page
2. `computeSafePosition()` utility — queries IG UI elements, returns safe coords
3. On drag end: snap to nearest anchor if within 24px, else free
4. On tick/reposition: re-check collisions, nudge if needed
4. CSS: `padding-bottom: max(var(--rs-pad-y), env(safe-area-inset-bottom))`

### Acceptance Checks
- [ ] All 9 anchors persist across reloads
- [ ] Pill never overlaps IG bottom bar / comments / share sheet
- [ ] Safe-area respected on notched devices (iPhone X+)
- [ ] Free drag still works, snaps to anchor when close

---

## Phase 4 — Theme Toggle in Popup

### Scope
- Add **Theme** dropdown in popup: Auto / Light / Dark
- Persist to `controllerTheme` setting
- Apply immediately via `host.style.setProperty('--rs-theme', value)` or class on host

### Implementation
1. Add `<select id="theme">` in popup.html
2. Wire to `chrome.storage.sync.set({ controllerTheme })`
3. In controller: watch `controllerTheme` change, apply `data-theme` attr on host
4. CSS: `[data-theme="light"] { /* override tokens */ }`

### Acceptance Checks
- [ ] Dropdown shows Auto/Light/Dark
- [ ] Change applies instantly without reload
- [ ] Persists across browser restarts

---

## Phase 5 — Thumbnail Preview on Timeline Hover

### Scope
- Show **video frame thumbnail** in tooltip when hovering timeline
- Use `requestVideoFrameCallback` (Chrome 106+) or fallback to `video.currentTime` capture via canvas
- Debounce 100ms, cache thumbnails per reel

### Technical
```js
// Preferred: requestVideoFrameCallback
if ('requestVideoFrameCallback' in video) {
  video.requestVideoFrameCallback((now, metadata) => {
    // metadata.presentedFrames, metadata.expectedDisplayTime
  });
}
// Fallback: drawImage to offscreen canvas
```

### Acceptance Checks
- [ ] Thumbnail appears in tooltip on timeline hover (desktop)
- [ ] Updates smoothly as mouse moves
- [ ] Falls back gracefully if API unavailable
- [ ] No visible lag/jank on low-end devices

---

## Phase 6 — Compact Mode + Gesture Support

### Scope
- **Compact mode**: single-row pill, collapsible sections (timeline hidden, speed/rev/pip in overflow menu)
- **Touch gestures**:
  - Swipe left/right on timeline → seek ±10s
  - Pinch on timeline → zoom (fine scrub granularity)
  - Long-press speed button → open popover
  - Swipe up on pill → expand/compact

### Acceptance Checks
- [ ] Compact mode toggles via setting + double-tap chip
- [ ] Swipe seek works on mobile Chrome
- [ ] Pinch zoom changes scrub sensitivity
- [ ] No gesture conflicts with IG's own swipe navigation

---

## Cross-Cutting Concerns

| Concern | Mitigation |
|---------|------------|
| **IG layout changes** | Shadow DOM + `!important` tokens; selector resilience (role-based not class-based) |
| **Performance** | `will-change: transform` only during drag; `requestAnimationFrame` paint batching; CSS-only animations |
| **Settings migration** | Versioned settings object; `onInstalled` migrates old keys |
| **Testing** | Manual on real IG weekly; unit-test pure functions (tokens, position math) |

---

## Proportional Effort Summary

| Phase | Dev Days | Risk | User Impact |
|-------|----------|------|-------------|
| 2A Speed/Reverse | 1 | Low | ⭐⭐⭐⭐⭐ |
| 2B Keyboard/Help | 0.5 | Low | ⭐⭐⭐⭐ |
| 2C Download Polish | 0.5 | Low | ⭐⭐⭐ |
| 3 Anchors/Collision | 1 | Medium | ⭐⭐⭐⭐ |
| 4 Theme Toggle | 0.5 | Low | ⭐⭐ |
| 5 Thumbnails | 1.5 | High* | ⭐⭐⭐⭐⭐ |
| 6 Compact/Gestures | 1 | Medium | ⭐⭐⭐ |

*Thumbnail risk: `requestVideoFrameCallback` support varies; fallback required.

---

## Recommended Execution Order

1. **2A → 2B → 2C** (vertical slice: controls + keys + feedback) — 2 days
2. **3** (positioning robustness) — 1 day
3. **4** (quick win) — 0.5 day
4. **5** (high value, higher risk) — 1.5 days
5. **6** (mobile polish) — 1 day

**Total: ~6.5 days** for full plan.

---

## Ready to Execute?

Pick a phase to start:
- **`2A`** — Speed Popover + Reverse Segmented (highest immediate UX win)
- **`2B`** — Keyboard Shortcuts Overlay (power-user favorite)
- **`3`** — Anchor Presets + Collision Avoidance (mobile critical)
- **`5`** — Thumbnail Preview (showstopper feature)

Or run the full sequence with approval.