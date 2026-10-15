# outbound

Physics-based space exploration game that runs in the browser. Vanilla JavaScript (ES modules), HTML canvas, no build step, no dependencies.

## Running

```
node server.js   # serves the repo at http://localhost:3333 (PORT env var overrides)
```

ES modules and `fetch` of map files need HTTP, so open the game through the server, not `file://`. There are no tests or linters; verify changes by running the game.

## Layout

- `index.html` / `style.css`: page shell and menus; loads `game.js` as a module.
- `game.js`: entry point. Main loop, DOM wiring, menus, save/load (localStorage).
- `state.js`: shared mutable state (ship, zoom, game time, flags) with setter functions.
- `constants.js`: all tuning values (ship, physics, gravity, fuel, ranges). Put new magic numbers here.
- `update.js`: per-frame simulation (physics, gravity, fuel, interactions).
- `world.js`: seeded procedural generation in chunks (`CHUNK_SIZE`), plus interstellar mode.
- `preset-map.js` + `maps/*.json`: hand-made preset maps (planets, stations, spawn point).
- `objects/`: generation and rendering for planets, asteroids, stations, debris, starships.
- `render-world.js`, `render-ship.js`, `render-hud.js`: canvas drawing, split by layer.
- `input.js`: keyboard, mouse-wheel, and mouse click state. HUD menus register click regions with `addClickRegion`; hover selects and click presses Space (or a given key), reusing the keyboard code paths.
- `station-prefixes.json`: name parts for generated stations.
- `todo.txt`: feature backlog and known bugs.

## Conventions

- Tabs for indentation, single quotes, semicolons.
- Relative ES module imports with explicit `.js` extensions.
- Chunk generation must stay deterministic for a given seed: use the seeded RNG (`mulberry32`) for anything that defines world objects. `Math.random()` is fine for cosmetic effects like the background star field.
- Exported `let` state is changed only through its setter in `state.js`.
- `server.js` serves every file in the repo, so never put secrets here.
