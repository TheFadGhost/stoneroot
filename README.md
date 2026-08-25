# stoneroot

> **built with ox alpha**
>
> most of this was written in august 2026 during the free preview window of
> [ox alpha](https://openrouter.ai/stealth/ox-alpha), an anonymous stealth model
> that turned up on openrouter for about a week. i set the direction and reviewed
> what came back. the tests are real and they pass — clone it and run them.

a voxel survival game that runs in the browser: chunked world, seeded terrain
generation, six mob types with their own ai, crafting, and a swept-aabb physics
system, all in plain js with three.js used only for rendering.

## Running it

```
npm start
```

opens a dev server on `http://localhost:8080` (`server.js`, a plain
`node:http` static file server, no framework). load that url in a browser —
`index.html` imports `three` from `./vendor/three.module.js` via an import
map and boots `src/main.js`.

## How it works

world storage is a flat chunk column, 16x192x16 voxels, index
`x | (z << 4) | (y << 8)`. each chunk is two `Uint8Array(49152)` buffers —
one for block ids, one for light, packed as block-light/sky-light nibbles in
a single byte. this and the layout rules live in `INTERFACES.md`, which the
code actually follows.

worldgen (`src/world/worldgen.js`, `src/world/noise.js`) is a pure function
of `(seed, x, y, z)`: a seeded 32-bit rng plus integer hash functions
(`hash2`/`hash3`) feed value noise, fbm, and ridged noise for worm-shaped
cave tunnels. no `Math.random()` anywhere in generation. two tests
(`tests/worldgen.test.js`) regenerate the same chunk and assert the output
bytes are identical, and assert generation order doesn't change the result —
both pass.

the mesher (`src/world/mesher.js`, 812 lines) does greedy quad merging,
constrained to vertices sharing the same (tile, ao, sky-light, block-light,
glow) tuple, plus the classic four-level corner ao. it and worldgen both run
off the main thread via `src/workers/genworker.js` and
`src/workers/meshworker.js`.

physics (`src/physics/physics.js`) is swept aabb collision: velocity is
substepped when displacement per frame exceeds 0.4 blocks, resolved per axis
against solid voxels. raycasting (`src/physics/raycast.js`) is DDA
(amanatides-woo), returning the entered-face normal.

mob pathfinding (`src/mobs/pathfind.js`, 191 lines) is a real A*: binary min
-heap open set, octile distance heuristic, closed set, step-up/drop-down
costs baked into edge weight. six mob types are defined in
`src/mobs/mobs.js` (thornhound, rootling, gloomcap, ashwisp, hollowone,
sporeling), each with a distinct behavior — light-fear thresholds, noise
tracking, ambush/dormant states — covered individually in
`tests/mobs.test.js`.

light propagation (`src/world/lighting.js`) is bfs over a queue, separately
for sky light and block light, both stored as 4-bit channels.

crafting (`src/items/crafting.js`) is a flat list of 24 recipes with station
gating (`workbench` required for tier-2+ gear), not an explicit graph
structure — `canCraft`/`craft`/`listCraftable` just check input counts
against inventory. items (`src/items/items.js`) register 52 entries:
tools with tiers and durability, food, placeable blocks, light sources.

audio (`src/audio/audio.js`, 831 lines) is entirely synthesized webaudio —
oscillators, noise buffers, biquads, positional panner nodes — no audio
files in the repo.

rendering (`src/render/`) is the only place three.js is allowed to be
imported, enforced by convention in `INTERFACES.md`, not by tooling. it's a
vendored single file (`vendor/three.module.js`, ~1.3mb, checked into the
repo), not an npm dependency — `package.json` lists no dependencies at all,
and nothing under `src/` outside `render/` imports it.

## Tests

```
npm test
```

runs `node --test` over `tests/*.test.js` via `tests/run.js`. observed
result on a clean clone: **84 tests, 84 passing, 0 failing**, in under a
second. this includes the byte-identical worldgen regen checks described
above.

## Known limitations

"zero-dependency" is true for npm — there's no `node_modules`, no build
step, no bundler — but the repo does vendor a full copy of three.js for
rendering. game logic (everything outside `src/render/`, roughly 9,500
lines) has no external library in it and is directly testable under node,
which is what the test suite exercises. the render path itself — the actual
three.js scene, shaders, and canvas output — isn't covered by the test
suite; the 84 passing tests check logic, not pixels. the repo currently has
a single squashed commit, so there's no incremental history.
