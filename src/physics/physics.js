const MAX_SUBSTEP_DISTANCE = 0.4;

export function resolveHalfExtents(extents) {
  if (extents && typeof extents.w === 'number' && typeof extents.h === 'number') {
    return { hx: extents.w / 2, hy: extents.h / 2, hz: extents.w / 2 };
  }
  return { hx: extents.x, hy: extents.y, hz: extents.z };
}

export function aabbOverlapsVoxels(world, min, max) {
  const hits = [];
  const x0 = Math.floor(min.x);
  const x1 = Math.floor(max.x);
  const y0 = Math.floor(min.y);
  const y1 = Math.floor(max.y);
  const z0 = Math.floor(min.z);
  const z1 = Math.floor(max.z);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (
          min.x < x + 1 &&
          max.x > x &&
          min.y < y + 1 &&
          max.y > y &&
          min.z < z + 1 &&
          max.z > z &&
          world.isSolid(x, y, z)
        ) {
          hits.push({ x, y, z });
        }
      }
    }
  }
  return hits;
}

export function moveAABB(world, pos, vel, halfExtents, dt) {
  const result = { onGround: false, hitX: false, hitY: false, hitZ: false };
  if (!(dt > 0) || !Number.isFinite(dt)) return result;
  const { hx, hy, hz } = resolveHalfExtents(halfExtents);
  const height = hy * 2;
  const maxDisp = Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z)) * dt;
  const steps = Math.max(1, Math.ceil(maxDisp / MAX_SUBSTEP_DISTANCE));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    let d = vel.y * sdt;
    if (d !== 0) {
      const ny = pos.y + d;
      const hits = aabbOverlapsVoxels(
        world,
        { x: pos.x - hx, y: ny, z: pos.z - hz },
        { x: pos.x + hx, y: ny + height, z: pos.z + hz }
      );
      if (hits.length > 0) {
        result.hitY = true;
        if (d < 0) {
          let top = -Infinity;
          for (const h of hits) if (h.y + 1 > top) top = h.y + 1;
          pos.y = top;
          result.onGround = true;
        } else {
          let bottom = Infinity;
          for (const h of hits) if (h.y < bottom) bottom = h.y;
          pos.y = bottom - height;
        }
        vel.y = 0;
      } else {
        pos.y = ny;
      }
    }
    d = vel.x * sdt;
    if (d !== 0) {
      const nx = pos.x + d;
      const hits = aabbOverlapsVoxels(
        world,
        { x: nx - hx, y: pos.y, z: pos.z - hz },
        { x: nx + hx, y: pos.y + height, z: pos.z + hz }
      );
      if (hits.length > 0) {
        result.hitX = true;
        if (d > 0) {
          let wall = Infinity;
          for (const h of hits) if (h.x < wall) wall = h.x;
          pos.x = wall - hx;
        } else {
          let wall = -Infinity;
          for (const h of hits) if (h.x + 1 > wall) wall = h.x + 1;
          pos.x = wall + hx;
        }
        vel.x = 0;
      } else {
        pos.x = nx;
      }
    }
    d = vel.z * sdt;
    if (d !== 0) {
      const nz = pos.z + d;
      const hits = aabbOverlapsVoxels(
        world,
        { x: pos.x - hx, y: pos.y, z: nz - hz },
        { x: pos.x + hx, y: pos.y + height, z: nz + hz }
      );
      if (hits.length > 0) {
        result.hitZ = true;
        if (d > 0) {
          let wall = Infinity;
          for (const h of hits) if (h.z < wall) wall = h.z;
          pos.z = wall - hz;
        } else {
          let wall = -Infinity;
          for (const h of hits) if (h.z + 1 > wall) wall = h.z + 1;
          pos.z = wall + hz;
        }
        vel.z = 0;
      } else {
        pos.z = nz;
      }
    }
  }
  return result;
}

export function fallDamage(impactVel) {
  if (!(impactVel >= 11)) return 0;
  return Math.round((impactVel - 11) * 1.4);
}
