# ReelScroll

Navigate Instagram Reels with custom up/down keys and keyboard media keys (`⏭` / `⏮`). A floating video controller — on any Instagram video, not just Reels — adds a seekable timeline, slow-motion/fast speeds, simulated reverse play, picture-in-picture, and a download button.

## Install (developer mode)

```bash
git clone https://github.com/curiobits/reelscroll.git
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `reelscroll` folder.
3. Open `https://www.instagram.com/reels/` and navigate with the keys and media buttons you want.

No build step, no dependencies.

## How to use

| Action | Default | Change it |
| --- | --- | --- |
| Next reel | `S` | Options page |
| Previous reel | `W` | Options page |
| Next / previous reel | `⏭` / `⏮` media keys | `chrome://extensions/shortcuts` |
| Arrow keys | Off by default | Options page toggle |

Click the toolbar icon for a quick on/off switch. The **Set keys** button opens the options page, where you can press any key to bind it, tune sensitivity and cooldown.

## Video controller

While a video plays, a small pill sits over it: play/pause, a timeline you can click or drag to scrub, `-5s` / `+5s` jumps, a speed button cycling `0.5x → 3x`, a reverse button (`-1x` / `-2x`), and a download button that saves the current MP4 through Chrome's own downloader (it needs the video's real file — a few streams only exist as fragments, and then the button quietly declines). Browsers can't play video truly backwards, so reverse is simulated by stepping the timeline back — slightly steppy, but it works. The PiP button pops the video into picture-in-picture so it floats over other tabs. The floating window has its own previous/next buttons that switch reels, and it follows you to the new reel when it can (timer-driven advances have no click gesture to spend, so then it closes and inline playback continues). Keys and media keys need the *tab* focused — when the floating window itself is focused, use its built-in buttons or your keyboard's media keys. On Reels, when a reel finishes, the next one loads automatically, in the page or in PiP (toggle in the toolbar popup). Drag the pill anywhere; it remembers its spot. The `–` button shrinks it to a chip, and the toolbar popup can hide it entirely.

Pill and tools appear wherever Instagram plays a video. The next/previous and auto-advance behavior stays Reels-only — the feed keeps scrolling exactly as Instagram intends.

## How it works

- A content script runs on `instagram.com` and stays quiet until its work applies: the pill and tools show on any page playing a video; keys/auto-advance only act on Reels pages (`/reels*`, `/reel/*`), so the normal feed scrolls as Instagram intends.
- It finds reels by looking for `article` elements with video (no hardcoded CSS class names, which Instagram renames often) and tracks the centered one.
- Media keys arrive through the `chrome.commands` API in the service worker, which forwards them to the open Reels tab.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Saves your key bindings, synced across your devices. Nothing else is stored. |
| `downloads` | The video controller's download button hands the video's MP4 URL to Chrome's downloader. The URL goes browser-internal, never to us. |
| Host access to `instagram.com` | Needed to run the controller and scroller on Instagram pages. The extension talks to no servers. |

No analytics, no network calls, no data leaves your browser.

## Contributing

1. Fork and branch off `master`.
2. Keep changes small and run `node --check` on every JS file you touch.
3. Open a pull request describing what you tried on a real Reels page.

## Security

Found something that looks wrong? Open an issue with the extension version, Chrome version, and steps to reproduce. Please don't post session cookies or account details.

## License

MIT — see [LICENSE](LICENSE).