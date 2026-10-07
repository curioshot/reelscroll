# ReelScroll

Scroll Instagram Reels without touching the scrollbar. Mouse wheel flips through reels, your own up/down keys replace scrolling, and keyboard media keys (`⏭` / `⏮`) jump to the next or previous reel.

## Install (developer mode)

```bash
git clone https://github.com/curioshot/reelscroll.git
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `reelscroll` folder.
3. Open `https://www.instagram.com/reels/` and scroll with the wheel.

No build step, no dependencies.

## How to use

| Action | Default | Change it |
| --- | --- | --- |
| Next reel | Mouse wheel down or `S` | Options page |
| Previous reel | Mouse wheel up or `W` | Options page |
| Next / previous reel | `⏭` / `⏮` media keys | `chrome://extensions/shortcuts` |
| Arrow keys | Off by default | Options page toggle |

Click the toolbar icon for a quick on/off switch. The **Set keys** button opens the options page, where you can press any key to bind it, flip the wheel direction, and tune sensitivity and cooldown.

## How it works

- A content script runs on `instagram.com` but stays quiet until the URL is a Reels page (`/reels*`, `/reel/*`), so the normal feed is untouched.
- It finds reels by looking for `article` elements with video (no hardcoded CSS class names, which Instagram renames often) and tracks the centered one.
- Wheel input is intercepted (`passive: false`) and replaced with a jump to the next or previous reel. Small panes like comment sheets still scroll normally.
- Media keys arrive through the `chrome.commands` API in the service worker, which forwards them to the open Reels tab.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Saves your key bindings and wheel settings, synced across your devices. Nothing else is stored. |
| Host access to `instagram.com` | Needed to run the scroller on Reels pages. The extension talks to no servers. |

No analytics, no network calls, no data leaves your browser.

## Contributing

1. Fork and branch off `master`.
2. Keep changes small and run `node --check` on every JS file you touch.
3. Open a pull request describing what you tried on a real Reels page.

## Security

Found something that looks wrong? Open an issue with the extension version, Chrome version, and steps to reproduce. Please don't post session cookies or account details.

## License

MIT — see [LICENSE](LICENSE).
