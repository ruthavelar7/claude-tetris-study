# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris implementation. No dependencies, no build step, no package.json — just `index.html`, `style.css`, and `game.js`.

## Running the game

```bash
open index.html             # macOS, just open the file directly
python3 -m http.server 8000 # or serve locally and visit http://localhost:8000
```

There is no build, lint, or test tooling in this repo.

## Architecture

Everything lives in `game.js` (~300 lines, single file, no modules). Key pieces:

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece type locked there.
- **Pieces**: `PIECES` defines the 7 standard tetrominoes as square matrices. `rotateCW` rotates via transpose + row reversal.
- **Collision**: `collide(shape, ox, oy)` checks board bounds and overlap with locked cells; used for movement, rotation, and ghost-piece projection.
- **Wall kicks**: `tryRotate` rotates then tries offsets `[0, -1, 1, -2, 2]` until one doesn't collide.
- **Game loop**: `loop(ts)` runs on `requestAnimationFrame`, accumulates `dt` into `dropAccum`, and advances the piece once `dropAccum >= dropInterval`.
- **Line clearing**: `clearLines` scans bottom-up, splices full rows out and unshifts empty rows in; re-checks the same row index after a clear (`r++`) since rows shift down.
- **Scoring/leveling**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`. Level increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Ghost piece**: `ghostY()` projects the current piece straight down until it would collide, drawn at `globalAlpha = 0.2`.
- **State**: module-level mutable globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, ...) reset by `init()`, which is also called by the restart button.

Tunable constants at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
