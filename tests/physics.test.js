import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveAABB, fallDamage, aabbOverlapsVoxels } from '../src/physics/physics.js';
import { raycastVoxel } from '../src/physics/raycast.js';
import { Controller } from '../src/player/controller.js';
import {
  GRAVITY,
  TERMINAL_VELOCITY,
  JUMP_SPEED,
  FIXED_DT,
} from '../src/config.js';
import { BLOCK, blockDef } from '../src/blocks.js';

class MockWorld {
  constructor() {
    this.blocks = new Map();
  }
  set(x, y, z, id) {
    this.blocks.set(`${x},${y},${z}`, id);
  }
  fill(x0, x1, y0, y1, z0, z1, id) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
      }
    }
  }
  getBlock(x, y, z) {
    if (y < 0) return BLOCK.CORESTONE;
    const id = this.blocks.get(`${x},${y},${z}`);
    return id === undefined ? BLOCK.AIR : id;
  }
  isSolid(x, y, z) {
    return blockDef(this.getBlock(x, y, z)).solid === true;
  }
}

function makeFloorWorld() {
  const w = new MockWorld();
  w.fill(-64, 64, 99, 99, -64, 64, BLOCK.THORNSOIL);
  return w;
}

function makeWallWorld() {
  const w = makeFloorWorld();
  w.fill(10, 10, 100, 106, -64, 64, BLOCK.STONEBRICK);
  return w;
}

const HE = { w: 0.62, h: 1.82 };

test('gravity drop lands exactly standing on floor top', () => {
  const world = makeFloorWorld();
  const pos = { x: 5.5, y: 105, z: 3.5 };
  const vel = { x: 0, y: 0, z: 0 };
  let res;
  for (let i = 0; i < 400; i++) {
    vel.y = Math.max(vel.y - GRAVITY * FIXED_DT, -TERMINAL_VELOCITY);
    res = moveAABB(world, pos, vel, HE, FIXED_DT);
  }
  assert.ok(res.onGround, 'should be on ground');
  assert.ok(Math.abs(pos.y - 100) < 1e-6, `feet at floor top, got ${pos.y}`);
  assert.ok(Math.abs(vel.y) < 1e-9, `vertical velocity zeroed, got ${vel.y}`);
});

test('wall stop: huge velocity into 1-thick wall blocks without tunneling', () => {
  const world = makeWallWorld();
  const pos = { x: 8.5, y: 100, z: 3.5 };
  const vel = { x: 50, y: 0, z: 0 };
  const res = moveAABB(world, pos, vel, HE, 0.5);
  assert.ok(res.hitX, 'x collision reported');
  assert.equal(vel.x, 0);
  assert.ok(pos.x <= 10 - 0.31 + 1e-9, `stopped before wall face minus half extent, got ${pos.x}`);
  assert.ok(pos.x >= 10 - 0.31 - 0.01, 'not clamped further than needed');
  const overlap = aabbOverlapsVoxels(
    world,
    { x: pos.x - 0.31, y: 100, z: 3.19 },
    { x: pos.x + 0.31, y: 101.82, z: 3.81 }
  );
  assert.equal(overlap.length, 0);
});

test('tunneling guard: terminal velocity fall onto 1-thick floor stops on top', () => {
  const world = makeFloorWorld();
  const pos = { x: 5.5, y: 300, z: 3.5 };
  const vel = { x: 0, y: -TERMINAL_VELOCITY, z: 0 };
  const res = moveAABB(world, pos, vel, HE, 8);
  assert.ok(res.onGround, 'landed within single giant-dt call');
  assert.ok(Math.abs(pos.y - 100) < 1e-6, `resting on floor top, got ${pos.y}`);
  assert.equal(vel.y, 0);
});

test('jump apex reaches expected height then returns to ground', () => {
  const world = makeFloorWorld();
  const pos = { x: 5.5, y: 100, z: 3.5 };
  const vel = { x: 0, y: JUMP_SPEED, z: 0 };
  let apex = pos.y;
  let res;
  for (let i = 0; i < 300; i++) {
    vel.y -= GRAVITY * FIXED_DT;
    res = moveAABB(world, pos, vel, HE, FIXED_DT);
    apex = Math.max(apex, pos.y);
    if (i > 20 && res.onGround) break;
  }
  const expectedApex = 100 + (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
  assert.ok(Math.abs(apex - expectedApex) < 0.08, `apex ${apex} vs ${expectedApex}`);
  assert.ok(res.onGround, 'back on ground');
  assert.ok(Math.abs(pos.y - 100) < 1e-6);
});

test('raycast straight down hits floor top face with correct dist', () => {
  const world = makeFloorWorld();
  const hit = raycastVoxel(world, 5.5, 105, 3.5, 0, -1, 0, 30);
  assert.ok(hit, 'hit expected');
  assert.deepEqual([hit.x, hit.y, hit.z], [5, 99, 3]);
  assert.deepEqual([hit.nx, hit.ny, hit.nz], [0, 1, 0]);
  assert.ok(Math.abs(hit.dist - 5) < 1e-9, `dist ${hit.dist}`);
  assert.equal(hit.id, BLOCK.THORNSOIL);
});

test('raycast angled ray hits wall side face normal and null past maxDist', () => {
  const world = makeWallWorld();
  const len = Math.sqrt(1 + 0.25 * 0.25);
  const hit = raycastVoxel(world, 12.5, 100.5, 3.5, -1 / len, 0.25 / len, 0, 30);
  assert.ok(hit, 'wall hit');
  assert.deepEqual([hit.x, hit.y, hit.z], [10, 100, 3]);
  assert.deepEqual([hit.nx, hit.ny, hit.nz], [1, 0, 0]);
  assert.ok(Math.abs(hit.dist - 1.5 * len) < 1e-9, `dist ${hit.dist} vs ${1.5 * len}`);
  const miss = raycastVoxel(makeFloorWorld(), 5, 110, 5, 1, 0, 0, 20);
  assert.equal(miss, null, 'empty space returns null');
  const shortReach = raycastVoxel(makeFloorWorld(), 5.5, 105, 3.5, 0, -1, 0, 3);
  assert.equal(shortReach, null, 'floor beyond maxDist not hit');
});

test('raycast ignores liquids by default, hits with hitLiquid true', () => {
  const world = new MockWorld();
  world.set(0, 0, 0, BLOCK.MAGMA);
  const miss = raycastVoxel(world, 0.5, 3, 0.5, 0, -1, 0, 2.5);
  assert.equal(miss, null);
  const hit = raycastVoxel(world, 0.5, 3, 0.5, 0, -1, 0, 2.5, { hitLiquid: true });
  assert.ok(hit, 'liquid hit');
  assert.deepEqual([hit.x, hit.y, hit.z], [0, 0, 0]);
  assert.deepEqual([hit.nx, hit.ny, hit.nz], [0, 1, 0]);
  assert.equal(hit.id, BLOCK.MAGMA);
  assert.ok(Math.abs(hit.dist - 2) < 1e-9);
});

test('fallDamage scaling thresholds', () => {
  assert.equal(fallDamage(10), 0);
  assert.equal(fallDamage(11), 0);
  assert.equal(fallDamage(16), Math.round((16 - 11) * 1.4));
  assert.equal(fallDamage(20), Math.round((20 - 11) * 1.4));
});

class FakeInput {
  constructor() {
    this.fwd = 0;
    this.strafe = 0;
    this.jump = false;
    this.sprint = false;
    this.crouch = false;
    this.dyaw = 0;
    this.dpitch = 0;
  }
  getState() {
    return {
      fwd: this.fwd,
      strafe: this.strafe,
      jump: this.jump,
      sprint: this.sprint,
      crouch: this.crouch,
    };
  }
  getLookDelta() {
    const d = { yaw: this.dyaw, pitch: this.dpitch };
    this.dyaw = 0;
    this.dpitch = 0;
    return d;
  }
}

function makeController(world) {
  const input = new FakeInput();
  const events = { steps: [], land: null, fallDmg: null, jumps: 0 };
  const controller = new Controller(input, {
    onFootstep: (mat, norm) => events.steps.push([mat, norm]),
    onLand: (impact) => {
      events.land = impact;
    },
    onFallDamage: (dmg) => {
      events.fallDmg = dmg;
    },
    onJump: () => {
      events.jumps++;
    },
  });
  return { input, events, controller };
}

test('controller: fall damage event on hard landing', () => {
  const world = makeFloorWorld();
  const { input, events, controller } = makeController(world);
  controller.respawn({ x: 5.5, y: 108, z: 3.5 });
  let guard = 0;
  while (!controller.onGround && guard++ < 600) controller.update(FIXED_DT, world);
  const impact = Math.sqrt(2 * GRAVITY * 8);
  assert.equal(events.fallDmg, Math.round((impact - 11) * 1.4));
  assert.ok(events.land < -6, `landing hook fired with impact ${events.land}`);
  assert.ok(controller.alive);
});

test('controller: footsteps cadence, material underfoot, jump hook, look clamp', () => {
  const world = makeFloorWorld();
  const { input, events, controller } = makeController(world);
  controller.respawn({ x: 5.5, y: 100, z: 3.5 });
  controller.update(FIXED_DT, world);
  input.jump = true;
  controller.update(FIXED_DT, world);
  input.jump = false;
  assert.ok(events.jumps >= 1, 'jump hook fired');
  input.dpitch = 3;
  input.dyaw = 0.5;
  controller.update(FIXED_DT, world);
  assert.ok(Math.abs(controller.yaw - 0.5) < 1e-9);
  assert.ok(controller.pitch <= (89 * Math.PI) / 180 + 1e-12);
  input.fwd = 1;
  for (let i = 0; i < 120; i++) controller.update(FIXED_DT, world);
  assert.ok(events.steps.length >= 3, `footsteps emitted, got ${events.steps.length}`);
  for (const [mat] of events.steps) assert.equal(mat, blockDef(BLOCK.THORNSOIL).soundMat);
  const walkRadius = controller.getNoiseRadius();
  input.sprint = true;
  for (let i = 0; i < 120; i++) controller.update(FIXED_DT, world);
  const sprintRadius = controller.getNoiseRadius();
  assert.ok(sprintRadius > walkRadius, `sprint ${sprintRadius} louder than walk ${walkRadius}`);
  input.sprint = false;
  input.crouch = true;
  for (let i = 0; i < 60; i++) controller.update(FIXED_DT, world);
  assert.ok(controller.getNoiseRadius() <= 1.2 + 1e-9, 'crouch quiet');
  assert.ok(controller.eyeHeight < 1.4, 'eye height lowered while crouched');
});
