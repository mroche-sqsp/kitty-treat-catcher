# Kitty Treat Catcher

A tiny vanilla-canvas game intended to be embedded via iframe. No build
step, no dependencies, deploys as static files to any static host.

## What it does

Move the cat left/right to catch 10 falling fish. Dodge the yarn balls.
Wins in ~30–45 seconds. Always beatable by design.

## postMessage protocol

When embedded in an iframe, the game posts messages to `window.parent` so a
host page can react to gameplay events (e.g. reveal a reward code on win):

```ts
interface GameMessage {
  type: 'STARTED' | 'GOAL_REACHED' | 'ENDED';
  score?: number;
}
```

It sends `STARTED` on the first player input and `GOAL_REACHED` when the
player catches 10 fish. It never sends `ENDED` (there's no fail state).

When run standalone (no parent frame), the messages are no-ops.

## Query parameters

- `?rewardCode=PETS10` — displayed inside the in-game win card, useful for
  standalone embeds where the host page doesn't render its own reward
  overlay. The legacy `?discountCode=PETS10` is also accepted for backward
  compatibility with older host pages.

## Local testing

The game uses `<script type="module">`, so it must be served over HTTP —
opening `index.html` via `file://` will silently fail to load `game.js`.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
# or: npx serve .
```

Open <http://127.0.0.1:8000/?rewardCode=PETS10>. Prefer `127.0.0.1` over
`localhost` — on some macOS setups `localhost` resolves to IPv6 first and
hangs if the server only bound to IPv4.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo settings, enable Pages from `main` (root).
3. Grab the resulting URL (e.g. `https://<you>.github.io/kitty-treat-catcher/`)
   and embed it as an iframe wherever you want the game to appear.

## Files

- `index.html` — canvas + start/win screens
- `style.css` — HUD and overlay styling
- `game.js` — game loop, input, collisions, postMessage dispatch

The entire bundle is under 10 KB.
