import * as THREE from '../../vendor/three.module.js';
import {
  DAY_LENGTH_SECONDS, FIXED_DT, HOTBAR_SLOTS, REACH,
  PLAYER_EYE_HEIGHT, MAX_DYNAMIC_POINT_LIGHTS,
} from './config.js';
import { BLOCK, BLOCK_DEFS, blockDef, faceTile } from './blocks.js';
import { World } from './world/world.js';
import { Controller } from './player/controller.js';
import { Interaction } from './player/interaction.js';
import { MobManager } from './mobs/mobs.js';
import { Spawner } from './mobs/spawner.js';
import { Inventory } from './inventory/inventory.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { AudioEngine } from './audio/audio.js';
import { SaveSystem, makeIdbAdapter, shouldAutosave } from './save/save.js';
import { buildAtlas, tileRect, tileIndex } from './render/atlas.js';
import { createTerrainMaterials, updateEnvironmentUniforms } from './render/materials.js';
import { SkyDome } from './render/sky.js';
import { ParticleSystem, TILE_AVG } from './render/particles.js';
import { buildEntityView, updateMobView, setEntitySun } from './render/entityviews.js';

const params = new URLSearchParams(location.search);
const AUTO = params.get('auto') === '1';

const app = document.getElementById('app');
const hudRoot = document.getElementById('hud');
const screenRoot = document.getElementById('screens');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 420);

const atlas = buildAtlas();
const materials = createTerrainMaterials(atlas);
const sky = new SkyDome(scene);
const particles = new ParticleSystem(scene, atlas);

const cutoutTiles = new Set();
for (const d of BLOCK_DEFS) {
  if (d.cutout) {
    cutoutTiles.add(faceTile(d.id, 'px'));
    cutoutTiles.add(faceTile(d.id, 'py'));
  }
}

function seedFromString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const paramsSeed = params.get('seed');

let world = null;
let controller = null;
let interaction = null;
let mobs = null;
let spawner = null;
let hud = null;
let screens = null;
let audio = null;
let save = null;
let inventory = new Inventory();

let running = false;
let dead = false;
let playSeconds = 0;
let hp = 10;
const HP_MAX = 10;
let fedTimer = 0;
let burnTimer = 0;
let poisonTimer = 0;
let magmaTick = 0;
let spawnPoint = { x: 8.5, y: 160, z: 8.5 };
let loadingEl = null;
let debugEl = null;
let debugOn = false;

const mobViews = new Map();
const noises = [];
const keys = new Set();
const mouseDelta = { x: 0, y: 0 };
let mouseDownL = false;
let mouseDownR = false;
let autoT = 0;
let fpsAvg = 60;
let frameMsAvg = 16;

const crackTextures = [];
function buildCrackTextures() {
  for (let s = 0; s < 4; s++) {
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 48;
    const g = c.getContext('2d');
    const r = tileRect('crack_' + s);
    const ax = r.u0 * atlas.canvas.width;
    const ay = (1 - r.v1) * atlas.canvas.height;
    const aw = (r.u1 - r.u0) * atlas.canvas.width;
    const ah = (r.v1 - r.v0) * atlas.canvas.height;
    g.drawImage(atlas.canvas, ax, ay, aw, ah, 0, 0, 48, 48);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    crackTextures.push(t);
  }
}
buildCrackTextures();

const crackMat = new THREE.MeshBasicMaterial({
  map: crackTextures[0], transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.003, 1.003, 1.003), crackMat);
crackMesh.visible = false;
scene.add(crackMesh);

function makeWorld(seed) {
  if (world) world.dispose();
  world = new World(seed);
  world.on('mesh-ready', ({ cx, cz, data }) => uploadChunkMesh(cx, cz, data));
  world.disposeHook = (ch) => disposeChunkMeshes(ch);
}

function disposeChunkMeshes(ch) {
  for (const key of ['meshA', 'meshB']) {
    const m = ch[key];
    if (m) {
      scene.remove(m);
      m.geometry.dispose();
      ch[key] = null;
    }
  }
}

function uploadChunkMesh(cx, cz, data) {
  const ch = world.getChunk(cx, cz);
  if (!ch) return;
  disposeChunkMeshes(ch);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geo.setAttribute('tiles', new THREE.BufferAttribute(data.tiles, 1));
  geo.setAttribute('ao', new THREE.BufferAttribute(data.ao, 1));
  geo.setAttribute('sky', new THREE.BufferAttribute(data.sky, 1));
  geo.setAttribute('blk', new THREE.BufferAttribute(data.blk, 1));
  geo.setAttribute('glow', new THREE.BufferAttribute(data.glow, 3));

  const idxArr = data.indices;
  const triCount = idxArr.length / 3;
  const tiles = data.tiles;
  let opTris = 0;
  for (let t = 0; t < triCount; t++) {
    if (!cutoutTiles.has(tiles[idxArr[t * 3]])) opTris++;
  }
  const reordered = new Uint32Array(idxArr.length);
  let oi = 0;
  let ci = opTris * 3;
  for (let t = 0; t < triCount; t++) {
    const isCut = cutoutTiles.has(tiles[idxArr[t * 3]]);
    for (let v = 0; v < 3; v++) {
      reordered[isCut ? ci++ : oi++] = idxArr[t * 3 + v];
    }
  }
  geo.setIndex(new THREE.BufferAttribute(reordered, 1));
  geo.addGroup(0, opTris * 3, 0);
  if (triCount > opTris) geo.addGroup(opTris * 3, (triCount - opTris) * 3, 1);
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, [materials.opaque, materials.cutout]);
  mesh.position.set(cx * 16, 0, cz * 16);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.frustumCulled = true;
  scene.add(mesh);
  ch.meshA = mesh;
}

function startGame(seed) {
  makeWorld(seed);
  inventory = new Inventory();
  hp = HP_MAX;
  dead = false;
  playSeconds = 0;
  world.timeOfDay = 0.03;
  controller = new Controller(makeInput(), {
    onFootstep: (mat, speedNorm) => audio && audio.footstep(mat, speedNorm),
    onLand: () => audio && audio.place('soft'),
    onFallDamage: (dmg) => damagePlayer(dmg, null),
  });
  interaction = new Interaction(world, controller, inventory, {
    audio,
    particles,
    toast: (t) => hud && hud.showToast(t),
    tileAvg: (name) => TILE_AVG.get(name),
    pushNoise: (x, y, z, r, type) => noises.push({ x, y, z, radius: r, type }),
    onOpenWorkbench: () => {
      if (!running) return;
      screens.setStation('workbench');
      screens.toggleInventory();
      document.exitPointerLock && document.exitPointerLock();
    },
  });
  mobs = new MobManager(world);
  spawner = new Spawner(mobs, seed ^ 0x9e3779b9);
  for (const [, view] of mobViews) scene.remove(view);
  mobViews.clear();
  running = false;
}

const inputState = {
  fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false,
};

function makeInput() {
  return {
    getState() {
      return inputState;
    },
    getLookDelta() {
      const d = { x: mouseDelta.x, y: mouseDelta.y };
      mouseDelta.x = 0;
      mouseDelta.y = 0;
      return d;
    },
  };
}

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (!controller) return;
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= HOTBAR_SLOTS) inventory.setSelected(n - 1);
  }
  if (e.code === 'KeyE' && running && !dead) {
    screens.toggleInventory();
    if (document.pointerLockElement) document.exitPointerLock();
    else renderer.domElement.requestPointerLock();
  }
  if (e.code === 'F3') {
    e.preventDefault();
    debugOn = !debugOn;
    if (debugEl) debugEl.style.display = debugOn ? 'block' : 'none';
  }
});

addEventListener('keyup', (e) => keys.delete(e.code));

addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    mouseDelta.x += e.movementX * 0.0023;
    mouseDelta.y += e.movementY * 0.0023;
  }
});

addEventListener('mousedown', (e) => {
  if (!running || dead) return;
  if (document.pointerLockElement !== renderer.domElement) {
    if (!screensAnyOpen()) renderer.domElement.requestPointerLock();
    return;
  }
  if (e.button === 0) {
    if (!interaction.tryAttack(mobs)) mouseDownL = true;
  } else if (e.button === 2) {
    mouseDownR = true;
    interaction.tryUse();
  }
});

addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDownL = false;
  if (e.button === 2) mouseDownR = false;
});

addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('wheel', (e) => {
  if (!running) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  inventory.setSelected((inventory.selected + dir + HOTBAR_SLOTS) % HOTBAR_SLOTS);
});

function screensAnyOpen() {
  return screens && (screens.invOpen || screens.pauseOpen);
}

document.addEventListener('pointerlockchange', () => {
  if (
    running && !dead && !document.pointerLockElement &&
    !screens.invOpen
  ) {
    screens.togglePause(true);
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

async function initSave() {
  save = new SaveSystem(await makeIdbAdapter());
}

initSave().then(() => boot());

function boot() {
  audio = new AudioEngine({ seed: 1337 });
  hud = new Hud(hudRoot, inventory);
  screens = new Screens(screenRoot, inventory, {
    onStart: () => beginNewRun(),
    onResume: () => resumeFromPause(),
    onSave: () => doSave(),
    onLoad: () => doLoad(),
    onNewWorld: (seedStr) => beginNewRun(seedStr),
    onRespawn: () => respawn(),
  });
  screenRoot.addEventListener('stoneroot-settings', (e) => {
    const s = e.detail || {};
    if (s.master != null) audio.setVolume('master', s.master);
    if (s.ambient != null) audio.setVolume('ambience', s.ambient);
  });
  screens.showTitle();

  addEventListener('beforeunload', () => doSave());
  setInterval(() => {
    if (running) maybeAutosave();
  }, 5000);

  requestAnimationFrame(loop);
}

function beginNewRun(seedStr) {
  const seed = seedStr && seedStr.trim() ? seedFromString(seedStr.trim()) : (Date.now() & 0x7fffffff);
  if (save) save.wipe().catch(() => {});
  startGame(seed);
  enterLoading();
}

function resumeFromPause() {
  if (!world) beginNewRun('');
  else enterLoading();
}

function enterLoading() {
  screens.hideTitle();
  showLoading('the roots stir beneath you...');
  waitForSpawn(() => {
    placePlayerAtSpawn();
    hideLoading();
    running = true;
    screens.hideTitle();
    renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
  });
}

function showLoading(text) {
  hideLoading();
  loadingEl = document.createElement('div');
  loadingEl.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0910;color:#c9c4ba;font-family:Consolas,monospace;font-size:15px;letter-spacing:.12em;z-index:50';
  loadingEl.textContent = text;
  screenRoot.appendChild(loadingEl);
}

function hideLoading() {
  if (loadingEl) {
    loadingEl.remove();
    loadingEl = null;
  }
}

function waitForSpawn(done) {
  const px = 8.5;
  const pz = 8.5;
  const check = () => {
    world.update(px, pz, 12);
    if (world.areaReady(px, pz, 2)) {
      done();
    } else {
      requestAnimationFrame(check);
    }
  };
  check();
}

function placePlayerAtSpawn() {
  const sx = 8.5;
  const sz = 8.5;
  const sy = Math.max(140, world.surfaceHeight(sx, sz)) + 1.2;
  spawnPoint = { x: sx, y: sy + 1, z: sz };
  controller.pos.x = sx;
  controller.pos.y = sy;
  controller.pos.z = sz;
  controller.vel.x = controller.vel.y = controller.vel.z = 0;
  giveStarterKit();
}

function giveStarterKit() {
  inventory.add('torchstake', 2);
  inventory.add('roasted_rootvein', 2);
  inventory.add('fiber', 3);
}

function respawn() {
  hp = HP_MAX;
  dead = false;
  burnTimer = poisonTimer = 0;
  screens.hideDeath();
  controller.respawn({ x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z });
  renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
}

function damagePlayer(amount, sourcePos) {
  if (amount <= 0 || dead) return;
  hp -= amount;
  if (hud) hud.damageFlash(Math.min(1, amount / 6));
  if (audio) audio.hurt();
  if (hp <= 0) {
    hp = 0;
    dead = true;
    mouseDownL = mouseDownR = false;
    screens.showDeath();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

let lastSave = 0;
function maybeAutosave() {
  const now = playSeconds;
  if (shouldAutosave(now, lastSave, 30)) {
    lastSave = now;
    doSave();
  }
}

function diffsToSerializable() {
  const out = [];
  for (const [k, m] of world.diffs) {
    const arr = [...m.entries()].sort((a, b) => a[0] - b[0]);
    out.push([k, arr]);
  }
  return out;
}

async function doSave() {
  if (!save || !world || !controller) return;
  try {
    await save.saveMeta({
      seed: world.seed,
      timeOfDay: world.timeOfDay,
      player: {
        x: controller.pos.x, y: controller.pos.y, z: controller.pos.z,
        yaw: controller.yaw, pitch: controller.pitch, hp,
      },
      inventory: inventory.serialize(),
      playSeconds,
    });
    for (const [k, arr] of diffsToSerializable()) {
      const [cx, cz] = k.split(',').map(Number);
      await save.saveChunkDiffs(cx, cz, arr);
    }
    if (hud) hud.showToast('roots remember');
  } catch (e) {
    void e;
  }
}

async function doLoad() {
  if (!save || !world) return;
  try {
    const meta = await save.loadMeta();
    if (!meta) {
      if (hud) hud.showToast('no memory in the soil');
      return;
    }
    startGame(meta.seed);
    for (const ck of await save.listSavedChunks()) {
      const [cx, cz] = ck.split(',').map(Number);
      const arr = await save.loadChunkDiffs(cx, cz);
      if (arr && arr.length) {
        let dm = world.diffs.get(ck);
        if (!dm) {
          dm = new Map();
          world.diffs.set(ck, dm);
        }
        for (const [i, id] of arr) dm.set(i, id);
      }
    }
    world.timeOfDay = meta.timeOfDay ?? 0.05;
    playSeconds = meta.playSeconds || 0;
    hp = Math.max(1, Math.min(HP_MAX, meta.player.hp ?? HP_MAX));
    enterLoading();
    const restorePlayer = () => {
      controller.pos.x = meta.player.x;
      controller.pos.y = meta.player.y;
      controller.pos.z = meta.player.z;
      controller.yaw = meta.player.yaw;
      controller.pitch = meta.player.pitch;
      const inv = Inventory.load(meta.inventory);
      inventory.slots = inv.slots;
      inventory.selected = inv.selected;
    };
    setTimeout(restorePlayer, 400);
  } catch (e) {
    void e;
  }
}

const pointLights = [];

let emissiveCache = [];
let emissiveTimer = 0;

function updateFixed(dt) {
  readMoveKeys();

  if (AUTO) {
    autoT += dt;
    inputState.fwd = autoT % 14 > 2 ? 1 : 0;
    mouseDelta.x += Math.sin(autoT * 0.22) * 0.0022;
    mouseDelta.y += Math.cos(autoT * 0.11) * 0.0007;
  }

  if (!world || !controller) return;
  controller.update(dt, world);

  world.timeOfDay = (world.timeOfDay + dt / DAY_LENGTH_SECONDS) % 1;
  playSeconds += dt;

  if (mouseDownL && running && !dead) interaction.setMining(true);
  else interaction.setMining(false);
  interaction.update(dt);

  noises.push({
    x: controller.pos.x, y: controller.pos.y, z: controller.pos.z,
    radius: controller.getNoiseRadius(), type: 'move',
  });

  const depthY = controller.pos.y;
  const nightFactor = computeNightLocal(world.timeOfDay);
  const depthThreat = Math.max(0, Math.min(1, (130 - depthY) / 110));
  world.threatLevel = Math.min(1, depthThreat * 0.75 + nightFactor * 0.45);

  if (mobs && spawner) {
    const ctx = {
      world,
      timeOfDay: world.timeOfDay,
      threatLevel: world.threatLevel,
      noises,
      damagePlayer: (amount) => damagePlayer(amount, null),
      spawnParticles: (kind, pos) => {
        if (particles) particles.spawnBurst(pos.x, pos.y + 0.5, pos.z, kind === 'burn' ? '#ff7a29' : '#46e0c8', 8, 0.3, 2.2);
      },
      audio: audio ? { mobVocal: (t, p) => audio.mobVocal(t, p) } : null,
      player: { x: controller.pos.x, y: controller.pos.y, z: controller.pos.z },
    };
    mobs.update(dt, ctx);
    spawner.update(dt, ctx);
    noises.length = 0;

    for (let i = mobs.attackEvents.length - 1; i >= 0; i--) {
      const ev = mobs.attackEvents[i];
      damagePlayer(ev.amount, ev.pos);
    }
    mobs.attackEvents.length = 0;
    for (const ev of mobs.deathEvents) syncMobViews(ev, true);
    mobs.deathEvents.length = 0;

    if (mobs.player && typeof mobs.player === 'object') {
      if (mobs.player.burnTimer != null) burnTimer = mobs.player.burnTimer;
      if (mobs.player.poisonTimer != null) poisonTimer = mobs.player.poisonTimer;
    }
  }

  if (burnTimer > 0) {
    burnTimer -= dt;
    hp -= 1.5 * dt;
  }
  if (poisonTimer > 0) {
    poisonTimer -= dt;
    hp -= 1.0 * dt;
  }
  if (hp <= 0 && !dead) damagePlayer(1, null);

  magmaTick -= dt;
  if (magmaTick <= 0) {
    magmaTick = 0.5;
    const p = controller.pos;
    if (world.isLiquidAt(p.x, p.y + 0.1, p.z) || world.isLiquidAt(p.x, p.y + 0.9, p.z)) {
      damagePlayer(3, null);
      burnTimer = Math.max(burnTimer, 2);
      if (particles) particles.spawnBurst(p.x, p.y + 1, p.z, '#ff7a29', 10, 0.4, 2.4);
    }
  }

  if (fedTimer > 0) {
    fedTimer -= dt;
  } else if (hp < HP_MAX) {
    regenAccum += dt;
    if (regenAccum >= 6) {
      regenAccum = 0;
      hp = Math.min(HP_MAX, hp + 1);
    }
  }

  if (controller.pos.y < -8) {
    damagePlayer(99, null);
  }

  emissiveTimer -= dt;
}

let regenAccum = 0;

function computeNightLocal(tod) {
  const dayAmt = Math.sin(Math.PI * 2 * ((tod + 0.25) % 1));
  return Math.max(0, Math.min(1, 0.5 - dayAmt * 0.9));
}

function readMoveKeys() {
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  inputState.fwd = f;
  inputState.strafe = s;
  inputState.jump = keys.has('Space');
  inputState.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  inputState.crouch = keys.has('ControlLeft') || keys.has('KeyC');
}

function syncHeldLight() {
  const sel = inventory.selectedItem();
  let held = null;
  if (sel) {
    if (sel.id === 'torchstake') held = { radius: 8, color: [1.0, 0.62, 0.28] };
    else if (sel.id === 'lantern') held = { radius: 11, color: [1.0, 0.82, 0.5] };
  }
  pointLights.length = 0;
  if (held && controller) {
    const p = controller.pos;
    pointLights.push({
      x: p.x, y: p.y + PLAYER_EYE_HEIGHT, z: p.z,
      radius: held.radius, r: held.color[0], g: held.color[1], b: held.color[2],
    });
  }
}

function syncMobViews(deathEv, remove) {
  if (!mobs) return;
  for (const mob of mobs.mobs) {
    if (!mobViews.has(mob)) {
      const view = buildEntityView(mob.typeId);
      scene.add(view);
      mobViews.set(mob, view);
    }
  }
  if (remove && deathEv) {
    for (const [mob, view] of mobViews) {
      if (!mobs.mobs.includes(mob)) {
        scene.remove(view);
        mobViews.delete(mob);
        if (particles && deathEv.pos) {
          particles.spawnBurst(deathEv.pos.x, deathEv.pos.y + 0.5, deathEv.pos.z, '#6b6570', 10, 0.35, 2);
        }
      }
    }
  }
}

function animateMobViews(dtFrame) {
  if (!mobs) return;
  for (const [mob, view] of mobViews) {
    updateMobView(view, mob, dtFrame);
  }
}

let lastT = performance.now();
let accTime = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dtRaw = (now - lastT) / 1000;
  lastT = now;
  const dt = Math.min(0.1, Math.max(0.0001, dtRaw));
  frameMsAvg = frameMsAvg * 0.95 + dtRaw * 1000 * 0.05;
  fpsAvg = fpsAvg * 0.95 + (1 / dt) * 0.05;

  if (running && !dead) {
    accTime += dt;
    let guard = 0;
    while (accTime >= FIXED_DT && guard++ < 6) {
      updateFixed(FIXED_DT);
      accTime -= FIXED_DT;
    }
  }

  if (world && controller) {
    world.update(controller.pos.x, controller.pos.z, 6);
    syncMobViews(null, false);

    camera.position.set(
      controller.pos.x,
      controller.pos.y + controller.getEyeHeight(),
      controller.pos.z
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = controller.yaw;
    camera.rotation.x = controller.pitch;

    const eyeLight = world.lightAt(camera.position.x, camera.position.y, camera.position.z);
    sky.update(world.timeOfDay, camera.position, now / 1000);
    const env = sky.getEnvironment();
    const nf = env.nightFactor;
    const dayAmt = Math.max(0, 1 - nf);
    const sunColor = {
      r: 1.05 * (0.12 + 0.88 * dayAmt),
      g: 0.94 * (0.10 + 0.90 * dayAmt),
      b: 0.82 * (0.14 + 0.86 * dayAmt),
    };
    const ambient = {
      r: 0.06 + 0.30 * dayAmt,
      g: 0.06 + 0.31 * dayAmt,
      b: 0.10 + 0.36 * dayAmt,
    };
    setEntitySun(env.sunDir, sunColor, nf);

    syncHeldLight();
    emissiveTimer -= dt;
    if (emissiveTimer <= 0) {
      emissiveTimer = 0.3;
      emissiveCache = collectEmissiveLights();
    }
    const allLights = pointLights.concat(emissiveCache).slice(0, MAX_DYNAMIC_POINT_LIGHTS);

    updateEnvironmentUniforms(materials, {
      sunDir: env.sunDir,
      sunColor,
      ambient,
      fogColor: env.fogColor,
      fogDensity: 0.010 + (camera.position.y < 96 ? 0.011 : 0),
      nightFactor: nf,
      time: now / 1000,
      camPos: camera.position,
      pointLights: allLights,
    });

    particles.update(dt);
    animateMobViews(dt);

    if (audio) {
      audio.setListener(camera.position, controller.yaw);
      const nearHostiles = countNearHostiles();
      audio.setAmbience({
        depthBand: camera.position.y >= 138 ? 'thornwood'
          : camera.position.y >= 96 ? 'loamhollows'
          : camera.position.y >= 48 ? 'fungaldrifts'
          : camera.position.y >= 18 ? 'emberdeep' : 'stillcore',
        isNight: env.nightFactor > 0.55,
        threat: world.threatLevel,
        nearbyHostiles: nearHostiles,
        playerLight: Math.max(eyeLight.blk, eyeLight.sky * (1 - env.nightFactor)),
      });
      audio.update(dt);
    }

    if (hud) {
      hud.update({
        hp,
        hpMax: HP_MAX,
        selectedSlot: inventory.selected,
        lightLevel: Math.max(eyeLight.blk, eyeLight.sky * (1 - env.nightFactor)) / 15,
        depth: Math.round(151 - camera.position.y),
        biome: biomeNameAt(camera.position.y),
        timeOfDay: world.timeOfDay,
      });
    }

    if (interaction) {
      const stage = interaction.stage();
      if (stage >= 0) {
        const ti = interaction.targetInfo();
        if (ti) {
          crackMesh.visible = true;
          crackMesh.position.set(ti.x + 0.5, ti.y + 0.5, ti.z + 0.5);
          if (stage !== interaction.lastStageShown) {
            crackMat.map = crackTextures[stage];
            crackMat.needsUpdate = true;
            interaction.lastStageShown = stage;
          }
        }
      } else {
        crackMesh.visible = false;
        interaction.lastStageShown = -1;
      }
    }
  }

  if (AUTO && world && controller && !window.__stonerootReady && world.areaReady(controller.pos.x, controller.pos.z, 2)) {
    window.__stonerootReady = true;
  }
  window.__stonerootStats = {
    fps: Math.round(fpsAvg),
    frameMs: frameMsAvg.toFixed(1),
    chunks: world ? world.chunks.size : 0,
    drawCalls: renderer.info.render.calls,
    tris: renderer.info.render.triangles,
    mobs: mobs ? mobs.mobs.length : 0,
  };

  if (debugOn && debugEl) {
    debugEl.textContent = JSON.stringify(window.__stonerootStats);
  }

  renderer.render(scene, camera);
}

function countNearHostiles() {
  if (!mobs || !controller) return 0;
  let n = 0;
  for (const m of mobs.mobs) {
    const dx = m.pos.x - controller.pos.x;
    const dy = m.pos.y - controller.pos.y;
    const dz = m.pos.z - controller.pos.z;
    if (dx * dx + dy * dy + dz * dz < 20 * 20) n++;
  }
  return n;
}

function collectEmissiveLights() {
  const out = [];
  if (!controller) return out;
  const px = Math.floor(controller.pos.x);
  const py = Math.floor(controller.pos.y);
  const pz = Math.floor(controller.pos.z);
  const R = 14;
  const seen = new Set();
  for (let dy = -R; dy <= R; dy += 1) {
    for (let dz = -R; dz <= R; dz += 1) {
      for (let dx = -R; dx <= R; dx += 1) {
        const wx = px + dx;
        const wy = py + dy;
        const wz = pz + dz;
        if (wy < 0 || wy >= 192) continue;
        const ch = world.getChunk(wx >> 4, wz >> 4);
        if (!ch || !ch.lit) continue;
        const id = ch.voxels[(wx & 15) | ((wz & 15) << 4) | (wy << 8)];
        const d = blockDef(id);
        if (!d.lightSource || d.lightSource < 11) continue;
        const k = `${wx},${wy},${wz}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const dist2 = dx * dx + dy * dy + dz * dz;
        if (dist2 > R * R) continue;
        const warm = id === BLOCK.MAGMA;
        out.push({
          x: wx + 0.5, y: wy + 0.5, z: wz + 0.5,
          radius: 4 + d.lightSource * 0.45,
          r: warm ? 1.0 : 0.35, g: warm ? 0.42 : 0.85, b: warm ? 0.12 : 0.78,
        });
        if (out.length >= MAX_DYNAMIC_POINT_LIGHTS - 1) return dedupeNear(out);
      }
    }
  }
  return dedupeNear(out);
}

function dedupeNear(list) {
  list.sort((a, b) => {
    const da = (a.x - controller.pos.x) ** 2 + (a.z - controller.pos.z) ** 2;
    const db = (b.x - controller.pos.x) ** 2 + (b.z - controller.pos.z) ** 2;
    return da - db;
  });
  return list.slice(0, MAX_DYNAMIC_POINT_LIGHTS - 1);
}

function biomeNameAt(y) {
  if (y >= 138) return 'THORNWOOD';
  if (y >= 96) return 'LOAM HOLLOW';
  if (y >= 48) return 'FUNGAL DRIFT';
  if (y >= 18) return 'EMBERDEEP';
  return 'STILL CORE';
}

debugEl = document.createElement('div');
debugEl.style.cssText =
  'position:absolute;top:8px;left:8px;background:rgba(10,8,14,.8);color:#9be8d8;font:12px Consolas,monospace;padding:6px 9px;border:1px solid #33283f;display:none;z-index:60;white-space:pre';
screenRoot.appendChild(debugEl);

if (AUTO) {
  startGame(paramsSeed ? seedFromString(paramsSeed) : 20260823);
  world.timeOfDay = 0.06;
  waitForSpawn(() => {
    placePlayerAtSpawn();
    running = true;
  });
}
