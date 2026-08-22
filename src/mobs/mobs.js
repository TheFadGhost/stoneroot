import { GRAVITY, TERMINAL_VELOCITY } from '../config.js';
import { findPath, hasLineOfWalk } from './pathfind.js';

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let makeRng = mulberry32;
try {
  const n = await import('../world/noise.js');
  if (typeof n.makeRng === 'function') makeRng = n.makeRng;
} catch {}
export { makeRng };

let moveAABB = null;
try {
  const p = await import('../physics/physics.js');
  if (typeof p.moveAABB === 'function') moveAABB = p.moveAABB;
} catch {}

let raycastVoxel = null;
try {
  const r = await import('../physics/raycast.js');
  if (typeof r.raycastVoxel === 'function') raycastVoxel = r.raycastVoxel;
} catch {}

export const MOB_TYPES = {
  thornhound: {
    id: 'thornhound',
    name: 'Thornhound',
    hp: 26,
    speed: 5.0,
    damage: 5,
    aabbW: 0.7,
    aabbH: 1.2,
    aabb: { w: 0.7, h: 1.2 },
    hostile: true,
    biomes: ['thornwood'],
    lightFear: 7,
    soundHearing: 16,
    spawnWeight: 10,
    daytimeOk: false,
    flyer: false,
    senses: ['sight', 'hearing', 'light'],
    attackCooldown: 1.0,
    aggroRange: 14,
    shareRange: 12,
    patrolRange: 9,
  },
  rootling: {
    id: 'rootling',
    name: 'Rootling',
    hp: 6,
    speed: 3.4,
    damage: 1,
    aabbW: 0.45,
    aabbH: 0.55,
    aabb: { w: 0.45, h: 0.55 },
    hostile: false,
    biomes: ['thornwood', 'loamhollows'],
    lightFear: 6,
    soundHearing: 16,
    spawnWeight: 14,
    daytimeOk: true,
    flyer: false,
    senses: ['hearing', 'light'],
    attackCooldown: 2.4,
    flockRadius: 8,
    itemNoiseRadius: 16,
    stealRadius: 2.4,
  },
  gloomcap: {
    id: 'gloomcap',
    name: 'Gloomcap',
    hp: 14,
    speed: 1.2,
    damage: 9,
    aabbW: 0.95,
    aabbH: 1.0,
    aabb: { w: 0.95, h: 1.0 },
    hostile: true,
    biomes: ['fungaldrifts', 'stillcore'],
    lightFear: 5,
    soundHearing: 8,
    spawnWeight: 9,
    daytimeOk: true,
    flyer: false,
    senses: ['vibration', 'light'],
    attackCooldown: 1.4,
    triggerRange: 6,
    escapeRange: 12,
    alertTime: 0.3,
    windupTime: 0.45,
    lungeTime: 0.55,
    lungeSpeed: 9,
    recoverTime: 1.2,
  },
  ashwisp: {
    id: 'ashwisp',
    name: 'Ashwisp',
    hp: 10,
    speed: 2.6,
    damage: 4,
    aabbW: 0.8,
    aabbH: 0.9,
    aabb: { w: 0.8, h: 0.9 },
    hostile: true,
    biomes: ['emberdeep', 'stillcore'],
    lightFear: 0,
    soundHearing: 10,
    spawnWeight: 9,
    daytimeOk: false,
    flyer: true,
    senses: ['sight', 'heat'],
    attackCooldown: 1.2,
    aggroRange: 10,
    burnTime: 2.5,
    flockRadius: 6,
    skyDeathLight: 13,
    skyDeathTime: 5,
  },
  hollowone: {
    id: 'hollowone',
    name: 'Hollow One',
    hp: 60,
    speed: 6.4,
    damage: 11,
    aabbW: 0.85,
    aabbH: 2.6,
    aabb: { w: 0.85, h: 2.6 },
    hostile: true,
    biomes: ['fungaldrifts', 'emberdeep'],
    lightFear: 0,
    soundHearing: 40,
    spawnWeight: 6,
    daytimeOk: true,
    flyer: false,
    senses: ['hearing'],
    blind: true,
    attackCooldown: 1.6,
    freezeLight: 8,
    noiseTtl: 8,
    loseNoiseTime: 3,
  },
  sporeling: {
    id: 'sporeling',
    name: 'Sporeling',
    hp: 8,
    speed: 2.2,
    damage: 1,
    aabbW: 0.55,
    aabbH: 0.65,
    aabb: { w: 0.55, h: 0.65 },
    hostile: false,
    biomes: ['thornwood', 'loamhollows', 'fungaldrifts'],
    lightFear: 3,
    soundHearing: 12,
    spawnWeight: 22,
    daytimeOk: true,
    flyer: false,
    senses: ['touch', 'light'],
    attackCooldown: 1.8,
    retaliationRadius: 20,
    poisonTime: 3,
  },
};

export const MOB_IDS = Object.keys(MOB_TYPES);

const floor = Math.floor;

function dist2d(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function cellOf(p) {
  return { x: floor(p.x), y: floor(p.y), z: floor(p.z) };
}

function lightAt(world, x, y, z) {
  return world.getBlockLight(floor(x), floor(y), floor(z));
}

function skyAt(world, x, y, z) {
  if (typeof world.getSky !== 'function') return 0;
  return world.getSky(floor(x), floor(y), floor(z));
}

function boxBlocked(world, x, y, z, hw, hh) {
  const e = 0.001;
  const x0 = floor(x - hw + e);
  const x1 = floor(x + hw - e);
  const y0 = floor(y + e);
  const y1 = floor(y + hh * 2 - e);
  const z0 = floor(z - hw + e);
  const z1 = floor(z + hw - e);
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        if (world.isSolid(ix, iy, iz)) return true;
      }
    }
  }
  return false;
}

function fallbackMoveAABB(world, pos, vel, halfExtents, dt) {
  const hx = halfExtents && typeof halfExtents.x === 'number' ? halfExtents.x : 0.4;
  const hy = halfExtents && typeof halfExtents.y === 'number' ? halfExtents.y : 0.5;
  let hitX = false;
  let hitY = false;
  let hitZ = false;
  const nx = pos.x + vel.x * dt;
  if (!boxBlocked(world, nx, pos.y, pos.z, hx, hy)) pos.x = nx;
  else {
    vel.x = 0;
    hitX = true;
  }
  const nz = pos.z + vel.z * dt;
  if (!boxBlocked(world, pos.x, pos.y, nz, hx, hy)) pos.z = nz;
  else {
    vel.z = 0;
    hitZ = true;
  }
  const ny = pos.y + vel.y * dt;
  if (!boxBlocked(world, pos.x, ny, pos.z, hx, hy)) pos.y = ny;
  else {
    if (vel.y < 0) hitY = true;
    vel.y = 0;
  }
  const onGround =
    world.isSolid(floor(pos.x - hx * 0.6), floor(pos.y - 0.06), floor(pos.z)) ||
    world.isSolid(floor(pos.x + hx * 0.6), floor(pos.y - 0.06), floor(pos.z)) ||
    world.isSolid(floor(pos.x), floor(pos.y - 0.06), floor(pos.z - hx * 0.6)) ||
    world.isSolid(floor(pos.x), floor(pos.y - 0.06), floor(pos.z + hx * 0.6));
  return { onGround, hitX, hitY, hitZ, collidedX: hitX, collidedY: hitY, collidedZ: hitZ };
}

function physicsMove(mob, world, dt) {
  const he = { x: mob.def.aabbW / 2, y: mob.def.aabbH / 2, z: mob.def.aabbW / 2 };
  const res = moveAABB(world, mob.pos, mob.vel, he, dt) || {};
  mob.onGround = !!res.onGround;
  mob.hitX = !!(res.hitX || res.collidedX);
  mob.hitY = !!(res.hitY || res.collidedY);
  mob.hitZ = !!(res.hitZ || res.collidedZ);
}

function losClear(world, from, to, fromHeight) {
  const ox = from.x;
  const oy = from.y + (fromHeight || 0.8) * 0.8;
  const oz = from.z;
  const dx = to.x - ox;
  const dy = to.y + 1.4 - oy;
  const dz = to.z - oz;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.001) return true;
  if (raycastVoxel) {
    const hit = raycastVoxel(world, ox, oy, oz, dx / d, dy / d, dz / d, d);
    return !hit || hit.dist >= d - 0.4;
  }
  return hasLineOfWalk(world, { x: ox, y: oy, z: oz }, { x: ox + dx, y: oy + dy, z: oz + dz });
}

function setState(mob, s) {
  if (mob.state === s) return;
  mob.prevState = mob.state;
  mob.state = s;
  mob.stateTimer = 0;
  mob.vocalize = true;
}

function steerDir(mob, dx, dz, speed, dt) {
  const l = Math.hypot(dx, dz);
  if (l < 1e-5) return 0;
  const tx = (dx / l) * speed;
  const tz = (dz / l) * speed;
  const k = Math.min(1, dt * 8);
  mob.vel.x += (tx - mob.vel.x) * k;
  mob.vel.z += (tz - mob.vel.z) * k;
  mob.faceYaw = Math.atan2(dx, dz);
  return l;
}

function steerTo(mob, tx, tz, speed, dt) {
  return steerDir(mob, tx - mob.pos.x, tz - mob.pos.z, speed, dt);
}

function seekShade(world, mob) {
  let bestScore = Infinity;
  let bx = 0;
  let bz = 0;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + mob.rng();
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    for (const r of [3, 6]) {
      const sx = mob.pos.x + dx * r;
      const sz = mob.pos.z + dz * r;
      const lt = lightAt(world, sx, mob.pos.y + 0.5, sz);
      const score = lt * 10 - r * 0.1 + mob.rng() * 0.5;
      if (
        score < bestScore &&
        !boxBlocked(world, mob.pos.x + dx * 1.2, mob.pos.y + 0.1, mob.pos.z + dz * 1.2, mob.def.aabbW / 2, mob.def.aabbH / 2)
      ) {
        bestScore = score;
        bx = dx;
        bz = dz;
      }
    }
  }
  if (bestScore === Infinity) {
    const a = mob.rng() * Math.PI * 2;
    bx = Math.sin(a);
    bz = Math.cos(a);
  }
  return { x: bx, z: bz };
}

function flockVector(manager, mob, radius, wSep, wAli, wCoh) {
  let sx = 0;
  let sz = 0;
  let ax = 0;
  let az = 0;
  let cx = 0;
  let cz = 0;
  let n = 0;
  for (const o of manager.mobs) {
    if (o === mob || o.typeId !== mob.typeId) continue;
    const dx = mob.pos.x - o.pos.x;
    const dz = mob.pos.z - o.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > radius || d < 1e-4) continue;
    n++;
    const inv = 1 / d;
    sx += dx * inv;
    sz += dz * inv;
    ax += o.vel.x;
    az += o.vel.z;
    cx -= dx;
    cz -= dz;
  }
  if (n === 0) return { x: 0, z: 0 };
  return {
    x: sx * wSep + (ax / n) * wAli + (cx / n) * wCoh,
    z: sz * wSep + (az / n) * wAli + (cz / n) * wCoh,
  };
}

function ensurePath(mob, world, tx, ty, tz, dt, speed) {
  mob.repathTimer -= dt;
  mob.pathAge = (mob.pathAge || 0) + dt;
  if (mob.path && mob.pathAge > 4) mob.path = null;
  const goalMoved = mob.pathGoal ? dist3(mob.pathGoal, { x: tx, y: ty, z: tz }) : Infinity;
  if ((!mob.path && mob.repathTimer <= 0) || goalMoved > 2.5 || (mob.path && !mob.path.length)) {
    mob.repathTimer = 0.7;
    mob.pathAge = 0;
    mob.pathGoal = { x: tx, y: ty, z: tz };
    const c = cellOf(mob.pos);
    mob.path = findPath(world, c.x, c.y, c.z, floor(tx), floor(ty), floor(tz)) || [];
    mob.pathIdx = 0;
  }
  if (!mob.path || mob.pathIdx >= mob.path.length) return false;
  const wp = mob.path[mob.pathIdx];
  if (dist2d(wp.x + 0.5, wp.z + 0.5, mob.pos.x, mob.pos.z) < 0.45 && Math.abs(wp.y - mob.pos.y) < 1.6) {
    mob.pathIdx++;
    if (mob.pathIdx >= mob.path.length) {
      mob.path = null;
      return false;
    }
  }
  const cur = mob.path[mob.pathIdx];
  if (cur.y - floor(mob.pos.y + 0.01) >= 1 && mob.onGround && mob.vel.y <= 0.01) mob.vel.y = 8.2;
  steerTo(mob, cur.x + 0.5, cur.z + 0.5, speed, dt);
  return true;
}

function moveHunt(mob, world, targetPos, speedMul, dt) {
  const def = mob.def;
  mob.target = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
  const speed = def.speed * speedMul;
  if (!def.blind && hasLineOfWalk(world, mob.pos, targetPos)) {
    mob.path = null;
    steerTo(mob, targetPos.x, targetPos.z, speed, dt);
    if (targetPos.y > mob.pos.y + 0.6 && mob.onGround) mob.vel.y = 8.2;
    return;
  }
  ensurePath(mob, world, targetPos.x, targetPos.y, targetPos.z, dt, speed);
}

function patrol(mob, world, dt) {
  const def = mob.def;
  mob.wanderT = (mob.wanderT || 0) - dt;
  const reached = mob.wp && dist2d(mob.wp.x, mob.wp.z, mob.pos.x, mob.pos.z) < 0.8;
  if (!mob.wp || reached || mob.wanderT <= 0) {
    let picked = null;
    for (let i = 0; i < 5; i++) {
      const a = mob.rng() * Math.PI * 2;
      const r = 2 + mob.rng() * (def.patrolRange || 6);
      const wx = mob.homeX + Math.sin(a) * r;
      const wz = mob.homeZ + Math.cos(a) * r;
      if (lightAt(world, wx, mob.pos.y, wz) < Math.max(0, (def.lightFear || 0) - 2)) {
        picked = { x: wx, z: wz };
        break;
      }
      picked = picked || { x: wx, z: wz };
    }
    mob.wp = picked;
    mob.wanderT = 5 + mob.rng() * 4;
  }
  if (mob.wp) steerTo(mob, mob.wp.x, mob.wp.z, def.speed * 0.55, dt);
}

function tryAttack(M, mob, ctx, targetPos) {
  const def = mob.def;
  if (mob.attackCd > 0 || mob.stunTimer > 0 || mob.recoverTimer > 0) return false;
  const tp = targetPos || (ctx.player && ctx.player.pos);
  if (!tp) return false;
  const reach = def.aabbW + 0.9;
  if (dist3(mob.pos, tp) > reach) return false;
  mob.attackCd = def.attackCooldown;
  mob.recoverTimer = 0.22;
  const dx = tp.x - mob.pos.x;
  const dz = tp.z - mob.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  mob.vel.x -= (dx / l) * 1.6;
  mob.vel.z -= (dz / l) * 1.6;
  M.attackEvents.push({ typeId: mob.typeId, pos: { ...mob.pos }, amount: def.damage });
  if (typeof ctx.damagePlayer === 'function') ctx.damagePlayer(def.damage, { ...mob.pos });
  if (ctx.player) {
    if (mob.typeId === 'ashwisp') ctx.player.burnTimer = Math.max(ctx.player.burnTimer || 0, def.burnTime);
    if (mob.typeId === 'sporeling') ctx.player.poisonTimer = Math.max(ctx.player.poisonTimer || 0, def.poisonTime);
  }
  if (typeof ctx.spawnParticles === 'function') ctx.spawnParticles('hit', { ...mob.pos });
  return true;
}

function vocalTick(mob, ctx, dt) {
  mob.vocalT = (mob.vocalT ?? 3 + mob.rng() * 6) - dt;
  const audio = ctx.audio;
  if (!audio || typeof audio.mobVocal !== 'function') {
    if (mob.vocalize) mob.vocalize = false;
    return;
  }
  if (mob.vocalize || mob.vocalT <= 0) {
    audio.mobVocal(mob.typeId, { ...mob.pos });
    mob.vocalize = false;
    mob.vocalT = 3 + mob.rng() * 6;
  }
}

function setPackAggro(M, mob, pp) {
  mob.aggro = true;
  setState(mob, 'chase');
  const share = mob.def.shareRange;
  for (const o of M.mobs) {
    if (o === mob || o.typeId !== mob.typeId) continue;
    if (dist3(o.pos, mob.pos) < share && !o.aggro) {
      o.aggro = true;
      setState(o, 'chase');
    }
  }
}

function behThornhound(M, mob, world, ctx, heard, dt) {
  void heard;
  const def = mob.def;
  const pp = ctx.player && ctx.player.pos;
  const lit = lightAt(world, mob.pos.x, mob.pos.y + 0.4, mob.pos.z) >= def.lightFear;
  if (pp && !mob.aggro && !lit && dist3(mob.pos, pp) < def.aggroRange) {
    if (losClear(world, mob.pos, pp, def.aabbH)) setPackAggro(M, mob, pp);
  }
  if (mob.aggro && pp && dist3(mob.pos, pp) > 26) {
    mob.aggro = false;
  }
  if (lit) setState(mob, 'flee');
  else if (mob.state === 'flee') setState(mob, mob.aggro ? 'chase' : 'patrol');
  switch (mob.state) {
    case 'flee': {
      const d = seekShade(world, mob);
      steerDir(mob, d.x, d.z, def.speed * 1.25, dt);
      break;
    }
    case 'chase': {
      if (!pp) {
        setState(mob, 'patrol');
        break;
      }
      moveHunt(mob, world, pp, 1.05, dt);
      tryAttack(M, mob, ctx, pp);
      break;
    }
    default:
      setState(mob, 'patrol');
      patrol(mob, world, dt);
  }
}

function behRootling(M, mob, world, ctx, heard, dt) {
  void heard;
  const def = mob.def;
  const pp = ctx.player && ctx.player.pos;
  if (mob.noiseT > 0) mob.noiseT -= dt;
  else mob.noiseTarget = null;
  const lit = lightAt(world, mob.pos.x, mob.pos.y + 0.3, mob.pos.z) >= def.lightFear;
  const fl = flockVector(M, mob, def.flockRadius, 1.6, 0.5, 0.4);
  if (lit && mob.state !== 'scatter') {
    setState(mob, 'scatter');
    mob.scatterDir = seekShade(world, mob);
  } else if (!lit && mob.state === 'scatter') {
    setState(mob, mob.noiseTarget ? 'swarm' : 'wander');
  }
  switch (mob.state) {
    case 'scatter': {
      const d = mob.scatterDir || seekShade(world, mob);
      steerDir(mob, d.x + fl.x * 0.4, d.z + fl.z * 0.4, def.speed * 1.15, dt);
      break;
    }
    case 'swarm': {
      if (!mob.noiseTarget) {
        setState(mob, 'wander');
        break;
      }
      steerTo(mob, mob.noiseTarget.x, mob.noiseTarget.z, def.speed, dt);
      mob.vel.x += fl.x * dt * 3;
      mob.vel.z += fl.z * dt * 3;
      if (pp && dist3(mob.pos, pp) < def.stealRadius) setState(mob, 'steal');
      break;
    }
    case 'steal': {
      if (!pp || dist2d(mob.pos.x, mob.pos.z, pp.x, pp.z) > def.stealRadius * 1.6) {
        setState(mob, mob.noiseTarget ? 'swarm' : 'wander');
        break;
      }
      const dx = mob.pos.x - pp.x;
      const dz = mob.pos.z - pp.z;
      const d = Math.hypot(dx, dz) || 1;
      steerDir(mob, -dz / d - (dx / d) * 0.35 + fl.x * 0.3, dx / d - (dz / d) * 0.35 + fl.z * 0.3, def.speed * 0.9, dt);
      tryAttack(M, mob, ctx, pp);
      break;
    }
    default:
      setState(mob, 'wander');
      patrol(mob, world, dt);
      mob.vel.x += fl.x * dt * 3;
      mob.vel.z += fl.z * dt * 3;
  }
}

function behGloomcap(M, mob, world, ctx, heard, dt) {
  void heard;
  void M;
  const def = mob.def;
  const pp = ctx.player && ctx.player.pos;
  const localL = lightAt(world, mob.pos.x, mob.pos.y + 0.5, mob.pos.z);
  const d = pp ? dist3(mob.pos, pp) : Infinity;
  switch (mob.state) {
    case 'alert': {
      mob.stateTimer += dt;
      if (!pp || localL >= def.lightFear || d > def.escapeRange) setState(mob, 'dormant');
      else if (mob.stateTimer >= def.alertTime) setState(mob, 'windup');
      break;
    }
    case 'windup': {
      mob.stateTimer += dt;
      if (pp) mob.faceYaw = Math.atan2(pp.x - mob.pos.x, pp.z - mob.pos.z);
      if (mob.stateTimer >= def.windupTime) {
        setState(mob, 'lunge');
        if (pp) {
          const dx = pp.x - mob.pos.x;
          const dy = pp.y + 1.2 - (mob.pos.y + def.aabbH * 0.6);
          const dz = pp.z - mob.pos.z;
          const l = Math.hypot(dx, dz) || 1;
          mob.vel.x = (dx / l) * def.lungeSpeed;
          mob.vel.z = (dz / l) * def.lungeSpeed;
          mob.vel.y = clamp(dy, 1.5, 4.5);
        }
        mob.stateTimer = def.lungeTime;
      }
      break;
    }
    case 'lunge': {
      mob.stateTimer -= dt;
      tryAttack(M, mob, ctx, pp);
      if ((mob.hitX || mob.hitZ) && mob.attackCd < def.attackCooldown - 0.05) {
        setState(mob, 'recover');
        mob.stateTimer = def.recoverTime;
      } else if (mob.stateTimer <= 0 || !pp) {
        setState(mob, 'recover');
        mob.stateTimer = def.recoverTime;
      }
      break;
    }
    case 'recover': {
      mob.stateTimer -= dt;
      if (pp && d <= def.escapeRange) steerTo(mob, pp.x, pp.z, def.speed, dt);
      tryAttack(M, mob, ctx, pp);
      if (mob.stateTimer <= 0) {
        if (!pp || d > def.escapeRange || localL >= def.lightFear) setState(mob, 'dormant');
        else setState(mob, 'alert');
      }
      break;
    }
    default: {
      mob.vel.x *= 0.6;
      mob.vel.z *= 0.6;
      setState(mob, 'dormant');
      if (pp && d < def.triggerRange && localL < def.lightFear) setState(mob, 'alert');
    }
  }
}

function behAshwisp(M, mob, world, ctx, heard, dt) {
  void heard;
  const def = mob.def;
  const pp = ctx.player && ctx.player.pos;
  const sl = skyAt(world, mob.pos.x, mob.pos.y + 0.5, mob.pos.z);
  if (sl >= def.skyDeathLight) {
    mob.skyT = (mob.skyT || 0) + dt;
    if (mob.skyT > def.skyDeathTime) {
      M.deathEvents.push({ typeId: mob.typeId, pos: { ...mob.pos }, cause: 'burnout' });
      mob.hp = 0;
      mob.dead = true;
      return;
    }
  } else {
    mob.skyT = Math.max(0, (mob.skyT || 0) - dt * 2);
  }
  const fl = flockVector(M, mob, def.flockRadius, 0.8, 0.25, 0.2);
  let dx = Math.sin(mob.headAng ?? 0);
  let dz = Math.cos(mob.headAng ?? 0);
  if (pp && dist3(mob.pos, pp) < def.aggroRange && pp.y < 100) {
    setState(mob, 'hunt');
    dx = pp.x - mob.pos.x;
    dz = pp.z - mob.pos.z;
  } else if (mob.state === 'hunt') {
    setState(mob, 'drift');
  }
  const l = Math.hypot(dx, dz) || 1;
  let tx = (dx / l) * def.speed + fl.x;
  let tz = (dz / l) * def.speed + fl.z;
  const px = mob.pos.x + (dx / l) * 1.5;
  const pz = mob.pos.z + (dz / l) * 1.5;
  if (
    world.isSolid(floor(px), floor(mob.pos.y), floor(pz)) ||
    world.isSolid(floor(px), floor(mob.pos.y + 0.6), floor(pz))
  ) {
    const turn = (mob.turnSign ??= mob.rng() < 0.5 ? 1 : -1) * 1.9;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const nx = tx * c - tz * s;
    const nz = tx * s + tz * c;
    tx = nx;
    tz = nz;
    mob.headAng = Math.atan2(tx, tz);
  } else {
    mob.headAng = Math.atan2(tx, tz);
  }
  const k = Math.min(1, dt * 2.5);
  mob.vel.x += (tx - mob.vel.x) * k;
  mob.vel.z += (tz - mob.vel.z) * k;
  mob.phaseT = (mob.phaseT || 0) + dt;
  mob.vel.y += (Math.sin(mob.phaseT * 2.2 + mob.animPhase) * 0.7 - mob.vel.y) * k;
  tryAttack(M, mob, ctx, pp);
}

function intakeNoise(M, mob, heard) {
  const def = mob.def;
  if (mob.typeId === 'rootling') {
    for (const n of heard) {
      if (n.type !== 'item') continue;
      if (dist3(mob.pos, n) < def.itemNoiseRadius + (n.radius || 0)) {
        mob.noiseTarget = { x: n.x, y: n.y, z: n.z };
        mob.noiseT = 6;
      }
    }
    return;
  }
  if (mob.typeId !== 'hollowone') return;
  let loudest = null;
  for (const n of heard) {
    const d = dist3(mob.pos, n);
    if (d > def.soundHearing) continue;
    const loud = n.radius || 4;
    if (!loudest || loud > loudest.radius) loudest = { x: n.x, y: n.y, z: n.z, radius: loud };
  }
  if (loudest) {
    if (!mob.mem || loudest.radius >= mob.mem.radius) {
      mob.mem = { ...loudest, t: def.noiseTtl };
    } else {
      mob.mem.t = Math.max(mob.mem.t, def.noiseTtl * 0.5);
      mob.mem.radius = Math.max(mob.mem.radius, loudest.radius * 0.9);
    }
  }
}

function behHollowone(M, mob, world, ctx, heard, dt) {
  void heard;
  const def = mob.def;
  const pp = ctx.player && ctx.player.pos;
  if (mob.mem) {
    mob.mem.t -= dt;
    if (mob.mem.t <= 0) mob.mem = null;
  }
  if (mob.mem && mob.state !== 'hunt' && mob.state !== 'frozen') setState(mob, 'hunt');
  if (!mob.mem && mob.state === 'hunt') setState(mob, 'idle');
  const lit = lightAt(world, mob.pos.x, mob.pos.y + 1, mob.pos.z) >= def.freezeLight;
  if (lit) {
    if (mob.state !== 'frozen') {
      mob.preFrozen = mob.state;
      setState(mob, 'frozen');
    }
    mob.vel.x = 0;
    mob.vel.y = 0;
    mob.vel.z = 0;
    vocalTick(mob, ctx, dt);
    return;
  }
  if (mob.state === 'frozen') setState(mob, mob.preFrozen === 'idle' || !mob.mem ? 'idle' : 'hunt');
  switch (mob.state) {
    case 'hunt': {
      if (!mob.mem) {
        setState(mob, 'idle');
        break;
      }
      const dToMem = dist3(mob.pos, mob.mem);
      moveHunt(mob, world, mob.mem, 1, dt);
      tryAttack(M, mob, ctx, pp);
      if (dToMem < 1.4) {
        mob.lostT = (mob.lostT || 0) + dt;
        if (mob.lostT > def.loseNoiseTime) {
          mob.mem = null;
          mob.lostT = 0;
          setState(mob, 'idle');
        }
      } else {
        mob.lostT = 0;
      }
      break;
    }
    default: {
      setState(mob, 'idle');
      patrol(mob, world, dt);
      tryAttack(M, mob, ctx, pp);
    }
  }
}

function retaliationSwarm(M, mob) {
  const def = mob.def;
  for (const o of M.mobs) {
    if (o.typeId !== mob.typeId) continue;
    if (dist3(o.pos, mob.pos) > def.retaliationRadius) continue;
    o.aggro = true;
    o.poisoned = true;
    setState(o, 'retaliate');
  }
}

function behSporeling(M, mob, world, ctx, heard, dt) {
  void heard;
  const def = mob.def;
  const pp = ctx.player && ctx.player.pos;
  if (mob.state === 'retaliate') {
    if (!pp || dist3(mob.pos, pp) > 30) {
      setState(mob, 'graze');
      mob.aggro = false;
    } else {
      moveHunt(mob, world, pp, 1.6, dt);
      tryAttack(M, mob, ctx, pp);
    }
    return;
  }
  const lit = lightAt(world, mob.pos.x, mob.pos.y + 0.3, mob.pos.z) >= def.lightFear;
  if (lit) {
    const d = seekShade(world, mob);
    steerDir(mob, d.x, d.z, def.speed * 0.6, dt);
    return;
  }
  patrol(mob, world, dt);
}

const BEHAVIORS = {
  thornhound: behThornhound,
  rootling: behRootling,
  gloomcap: behGloomcap,
  ashwisp: behAshwisp,
  hollowone: behHollowone,
  sporeling: behSporeling,
};

function coarseMove(mob, world, dt) {
  if (mob.state === 'frozen' || mob.state === 'dormant') return;
  if (mob.def.flyer) {
    mob.pos.x += mob.vel.x * dt;
    mob.pos.y += mob.vel.y * dt;
    mob.pos.z += mob.vel.z * dt;
    return;
  }
  mob.vel.y -= GRAVITY * dt;
  if (mob.vel.y < -TERMINAL_VELOCITY) mob.vel.y = -TERMINAL_VELOCITY;
  physicsMove(mob, world, dt);
}

function tickMob(M, mob, world, heard, ctx, dt) {
  mob.stunTimer = Math.max(0, mob.stunTimer - dt);
  mob.flashTimer = Math.max(0, mob.flashTimer - dt);
  mob.burnTimer = Math.max(0, mob.burnTimer - dt);
  mob.recoverTimer = Math.max(0, mob.recoverTimer - dt);
  mob.attackCd = Math.max(0, mob.attackCd - dt);
  mob.hitX = false;
  mob.hitY = false;
  mob.hitZ = false;

  if (mob.state === 'frozen') {
    const stillLit =
      mob.typeId === 'hollowone' && lightAt(world, mob.pos.x, mob.pos.y + 1, mob.pos.z) >= mob.def.freezeLight;
    if (stillLit) {
      mob.vel.x = 0;
      mob.vel.y = 0;
      mob.vel.z = 0;
      vocalTick(mob, ctx, dt);
      return;
    }
    setState(mob, mob.mem ? 'hunt' : 'idle');
  }

  const beh = BEHAVIORS[mob.typeId];
  if (beh) beh(M, mob, world, ctx, heard, dt);

  if (mob.dead) return;

  const frozen = BEHAVIORS[mob.typeId] === behHollowone && lightAt(world, mob.pos.x, mob.pos.y + 1, mob.pos.z) >= mob.def.freezeLight;
  if (frozen) {
    setState(mob, 'frozen');
    mob.vel.x = 0;
    mob.vel.y = 0;
    mob.vel.z = 0;
    vocalTick(mob, ctx, dt);
    return;
  }

  const stunned = mob.stunTimer > 0 || mob.recoverTimer > 0;
  if (stunned && !mob.def.flyer && mob.state !== 'lunge') {
    mob.vel.x *= 1 - Math.min(1, dt * 10);
    mob.vel.z *= 1 - Math.min(1, dt * 10);
  }

  if (mob.def.flyer) {
    physicsMove(mob, world, dt);
  } else {
    mob.vel.y -= GRAVITY * dt;
    if (mob.vel.y < -TERMINAL_VELOCITY) mob.vel.y = -TERMINAL_VELOCITY;
    physicsMove(mob, world, dt);
  }

  mob.animPhase += Math.hypot(mob.vel.x, mob.vel.z) * dt * 1.7;
  vocalTick(mob, ctx, dt);
}

export class MobManager {
  constructor(worldRef) {
    this.world = worldRef || null;
    this.mobs = [];
    this.attackEvents = [];
    this.hurtEvents = [];
    this.deathEvents = [];
    this.spawnCounter = 0;
    this.seedBase = 0x9e3779b9;
    this.ctx = {};
    this.time = 0;
    this.tick = 0;
  }

  spawnMob(typeId, x, y, z) {
    const def = MOB_TYPES[typeId];
    if (!def) return null;
    const rng = makeRng((this.seedBase ^ (this.spawnCounter * 0x85ebca6b)) >>> 0);
    this.spawnCounter++;
    const mob = {
      typeId,
      def,
      pos: { x, y, z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: rng() * Math.PI * 2,
      pitch: 0,
      faceYaw: 0,
      hp: def.hp,
      maxHp: def.hp,
      state: def.flyer ? 'drift' : typeId === 'gloomcap' ? 'dormant' : typeId === 'hollowone' ? 'idle' : 'patrol',
      prevState: null,
      stateTimer: 0,
      target: null,
      path: null,
      pathIdx: 0,
      repathTimer: 0,
      pathAge: 0,
      pathGoal: null,
      stunTimer: 0,
      flashTimer: 0,
      burnTimer: 0,
      recoverTimer: 0,
      attackCd: 0,
      aggro: false,
      homeX: x,
      homeZ: z,
      onGround: false,
      animPhase: rng() * Math.PI * 2,
      phaseT: 0,
      headAng: rng() * Math.PI * 2,
      turnSign: rng() < 0.5 ? 1 : -1,
      skyT: 0,
      mem: null,
      lostT: 0,
      noiseTarget: null,
      noiseT: 0,
      wp: null,
      wanderT: 0,
      vocalize: false,
      vocalT: 2 + rng() * 5,
      lodPhase: this.spawnCounter & 3,
      dead: false,
      rng,
      spawnIndex: this.spawnCounter - 1,
    };
    this.mobs.push(mob);
    return mob;
  }

  removeMob(mob) {
    const i = this.mobs.indexOf(mob);
    if (i >= 0) this.mobs.splice(i, 1);
  }

  damageMob(mob, amount, kbVec) {
    if (!mob || mob.dead) return;
    mob.hp -= amount;
    mob.stunTimer = 0.22;
    mob.flashTimer = 0.15;
    if (kbVec) {
      mob.vel.x += kbVec.x || 0;
      mob.vel.y += kbVec.y || 0;
      mob.vel.z += kbVec.z || 0;
    }
    mob.aggro = true;
    this.hurtEvents.push({ typeId: mob.typeId, pos: { ...mob.pos }, amount });
    if (mob.typeId === 'sporeling') retaliationSwarm(this, mob);
    if (mob.typeId === 'thornhound' && mob.target) setPackAggro(this, mob, mob.target);
    if (mob.hp <= 0) {
      mob.dead = true;
      this.deathEvents.push({ typeId: mob.typeId, pos: { ...mob.pos } });
      this.removeMob(mob);
    }
  }

  counts() {
    let hostile = 0;
    let passive = 0;
    for (const m of this.mobs) {
      if (m.def.hostile) hostile++;
      else passive++;
    }
    return { total: this.mobs.length, hostile, passive };
  }

  update(dt, ctx) {
    this.ctx = ctx || {};
    this.tick++;
    this.time += dt;
    const world = this.ctx.world || this.world;
    if (!world) return;
    const heard = Array.isArray(this.ctx.noises) ? this.ctx.noises.slice() : [];
    if (this.ctx.noises && this.ctx.noises.length) this.ctx.noises.length = 0;
    const playerPos = this.ctx.player && this.ctx.player.pos ? this.ctx.player.pos : null;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      if (mob.dead) {
        this.mobs.splice(i, 1);
        continue;
      }
      if (heard.length) intakeNoise(this, mob, heard);
      mob.lodPhase = (mob.lodPhase + 1) & 3;
      const dp = playerPos ? dist3(mob.pos, playerPos) : 0;
      if (dp > 48 && (mob.lodPhase & 3) !== 0 && mob.state !== 'frozen' && mob.state !== 'dormant') {
        coarseMove(mob, world, dt);
        continue;
      }
      tickMob(this, mob, world, heard, this.ctx, dt);
      if (mob.dead) this.mobs.splice(i, 1);
    }
  }
}
