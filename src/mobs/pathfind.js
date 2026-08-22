const SQRT2 = Math.SQRT2;
const DROP_MAX = 3;
const STEP_UP = 1;

function canStand(world, x, y, z) {
  if (y < 1 || y > 190) return false;
  if (!world.isSolid(x, y - 1, z)) return false;
  if (world.isSolid(x, y, z) || world.isSolid(x, y + 1, z)) return false;
  return true;
}

function pickLevel(world, x, z, y) {
  if (canStand(world, x, y + STEP_UP, z)) return y + STEP_UP;
  if (canStand(world, x, y, z)) return y;
  for (let d = 1; d <= DROP_MAX; d++) {
    if (canStand(world, x, y - d, z)) return y - d;
  }
  return null;
}

function cardinalOpen(world, x, z, y) {
  return pickLevel(world, x, z, y) !== null;
}

class MinHeap {
  constructor() {
    this.a = [];
  }

  get size() {
    return this.a.length;
  }

  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      const t = a[p];
      a[p] = a[i];
      a[i] = t;
      i = p;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        const t = a[m];
        a[m] = a[i];
        a[i] = t;
        i = m;
      }
    }
    return top;
  }
}

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIRS_DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function octile(dx, dz, dy) {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  const h = ax + az + (SQRT2 - 2) * Math.min(ax, az);
  return h + Math.abs(dy) * 0.25;
}

export function findPath(world, sx, sy, sz, gx, gy, gz, maxNodes = 400) {
  if (!world || typeof world.isSolid !== 'function') return null;
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  sz = Math.floor(sz);
  gx = Math.floor(gx);
  gy = Math.floor(gy);
  gz = Math.floor(gz);
  const sy2 = pickLevel(world, sx, sz, sy);
  if (sy2 === null) return null;
  const gy2 = pickLevel(world, gx, gz, gy);
  if (gy2 === null) return null;
  if (sx === gx && sz === gz && Math.abs(sy2 - gy2) <= STEP_UP) return [];

  const keyOf = (x, y, z) => x + ',' + y + ',' + z;
  const startKey = keyOf(sx, sy2, sz);
  const goalKey = keyOf(gx, gy2, gz);
  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();
  const open = new MinHeap();

  gScore.set(startKey, 0);
  open.push({ k: startKey, x: sx, y: sy2, z: sz, f: octile(gx - sx, gz - sz, gy2 - sy2) });

  let expanded = 0;
  while (open.size > 0 && expanded < maxNodes) {
    const cur = open.pop();
    if (closed.has(cur.k)) continue;
    closed.add(cur.k);
    expanded++;
    if (cur.k === goalKey) {
      const path = [];
      let node = cur;
      while (node.k !== startKey) {
        path.push({ x: node.x, y: node.y, z: node.z });
        const prev = cameFrom.get(node.k);
        if (!prev) break;
        node = prev;
      }
      path.reverse();
      return path;
    }
    for (const [dx, dz] of DIRS4) {
      relaxNeighbor(world, cur, dx, dz, false, goalKey, startKey, gx, gy2, gz, gScore, cameFrom, closed, open);
    }
    for (const [dx, dz] of DIRS_DIAG) {
      if (!cardinalOpen(world, cur.x + dx, cur.z, cur.y)) continue;
      if (!cardinalOpen(world, cur.x, cur.z + dz, cur.y)) continue;
      relaxNeighbor(world, cur, dx, dz, true, goalKey, startKey, gx, gy2, gz, gScore, cameFrom, closed, open);
    }
  }
  return null;
}

function relaxNeighbor(world, cur, dx, dz, diag, goalKey, startKey, gx, gy2, gz, gScore, cameFrom, closed, open) {
  const nx = cur.x + dx;
  const nz = cur.z + dz;
  const ny = pickLevel(world, nx, nz, cur.y);
  if (ny === null) return;
  if (diag && ny > cur.y && !canStand(world, nx, cur.y + 1, nz)) return;
  const rise = ny - cur.y;
  const drop = cur.y - ny;
  if (rise > STEP_UP || drop > DROP_MAX) return;
  const stepCost = (diag ? SQRT2 : 1) + (rise > 0 ? 1.2 : drop * 0.35);
  const tentative = gScore.get(cur.k) + stepCost;
  const nk = nx + ',' + ny + ',' + nz;
  if (tentative >= (gScore.get(nk) ?? Infinity)) return;
  if (closed.has(nk)) return;
  gScore.set(nk, tentative);
  cameFrom.set(nk, { k: cur.k, x: cur.x, y: cur.y, z: cur.z });
  const h = octile(gx - nx, gz - nz, gy2 - ny);
  open.push({ k: nk, x: nx, y: ny, z: nz, f: tentative + h });
}

export function hasLineOfWalk(world, a, b) {
  if (!a || !b || !world || typeof world.isSolid !== 'function') return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.0001) return true;
  if (dist > 64) return false;
  const steps = Math.max(1, Math.ceil(dist / 0.35));
  const ix = dx / steps;
  const iy = dy / steps;
  const iz = dz / steps;
  let lastCell = '';
  for (let i = 0; i <= steps; i++) {
    const cx = Math.floor(a.x + ix * i);
    const cy = Math.floor(a.y + iy * i);
    const cz = Math.floor(a.z + iz * i);
    const ck = cx + ',' + cy + ',' + cz;
    if (ck === lastCell) continue;
    lastCell = ck;
    if (world.isSolid(cx, cy, cz) || world.isSolid(cx, cy + 1, cz)) return false;
    if (!world.isSolid(cx, cy - 1, cz) && !world.isSolid(cx, cy - 2, cz)) return false;
  }
  return true;
}
