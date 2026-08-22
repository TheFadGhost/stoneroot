import test from 'node:test';
import assert from 'assert/strict';
import { findPath } from '../src/mobs/pathfind.js';
import { MobManager, MOB_TYPES } from '../src/mobs/mobs.js';
import { Spawner } from '../src/mobs/spawner.js';

class MockWorld {
  constructor(floorY) {
    this.floorY = floorY;
    this.blocks = new Map();
    this.blockLight = new Map();
  }

  key(x, y, z) {
    return x + ',' + y + ',' + z;
  }

  getBlock(x, y, z) {
    if (y < 0) return 3;
    const b = this.blocks.get(this.key(x, y, z));
    if (b !== undefined) return b;
    return y <= this.floorY ? 3 : 0;
  }

  setBlock(x, y, z, id) {
    this.blocks.set(this.key(x, y, z), id);
  }

  isSolid(x, y, z) {
    return this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== 0;
  }

  setBlockLight(x, y, z, v) {
    if (v > 0) this.blockLight.set(this.key(x, y, z), v);
    else this.blockLight.delete(this.key(x, y, z));
  }

  clearBlockLights() {
    this.blockLight.clear();
  }

  getBlockLight(x, y, z) {
    return this.blockLight.get(this.key(x, y, z)) || 0;
  }

  getSky() {
    return 0;
  }

  surfaceHeight(x, z) {
    let y = 191;
    while (y > 0 && !this.isSolid(x, y, z)) y--;
    return y + 1;
  }
}

function mkCtx(world, playerPos, extra = {}) {
  return {
    world,
    player: { pos: playerPos },
    timeOfDay: extra.timeOfDay ?? 0.25,
    threatLevel: extra.threatLevel ?? 0,
    noises: extra.noises ?? [],
    damagePlayer: extra.damagePlayer ?? (() => {}),
    audio: extra.audio,
    spawnParticles: extra.spawnParticles,
  };
}

function runTicks(manager, ctx, n, dt = 1 / 60) {
  for (let i = 0; i < n; i++) manager.update(dt, ctx);
}

test('gloomcap stays dormant when player far in the dark', () => {
  const w = new MockWorld(40);
  const M = new MobManager(w);
  const gc = M.spawnMob('gloomcap', 5, 41, 5);
  runTicks(M, mkCtx(w, { x: 5, y: 41, z: 16 }), 90);
  assert.equal(gc.state, 'dormant');
  assert.equal(gc.pos.x, 5);
  assert.equal(gc.pos.z, 5);
});

test('gloomcap transitions alert windup lunge when player near in dark', () => {
  const w = new MockWorld(40);
  const M = new MobManager(w);
  const gc = M.spawnMob('gloomcap', 20, 41, 20);
  const seen = new Set();
  const ctx = mkCtx(w, { x: 24, y: 41, z: 20 });
  for (let i = 0; i < 150; i++) {
    M.update(1 / 60, ctx);
    seen.add(gc.state);
    if (seen.has('lunge') && seen.has('windup') && seen.has('alert')) break;
  }
  assert.ok(seen.has('alert'), 'expected alert state, saw: ' + [...seen]);
  assert.ok(seen.has('windup'), 'expected windup state, saw: ' + [...seen]);
  assert.ok(seen.has('lunge'), 'expected lunge state, saw: ' + [...seen]);
  const speed = Math.hypot(gc.vel.x, gc.vel.z);
  assert.ok(speed > 2, 'lunge should carry burst velocity');
});

test('gloomcap does not ambush when its cell is lit', () => {
  const w = new MockWorld(40);
  w.setBlockLight(30, 41, 30, 6);
  w.setBlockLight(30, 42, 30, 6);
  const M = new MobManager(w);
  const gc = M.spawnMob('gloomcap', 30.4, 41, 30.4);
  runTicks(M, mkCtx(w, { x: 32, y: 41, z: 30 }), 150);
  assert.equal(gc.state, 'dormant');
  assert.equal(gc.hp, MOB_TYPES.gloomcap.hp);
});

test('hollowone walks toward heard noise and drains ctx.noises', () => {
  const w = new MockWorld(40);
  const M = new MobManager(w);
  const ho = M.spawnMob('hollowone', 60, 41, 60);
  const ctx = mkCtx(w, { x: 200, y: 41, z: 200 });
  ctx.noises.push({ x: 40, y: 41, z: 60, radius: 6, type: 'footstep' });
  M.update(1 / 60, ctx);
  assert.equal(ctx.noises.length, 0, 'noises must be drained each tick');
  runTicks(M, ctx, 240);
  assert.ok(ho.mem !== null || ho.state === 'hunt' || ho.pos.x < 50, 'hollowone should investigate the noise');
  assert.ok(ho.pos.x < 55, 'moved toward noise position, x=' + ho.pos.x.toFixed(2));
});

test('hollowone freezes under blocklight and resumes in dark', () => {
  const w = new MockWorld(40);
  const M = new MobManager(w);
  const ho = M.spawnMob('hollowone', 60, 41, 60);
  const ctx = mkCtx(w, { x: 200, y: 41, z: 200 });
  ctx.noises.push({ x: 40, y: 41, z: 60, radius: 6, type: 'footstep' });
  M.update(1 / 60, ctx);
  for (let x = 44; x <= 54; x++) {
    for (let z = 56; z <= 64; z++) {
      w.setBlockLight(x, 42, z, 10);
      w.setBlockLight(x, 43, z, 10);
    }
  }
  let froze = false;
  for (let i = 0; i < 400 && !froze; i++) {
    M.update(1 / 60, ctx);
    if (ho.state === 'frozen') froze = true;
  }
  assert.ok(froze, 'should reach frozen state inside lit strip, x=' + ho.pos.x.toFixed(2) + ' state=' + ho.state);
  const fx = ho.pos.x;
  const fy = ho.pos.y;
  const fz = ho.pos.z;
  runTicks(M, ctx, 30);
  assert.equal(ho.state, 'frozen');
  assert.equal(ho.pos.x, fx);
  assert.equal(ho.pos.y, fy);
  assert.equal(ho.pos.z, fz);
  w.clearBlockLights();
  runTicks(M, ctx, 90);
  assert.notEqual(ho.state, 'frozen');
  assert.ok(ho.pos.x < fx - 0.05, 'resumed hunting after dark');
});

test('thornhound flees lit cells outward', () => {
  const w = new MockWorld(140);
  const CX = 30;
  const CZ = 30;
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -5; dz <= 5; dz++) {
      if (dx * dx + dz * dz <= 25) {
        w.setBlockLight(CX + dx, 141, CZ + dz, 12);
        w.setBlockLight(CX + dx, 142, CZ + dz, 12);
      }
    }
  }
  const M = new MobManager(w);
  const hound = M.spawnMob('thornhound', 33, 141, 33);
  const ctx = mkCtx(w, { x: 60, y: 141, z: 60 });
  const startDist = Math.hypot(hound.pos.x - CX, hound.pos.z - CZ);
  let sawFlee = false;
  for (let i = 0; i < 480; i++) {
    M.update(1 / 60, ctx);
    if (hound.state === 'flee') sawFlee = true;
  }
  const endDist = Math.hypot(hound.pos.x - CX, hound.pos.z - CZ);
  assert.ok(sawFlee, 'flee state should trigger in bright cells');
  assert.ok(
    endDist > startDist + 1.5,
    'hound should end farther from light: start=' + startDist.toFixed(2) + ' end=' + endDist.toFixed(2)
  );
});

test('findPath routes around a wall with valid reachable steps', () => {
  const w = new MockWorld(40);
  for (let z = -6; z <= 6; z++) {
    for (let y = 41; y <= 42; y++) w.setBlock(10, y, z, 18);
  }
  const p = findPath(w, -5, 41, 0, 25, 41, 0, 900);
  assert.ok(p && p.length > 0, 'path around wall should exist');
  assert.ok(Math.abs(p[0].x - -5) <= 1 && Math.abs(p[0].z - 0) <= 1, 'first step adjacent to start');
  const last = p[p.length - 1];
  assert.ok(Math.abs(last.x - 25) <= 1 && Math.abs(last.z - 0) <= 1, 'last step at goal');
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    assert.ok(
      Math.abs(b.x - a.x) <= 1.5 && Math.abs(b.z - a.z) <= 1.5 && Math.abs(b.y - a.y) <= 3.2,
      'consecutive steps reachable: ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b)
    );
    assert.ok(!w.isSolid(b.x, b.y, b.z), 'step cell passable');
    assert.ok(!w.isSolid(b.x, b.y + 1, b.z), 'step cell headroom');
    assert.ok(w.isSolid(b.x, b.y - 1, b.z), 'step cell supported');
  }
  for (let x = 22; x <= 28; x++) {
    for (let z = 47; z <= 53; z++) {
      const edge = x === 22 || x === 28 || z === 47 || z === 53;
      if (edge) {
        for (let y = 41; y <= 42; y++) w.setBlock(x, y, z, 18);
      }
    }
  }
  const q = findPath(w, 25, 41, 40, 25, 41, 50, 400);
  assert.equal(q, null, 'sealed room must yield null path');
});

test('damageMob hurts knocks back kills and triggers sporeling retaliation', () => {
  const w = new MockWorld(40);
  const M = new MobManager(w);
  const a = M.spawnMob('sporeling', 10, 41, 10);
  const b = M.spawnMob('sporeling', 12, 41, 11);
  M.damageMob(a, 3, { x: 4, y: 1, z: -2 });
  assert.equal(a.hp, MOB_TYPES.sporeling.hp - 3);
  assert.equal(a.flashTimer, 0.15);
  assert.equal(a.stunTimer, 0.22);
  assert.ok(a.vel.x > 3, 'knockback applied to vel.x');
  assert.ok(a.vel.z < -1, 'knockback applied to vel.z');
  assert.equal(a.aggro, true);
  assert.equal(b.state, 'retaliate', 'nearby sporeling retaliates');
  assert.equal(b.aggro, true);
  M.damageMob(a, 999, { x: 0, y: 0, z: 0 });
  assert.ok(a.dead);
  assert.ok(!M.mobs.includes(a), 'dead mob removed from active list');
  assert.equal(M.deathEvents.length, 1);
  assert.equal(M.deathEvents[0].typeId, 'sporeling');
  assert.deepEqual(M.deathEvents[0].pos, { x: 10, y: 41, z: 10 });
});

test('spawner produces night spawns respects caps and despawns far mobs', () => {
  const w = new MockWorld(140);
  const M = new MobManager(w);
  const sp = new Spawner(M, 12345);
  const ctx = mkCtx(w, { x: 200, y: 141, z: 200 }, { timeOfDay: 0.75, threatLevel: 1 });
  for (let s = 0; s < 8; s++) sp.update(1, ctx);
  const c = M.counts();
  assert.ok(c.total > 0, 'expected spawns at night, attempts=' + sp.attemptCount + ' fail=' + sp.lastFail);
  assert.ok(c.hostile <= 8 + 14, 'hostile cap respected');
  assert.ok(c.passive <= 10, 'passive cap respected');
  for (const m of M.mobs) {
    assert.ok(Object.hasOwn(MOB_TYPES, m.typeId), 'registered type');
    const d = Math.hypot(m.pos.x - 200, m.pos.z - 200);
    assert.ok(d >= 19 && d <= 45, 'ring distance 20..44, got ' + d.toFixed(1));
  }
  while (M.counts().hostile < 8 + 14) M.spawnMob('thornhound', 205, 141, 205);
  const hostileBefore = M.counts().hostile;
  sp.update(2, ctx);
  assert.ok(M.counts().hostile <= hostileBefore, 'no hostiles past cap');
  assert.ok(M.counts().passive <= 10, 'no passives past cap');
  const far = M.spawnMob('sporeling', 270, 141, 200);
  sp.update(0.016, ctx);
  assert.ok(!M.mobs.includes(far), 'mob beyond 64m despawns');
});
