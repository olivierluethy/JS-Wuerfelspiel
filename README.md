# JS-Würfelspiel — Swiss Lotto 6/49

A single-page Swiss Lotto (6 out of 49 + bonus) game built with vanilla JavaScript, HTML and SCSS — pick your numbers, spin the drum, and see how many you match.

## Features

- **6/49 + bonus** lottery gameplay with an animated ball-drawing drum (bouncing-ball physics).
- **Manual pick or quick pick** — choose your six numbers on the grid or let the game pick for you.
- **Prize table & jackpot** — matches are reconciled against real Swiss Lotto prize tiers and a jackpot ticker.
- **Synthesized sound** via the Web Audio API — no audio asset files needed.
- Respects `prefers-reduced-motion` for accessibility.

## Tech

- Vanilla **JavaScript** (single-file game module, `js/main.js`)
- **HTML** + **SCSS/CSS** (`css/style.scss` → `css/style.css`)
- Web Audio API for sound

## Run

No build step or dependencies — just open the page:

```bash
git clone https://github.com/olivierluethy/JS-Wuerfelspiel.git
cd JS-Wuerfelspiel
```

Then open `index.html` in your browser (or serve the folder with any static server, e.g. `python3 -m http.server`).

## Project structure

- `index.html` — markup and layout
- `js/main.js` — game logic: number grid, draw sequence, prize reconciliation, sound
- `css/style.scss` / `css/style.css` — styling
- `mockup/` — design mockup (draw.io)
