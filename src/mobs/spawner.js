import { BIOME_BANDS, biomeAt } from '../config.js';
import { BLOCK } from '../blocks.js';
import { MOB_TYPES, makeRng } from './mobs.js';

const HOSTILE_BASE_CAP = 8;
const PASSIVE_CAP = 10;
const DESPAWN_DIST = 64;

function magmaNearby(world, x, y, z, radius) {
  const r = Math.floor(radius / 3);
  for (let dy = -2; dy <= 1; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (world.getBlock(x + dx * 3, y + dy * 3, z + dz * 3) === BLOCK.MAGMA) return true;
      }
    }
  }
  return false;
}

function bandRange(name) {
  for (const b of BIOME_BANDS) if (b.name === name) return b;
  return null;
}

export class Spawner {
  constructor(mobManager, seed = 0xbeef01) {
    this.manager = mobManager;
    this.rng = makeRng(seed >>> 0);
    this.budget = 0;
    this.counts = { total: 0, hostile: 0, passive: 0 };
    this.attemptCount = 0;
    this.spawnCount = 0;
    this.lastFailReason = '';
  }

  isNight(timeOfDay) {
    const t = typeof timeOfDay === 'number' ? timeOfDay : 0.25;
    return t > 0.54 || t < 0.04;
  }

  eligiblePool(night) {
    const pool = [];
    for (const id of Object.keys(MOB_TYPES)) {
      const def = MOB_TYPES[id];
      if (!def.daytimeOk && !night) continue;
      pool.push(def);
    }
    return pool;
  }

  pickWeighted(pool) {
    let total = 0;
    for (const d of pool) total += d.spawnWeight;
    let roll = this.rng() * total;
    for (const d of pool) {
      roll -= d.spawnWeight;
      if (roll <= 0) return d;
    }
    return pool[pool.length - 1];
  }

  validateSpot(def, world, x, y, z, threat) {
    const band = biomeAt(Math.floor(y));
    if (!def.biomes.includes(band)) return 'biome';
    if (world.isSolid(x, Math.floor(y), z) || world.isSolid(x, Math.floor(y) + 1, z)) return 'space';
    if (!world.isSolid(x, Math.floor(y) - 1, z)) return 'space';
    if (def.hostile && world.getBlockLight(x, Math.floor(y), z) > 4) return 'light';
    if (def.hostile && world.getBlockLight(x, Math.floor(y) + 1, z) > 4) return 'light';
    if (def.id === 'ashwisp' && !magmaNearby(world, x, Math.floor(y), z, 12)) return 'magma';
    void threat;
    return null;
  }

  trySpawn(ctx, threat) {
    const world = ctx.world;
    const pp = ctx.player && ctx.player.pos;
    if (!world || !pp) return;
    const c = this.manager.counts();
    const hostileCap = HOSTILE_BASE_CAP + threat * 14;
    if (c.hostile >= hostileCap && c.passive >= PASSIVE_CAP) return;
    const night = this.isNight(ctx.timeOfDay);
    let pool = this.eligiblePool(night);
    if (c.hostile >= hostileCap) pool = pool.filter((d) => !d.hostile);
    if (c.passive >= PASSIVE_CAP) pool = pool.filter((d) => d.hostile);
    if (!pool.length) return;
    const def = this.pickWeighted(pool);
    this.attemptCount++;
    const ang = this.rng() * Math.PI * 2;
    const rad = 20 + this.rng() * 24;
    const x = Math.floor(pp.x + Math.sin(ang) * rad);
    const z = Math.floor(pp.z + Math.cos(ang) * rad);

    let spots = [];
    const surfaceBandOk = def.biomes.some((b) => b === 'thornwood' || b === 'loamhollows');
    if (!def.flyer && surfaceBandOk) {
      const sy = world.surfaceHeight(x, z);
      spots.push({ x, y: sy, z });
    }
    if (!spots.length || this.rng() < 0.35) {
      const names = def.biomes.filter((b) => b !== 'thornwood');
      const name = names.length ? names[Math.floor(this.rng() * names.length)] : def.biomes[0];
      const band = bandRange(name);
      if (band) {
        const span = band.max - band.min;
        for (let i = 0; i < 8; i++) {
          const y = band.min + 2 + Math.floor(this.rng() * Math.max(1, span - 3));
          spots.push({ x, y, z });
        }
      }
    }
    for (const s of spots) {
      const fail = this.validateSpot(def, world, s.x, s.y, s.z, threat);
      if (!fail) {
        const mob = this.manager.spawnMob(def.id, s.x + 0.5, s.y, s.z + 0.5);
        if (mob) this.spawnCount++;
        return;
      }
      this.lastFailReason = fail;
    }
  }

  update(dt, ctx) {
    const c = this.manager ? this.manager.counts() : { total: 0, hostile: 0, passive: 0 };
    this.counts = c;
    if (!ctx || !ctx.world || !ctx.player || !ctx.player.pos) return;
    const pp = ctx.player.pos;
    const mobs = this.manager.mobs;
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      if (Math.hypot(m.pos.x - pp.x, m.pos.y - pp.y, m.pos.z - pp.z) > DESPAWN_DIST) {
        this.manager.removeMob(m);
      }
    }
    const threat = typeof ctx.threatLevel === 'number' ? ctx.threatLevel : 0;
    const rate = (this.isNight(ctx.timeOfDay) ? 2.5 : 0.6) + threat * 4;
    this.budget += rate * dt;
    let tries = Math.min(Math.floor(this.budget), 16);
    if (tries <= 0) return;
    this.budget -= tries;
    while (tries-- > 0) {
      if (this.manager.mobs.length >= HOSTILE_BASE_CAP + PASSIVE_CAP + threat * 14) break;
      this.trySpawn(ctx, threat);
    }
  }

  get stats() {
    return { attempts: this.attemptCount, spawned: this.spawnCount, lastFail: this.lastFailReason };
  }
}
