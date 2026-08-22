# STONEROOT System Interfaces (binding contract)

Every system owner MUST read this file plus src/config.js and src/blocks.js before writing code.
The orchestrator owns: main.js, index.html, server.js, package.json, INTERFACES.md, src/config.js,
src/blocks.js, src/world/world.js (chunk manager), src/world/lighting.js, and all cross-system glue.
Nobody else edits those files.

## House rules

- ES modules only. No bundler. Browser loads natively; node runs tests.
- Three.js may ONLY be imported under src/render/. All game logic must be plain JS (node-testable).
- No comments in code. No placeholder returns. Every function does real work.
- Deterministic worldgen: pure function of (seed,x,y,z). Seeded noise only, never Math.random().
- World Y range 0..191. Chunk column = 16x192x16. Voxel index i = x | (z<<4) | (y<<8).
- Per chunk storage: Uint8Array(49152) voxels + Uint8Array(49152) light
  (high nibble blocklight 0..15, low nibble skylight 0..15).

## Ownership map

- worldgen agent: src/world/noise.js, src/world/worldgen.js
- mesher agent: src/world/mesher.js
- physics agent: src/physics/physics.js, src/physics/raycast.js, src/player/controller.js
- mobs agent: src/mobs/mobs.js, src/mobs/pathfind.js, src/mobs/spawner.js
- items agent: src/items/items.js, src/items/crafting.js, src/inventory/inventory.js
- ui agent: src/ui/hud.js, src/ui/screens.js
- audio agent: src/audio/audio.js
- render agent: src/render/atlas.js, src/render/materials.js, src/render/sky.js, src/render/particles.js, src/render/entityviews.js
- save agent: src/save/save.js
- perf agent: tools/profiler.js

Each agent also owns matching test files under tests/.

## Contracts

### World API (orchestrator-provided, consumed by all)

world.getBlock(x,y,z) -> id (0 if unloaded; y<0 solid, y>=192 air)
world.isSolid(x,y,z) -> bool
world.setBlock(x,y,z,id) -> records diff, relights locally, queues remesh
world.getSky(x,y,z), world.getBlockLight(x,y,z) -> 0..15
world.surfaceHeight(x,z) -> int y of topmost solid + 1
world.on/off/emit: events 'chunk-ready'{cx,cz}, 'block-changed'{x,y,z,id}, 'chunk-unload'{cx,cz}
world.timeOfDay -> 0..1 (0 dawn, .25 noon, .5 dusk, .75 midnight)
world.threatLevel -> 0..1 escalation factor

### Noise + worldgen (pure, worker-safe)

src/world/noise.js exports:
makeRng(seed) -> () => float [0,1)
hash2(seed,x,z) -> [0,1); hash3(seed,x,y,z) -> [0,1)
valueNoise2/fbm2, valueNoise3/fbm3, ridged3 for worm caves

src/world/worldgen.js exports:
makeWorldgen(seed) -> { generateChunk(cx,cz) -> { voxels: Uint8Array(49152),
surfaceY: Uint8Array(256) topmost-solid+1 per column } }

Rules: CORESTONE floor y<=2. Thornwood surface w/ twisted ROOTWOOD trees + flora. Depth bands per
config.BIOME_BANDS. Caves: ridged worm tunnels + fbm cheese pockets + rare ravines. Ores depth-gated
(ferrite shallow-mid, cupral deep, lumen near core). Magma pools in emberdeep. Glowcap/crystal light
sources in fungal/core biomes.

### Mesher (pure, worker-safe)

src/world/mesher.js exports meshChunk({voxels, lights, neighbors}) ->
{ positions, normals, uvs, tiles, ao, sky, blk, glow, indices }
positions chunk-local (0..16, 0..192, 0..16). uvs tile-local 0..1. tiles = per-vertex config.TILE
index. ao per-vertex 0..1 classic corner rule levels {1.0,0.82,0.66,0.5}. sky/blk per-vertex from the
ADJACENT AIR voxel light /15. glow rgb emissive tint from block def emissive color.
neighbors = {px,nx,pz,nz, corners:{pp,pn,np,nn}} each {voxels,lights} or null.
null neighbor => treat as opaque (no face drawn). Greedy merge constrained to equal
(tile,ao,sky,blk,glow) tuples. Cull faces vs opaque; leaves/cutout render but never cull neighbors.
CROSS blocks: two diagonal quads, full-bright sides use own voxel light. LIQUID magma top face at y+0.88.

### Physics + raycast (pure math on {x,y,z})

src/physics/physics.js exports:
moveAABB(world, pos, vel, halfExtents, dt) -> {onGround, collidedX/Y/Z} mutates pos/vel, swept axis-by-axis vs solids.
src/physics/raycast.js exports:
raycastVoxel(world, ox,oy,oz, dx,dy,dz, maxDist, hitLiquid=false) -> null | {x,y,z, nx,ny,nz, id, dist}
DDA Amanatides-Woo. Normal is the entered-face normal.
src/player/controller.js exports:
class Controller { constructor(input, opts); update(dt, world) mutates camera state {pos:{x,y,z}, yaw, pitch}; intents from input provider {fwd,strafe,jump,sprint,crouch}; emits footstep events via callback onFootstep(matName,speed); exposes noiseRadius for mob hearing. }

### Mobs (pure logic; visuals live in render/entityviews.js)

src/mobs/mobs.js exports MOB_TYPES registry:
thornhound (night surface pack hunter, flees torchlight radius>7)
rootling (small swarm scavenger, attracted to dropped-item noises, fears light)
gloomcap (cave ambush: dormant disguised until player within 6 and unlit, then lunge burst)
ashwisp (floats near magma, swarm flocking, burn touch)
hollowone (blind deep stalker, hunts last-heard noise position, freezes when lit by blocklight>=8)
sporeling (passive grazer until damaged, then swarm retaliation)
Each type def: {id,name,hp,speed,damage,hostile,aabb:{w,h},senses,biome:[bands],lightFear,soundHearing,spawnWeight}
class MobManager { update(dt, ctx) where ctx={world,timeOfDay,threatLevel,player,noises[]}; spawn/despawn budgeted; damageMob(mob,amount,knockback); list of active mobs with pos,aabb,state; emits 'mob-hurt','mob-died','mob-attack-player'. }
src/mobs/pathfind.js exports findPath(world, start, goal, maxNodes=400) -> array of step positions or null; walkable = solid below + 2 air above, allows 1-jump-ups and safe drops<=3.
src/mobs/spawner.js: depth/biome/light-gated spawn attempts around player, caps active hostiles scaled by threatLevel.

Noise system contract: gameplay code pushes noises {x,y,z,radius,type} into ctx.noises each tick; manager drains it.

### Items / crafting / inventory (pure)

src/items/items.js exports ITEMS registry keyed by string item id. Fields:
{name, stack (default 64), place:blockId?, tool:{kind:'pick'|'axe'|'shovel'|'blade', tier:0..3, speed, durabilityMax, damage}?, food:{heal}?, light?:blockId when placed}
Must define 34+ items incl: torchstake, lantern, heartplank, stonebrick, workbench, ferrite_chunk,
cupral_chunk, lumen_dust, crystal_shard, fiber, splint(stick analog), ash, spore, gloomberry,
roasted_rootvein, rootstew, chipped_pick/axe/shovel/blade, ferrite_pick/axe/shovel/blade,
emberforged_pick/axe/shovel/blade, bandage, emberpaste, gloomberry_tart... plus block-place items
for every placeable block.
src/items/crafting.js exports RECIPES + canCraft(recipe, invCountFn), consumeInputs(), craftableList(station|null).
Recipes gated by station 'workbench' for tier>=2 gear and lantern etc.
src/inventory/inventory.js exports class Inventory { slots[36]; add(id,count)->leftover; remove(id,count); count(id); hotbar view 0..8; selected index; serialize()/load(data); moveBetween(a,b). }

### Audio (WebAudio synth, no assets)

src/audio/audio.js exports class AudioEngine { unlock() on user gesture; setListener(pos,yaw);
footstep(mat,speed); dig(mat); breakBlock(mat); place(mat); hurt(); mobVocal(type,pos); attackHit();
craft(); pickup(); setAmbience({depthBand,isNight,threat,nearbyHostiles}); playPositional(type,pos). }
All sounds synthesized (noise buffers, oscillators, biquads, envelopes). Positional via PannerNode.

### Save (injectable storage adapter)

src/save/save.js exports class SaveSystem(adapter) ; makeIdbAdapter() for browser; adapter iface:
get(key), put(key,val), del(key), keys(). Data: meta {seed,timeOfDay,player{pos,yaw,pitch,hp},inventory},
chunks store key "cx,cz" -> Array<[idx,id]> diffs. API: saveAll(meta,diffs), loadMeta(), loadDiffs(),
wipe(). Round-trip must be lossless.

### Render (three allowed here)

atlas.js builds canvas atlas from config.TILES order (48px cells, ATLAS_TILES_PER_ROW=8 => 384px;
use nearest filter + mipmap off OR generate mipmaps manually; deterministic painters per tile name,
original art: no grass-green turf, no creeper/orange-torch cliches; palette: ash-grey, bruise purple,
bone pale, ember orange, spore cyan).
materials.js: custom ShaderMaterial consuming ALL mesher attributes; uniforms: uAtlas, fogColor,
fogDensity, sunDir, sunColor, ambientColor, time, pointLights[MAX_DYNAMIC_POINT_LIGHTS] (pos+color+radius
array), nightFactor. Fragment: tile sample w/ fract(uv)*cellScale+offset; alpha cutout <0.5 discard for
cutout tiles; lighting = max(sky*sunFactor, blk*torchColorTint) * ao * faceShade + glowEmissive +
dynamicPointLights falloff; biome/height fog mix; subtle noise grain dithering to avoid banding.
sky.js: big dome shader w/ day-night gradient, sun disc "the Ember" pale-white, moon "the Husk",
stars at night, horizon ash haze; drives world.timeOfDay visuals.
particles.js: pooled instanced break/place particles colored by tile average color.
entityviews.js: procedural original mob meshes per MOB_TYPES (box/cone assemblies, flat shaded,
emissive accents), walk anim via limb swing, hit flash.

### Perf

tools/profiler.js: rAF frame timing ring, marks for gen/mesh/light budgets, exposes overlay stats
(fps, frametime p95, chunks loaded/queued, draw calls) toggled with F3-style key (main wires it).
