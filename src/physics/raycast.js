import { REACH } from '../config.js';
import { blockDef } from '../blocks.js';

export function raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxDist = REACH, opts = {}) {
  const hitLiquid = !!opts.hitLiquid;
  const bx = Math.floor(ox);
  const by = Math.floor(oy);
  const bz = Math.floor(oz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx > 0 ? (bx + 1 - ox) / dx : dx < 0 ? (bx - ox) / dx : Infinity;
  let tMaxY = dy > 0 ? (by + 1 - oy) / dy : dy < 0 ? (by - oy) / dy : Infinity;
  let tMaxZ = dz > 0 ? (bz + 1 - oz) / dz : dz < 0 ? (bz - oz) / dz : Infinity;
  const passes = (id) => {
    const def = blockDef(id);
    return def.solid === true || (hitLiquid && def.liquid === true);
  };
  const startId = world.getBlock(bx, by, bz);
  if (passes(startId)) return { x: bx, y: by, z: bz, nx: 0, ny: 0, nz: 0, id: startId, dist: 0 };
  let cx = bx;
  let cy = by;
  let cz = bz;
  const guardLimit = Math.ceil(Math.abs(maxDist)) * 3 + 32;
  let guard = 0;
  while (guard++ < guardLimit) {
    let t;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      if (!Number.isFinite(tMaxX)) return null;
      t = tMaxX;
      cx += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
    } else if (tMaxY <= tMaxZ) {
      if (!Number.isFinite(tMaxY)) return null;
      t = tMaxY;
      cy += stepY;
      tMaxY += tDeltaY;
      ny = -stepY;
    } else {
      if (!Number.isFinite(tMaxZ)) return null;
      t = tMaxZ;
      cz += stepZ;
      tMaxZ += tDeltaZ;
      nz = -stepZ;
    }
    if (t > maxDist) return null;
    const id = world.getBlock(cx, cy, cz);
    if (passes(id)) return { x: cx, y: cy, z: cz, nx, ny, nz, id, dist: t };
  }
  return null;
}
