# ReelScroll Controller — UI/UX Upgrade Plan

## Current State Analysis

### Strengths
- Shadow DOM isolation (styles don't leak/break)
- Draggable positioning with persistence
- Mini/chip mode for minimal footprint
- All essential controls present (timeline, speed, reverse, PiP, download)
- Keyboard accessible (focus-visible outlines)
- Respects reduced motion via native scroll behavior

### Pain Points
| Area | Issue |
|---|---|
| **Visual** | Flat gray pill; low contrast on light IG backgrounds; no dark/light theme awareness |
| **Typography** | System font at 12px; time text hard to read; speed label cramped |
| **Icons** | Inline SVG strings; inconsistent stroke weights; no hover/active states beyond background |
| **Timeline** | 130px fixed width; no thumb; no preview tooltip on hover; no keyboard scrub |
| **Spacing** | Tight 4px gaps; buttons touch on mobile; no breathing room |
| **Animation** | Zero motion — pop-in/out, no transitions on state changes |
| **Responsive** | Fixed bottom position; overlaps IG's own UI on mobile; no safe-area handling |
| **Accessibility** | No ARIA labels on icon-only buttons; no keyboard shortcuts for timeline; color-only state indication (`.on` class) |
| **Download** | No progress indication; flash is subtle; no error details |
| **PiP** | No visual sync between inline pill and PiP window state |

---

## Upgrade Pillars

### 1. Design System Foundation
- **Design tokens** (colors, spacing, radii, shadows, motion) as CSS custom properties
- **Light/Dark/Auto theme** via `prefers-color-scheme` + manual override in popup
- **High-contrast mode** support
- **Reduced motion** respect (`prefers-reduced-motion`)

### 2. Visual Polish
- **Glassmorphism 2.0**: layered backgrounds, subtle inner glow, stronger border contrast
- **Icon system**: single SVG sprite, consistent 1.5px stroke, 16×16 viewBox, `currentColor`
- **Micro-interactions**: 120ms ease-out on hover, 80ms on press, 200ms on state toggle
- **Focus ring**: 2px solid accent + 2px offset, visible in both themes

### 3. Timeline Redesign
- **Fluid width**: `clamp(160px, 30vw, 280px)` — responsive to viewport
- **Thumb**: 12px circle with inner dot, visible on hover/focus, draggable
- **Hover preview**: tooltip thumbnail (if `video.seekable` + `requestVideoFrameCallback` available) or timestamp
- **Keyboard scrub**: `←/→` = ±5s, `Shift+←/→` = ±10s, `Home/End` = start/end
- **Buffer indication**: subtle secondary fill showing buffered range
- **Chapter markers** (future): if IG adds them, show as tick marks

### 4. Layout & Positioning
- **Anchor positions**: 9 presets (corners, edges, center-bottom) + free drag
- **Safe-area**: `env(safe-area-inset-*)` for notched devices
- **Collision avoidance**: auto-nudge if overlapping IG's bottom bar/comments sheet
- **Persistence**: per-anchor + free coordinates stored separately

### 5. State & Feedback
- **Download**: progress ring around button (0→360°), tooltip with speed/ETA, toast on complete/error
- **Speed/Reverse**: segmented control (0.5× 1× 1.5× 2× 3×) instead of cycle button
- **PiP**: pill shows "PiP active" badge; clicking PiP button in pill migrates float seamlessly
- **Loading skeleton**: while detecting video, show shimmer pill

### 6. Keyboard & Accessibility
- **Global shortcuts** (when pill focused):
  - `Space` = play/pause
  - `←/→` = seek ±5s
  - `↑/↓` = speed up/down
  - `R` = toggle reverse
  - `P` = toggle PiP
  - `D` = download
  - `M` = minimize
  - `Esc` = close/minimize
- **ARIA**: `role="region" aria-label="ReelScroll video controls"`, each button `aria-label`, timeline `role="slider" aria-valuemin/max/now`
- **Screen reader**: live region for time updates (polite)

---

## Implementation Phases

### Phase 1 — Foundation (1-2 days)
```
src/content/controller.css        # New: extracted CSS with design tokens
src/content/controller-ui.js      # New: UI module (build, paint, theme)
src/content/controller.js         # Refactor: import UI module, delegate rendering
```

**Design tokens** (`:root` in shadow):
```css
:host {
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
  --rs-radius: 14px;
  --rs-btn-size: 32px;
  --rs-gap: 8px;
  --rs-pad-x: 14px;
  --rs-pad-y: 8px;
  --rs-transition: 120ms cubic-bezier(0.2, 0, 0, 1);
  --rs-timeline-w: clamp(160px, 30vw, 280px);
  --rs-thumb-size: 14px;
  --rs-font: 500 13px/1.2 system-ui, -apple-system, sans-serif;
}

/* Dark theme (default) */
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

@media (prefers-reduced-motion: reduce) {
  :host { --rs-transition: 0ms; }
}
```

### Phase 2 — Timeline & Controls (2-3 days)
- **Timeline component**: rail, fill, buffer, thumb, preview tooltip
- **Segmented speed control**: replaces single cycle button
- **Download progress ring**: SVG `<circle stroke-dasharray>`
- **Tooltip system**: reusable, positioned via Floating UI logic (lightweight)

### Phase 3 — Positioning & Persistence (1 day)
- **Anchor grid** (9 positions) in settings
- **Collision detection** against IG's bottom bar (`.x1lliihq` etc. — query by role)
- **Safe-area insets** for iOS/Android notches

### Phase 4 — Polish & Accessibility (1-2 days)
- **Keyboard shortcuts** when pill focused
- **ARIA attributes** throughout
- **Focus management** (trap in pill when open, restore on close)
- **Theme toggle** in popup (Auto/Light/Dark)

### Phase 5 — Advanced (Optional)
- **Video preview thumbnails** on timeline hover (via `requestVideoFrameCallback` or IG's storyboard sprite if detectable)
- **Chapter markers** if IG exposes them
- **Gesture support**: swipe on timeline to scrub, pinch to zoom speed
- **Compact mode**: single-row with collapsible sections

---

## File Structure After Refactor

```
src/content/
├── controller.js           # Core logic (navigation, video binding, download)
├── controller-ui.js        # UI module (build, paint, theme, timeline, tooltips)
├── controller.css          # Design tokens + component styles
└── reels.js                # Unchanged (navigation)
```

### controller-ui.js API
```js
export const UI = {
  init(shadowRoot, settings, callbacks),  // callbacks: { onSeek, onSpeedChange, onDownload, ... }
  setVideo(video),
  setState({ playing, currentTime, duration, buffered, speed, reverseRate, pipActive, downloading, downloadProgress }),
  setTheme(theme),           // 'auto' | 'light' | 'dark'
  setAnchor(anchor),         // 'bottom-center' | 'bottom-left' | 'free' + {x,y}
  setMini(mini),
  destroy(),
};
```

### Settings additions (popup/options)
```js
controllerTheme: 'auto',        // 'auto' | 'light' | 'dark'
controllerAnchor: 'bottom-center', // 9 positions + 'free'
controllerCompact: false,       // collapsed single-row mode
showKeyboardHints: true,        // show tooltip hints on first use
```

---

## Acceptance Criteria

| Criterion | Met When |
|---|---|
| **Visual parity** | Looks native on both light/dark IG themes |
| **Timeline usability** | Can scrub to exact second via mouse/keyboard; preview shows timestamp |
| **Drag/reposition** | Remembers free position; anchor presets work; survives IG layout shifts |
| **Download feedback** | Progress ring visible; toast on complete/error with filename |
| **Accessibility** | Full keyboard control; screen reader announces time/speed changes; passes axe-core |
| **Performance** | `< 1ms` paint per frame; no layout thrash; CSS-only animations |
| **Mobile** | Fits 375px viewport; no overlap with IG UI; touch targets ≥ 44×44px |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| IG CSS changes break pill | Shadow DOM + `!important` on tokens; integration test on real IG weekly |
| `requestVideoFrameCallback` not supported | Fallback to timestamp-only tooltip; progressive enhancement |
| Performance on low-end | `will-change: transform` only on dragging; `requestAnimationFrame` paint batching |
| Theme flash on load | Inline critical tokens in `<style>` before first paint; `theme-color` meta hint |

---

## Next Steps

1. **Approve plan** → I'll create the mission and start Phase 1
2. **Pick priority** — if you want one thing first (e.g., timeline redesign), we can slice vertically
3. **Design review** — I can mock the new pill in Figma/CodePen before coding if you prefer

Let me know which phase to start or if you want adjustments.