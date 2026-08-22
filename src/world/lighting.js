import { CHUNK_SIZE, WORLD_HEIGHT } from '../config.js';
import { BLOCK, blockDef } from '../blocks.js';

const CS = CHUNK_SIZE;

export function idx(x, y, z) {
  return x | (z << 4) | (y << 8);
}

function getSky(chunk, i) {
  return chunk.lights[i] & 15;
}

function getBlk(chunk, i) {
  return (chunk.lights[i] >> 4) & 15;
}

function setSky(chunk, i, v) {
  chunk.lights[i] = (chunk.lights[i] & 0xf0) | v;
}

function setBlk(chunk, i, v) {
  chunk.lights[i] = (chunk.lights[i] & 0x0f) | (v << 4);
}

function atten(def) {
  if (!def || def.id === BLOCK.AIR) return 0;
  return def.opaque ? 16 : def.cutout ? 2 : 0;
}

class Queue {
  constructor() {
    this.xs = [];
    this.ys = [];
    this.zs = [];
    this.head = 0;
  }
  clear() {
    this.xs.length = 0;
    this.ys.length = 0;
    this.zs.length = 0;
    this.head = 0;
  }
  push(x, y, z) {
    this.xs.push(x);
    this.ys.push(y);
    this.zs.push(z);
  }
  shift() {
    if (this.head >= this.xs.length) return false;
    const h = this.head++;
    this.outX = this.xs[h];
    this.outY = this.ys[h];
    this.outZ = this.zs[h];
    return true;
  }
  compact() {
    if (this.head > 4096 && this.head * 2 > this.xs.length) {
      this.xs.splice(0, this.head);
      this.ys.splice(0, this.head);
      this.zs.splice(0, this.head);
      this.head = 0;
    }
  }
}

const skyQ = new Queue();
const blkQ = new Queue();
const remQ = new Queue();

const FACES = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

export function lightChunk(chunk, world) {
  const { voxels, lights } = chunk;
  lights.fill(0);
  skyQ.clear();
  blkQ.clear();

  for (let z = 0; z < CS; z++) {
    for (let x = 0; x < CS; x++) {
      let level = 15;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const i = idx(x, y, z);
        const d = blockDef(voxels[i]);
        if (d.opaque) {
          level = 0;
        } else {
          const a = atten(d);
          if (a > 0 && level > 0) level = Math.max(0, level - a);
        }
        setSky(chunk, i, level);
        if (d.lightSource > 0) {
          setBlk(chunk, i, d.lightSource);
          blkQ.push(x, y, z);
        }
        if (level > 1) skyQ.push(x, y, z);
      }
    }
  }

  spreadSky(chunk, world, skyQ);
  spreadBlk(chunk, world, blkQ);
}

export function spreadSky(chunk, world, queue) {
  const { voxels } = chunk;
  while (queue.shift()) {
    const x = queue.outX, y = queue.outY, z = queue.outZ;
    const cur = getSky(chunk, idx(x, y, z));
    if (cur <= 1) continue;
    for (let f = 0; f < 6; f++) {
      const nx = x + FACES[f][0];
      const ny = y + FACES[f][1];
      const nz = z + FACES[f][2];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      if (nx < 0 || nx >= CS || nz < 0 || nz >= CS) {
        if (world) world.pokeBorderLight(chunk.cx, chunk.cz, nx, ny, nz, cur, true);
        continue;
      }
      const ni = idx(nx, ny, nz);
      const d = blockDef(voxels[ni]);
      if (d.opaque) continue;
      let nl = f === 3 ? (cur === 15 ? 15 : cur - 1) : cur - 1;
      if (d.cutout) nl -= 1;
      nl = Math.max(0, nl);
      if (getSky(chunk, ni) >= nl) continue;
      setSky(chunk, ni, nl);
      if (nl > 1) queue.push(nx, ny, nz);
    }
  }
  queue.compact();
}

export function spreadBlk(chunk, world, queue) {
  const { voxels } = chunk;
  while (queue.shift()) {
    const x = queue.outX, y = queue.outY, z = queue.outZ;
    const cur = getBlk(chunk, idx(x, y, z));
    if (cur <= 1) continue;
    for (let f = 0; f < 6; f++) {
      const nx = x + FACES[f][0];
      const ny = y + FACES[f][1];
      const nz = z + FACES[f][2];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      if (nx < 0 || nx >= CS || nz < 0 || nz >= CS) {
        if (world) world.pokeBorderLight(chunk.cx, chunk.cz, nx, ny, nz, cur, false);
        continue;
      }
      const ni = idx(nx, ny, nz);
      const d = blockDef(voxels[ni]);
      if (d.opaque) continue;
      const nl = Math.max(0, cur - 1 - (d.cutout ? 1 : 0));
      if (getBlk(chunk, ni) >= nl) continue;
      setBlk(chunk, ni, nl);
      if (nl > 1) queue.push(nx, ny, nz);
    }
  }
  queue.compact();
}

export function seedAndSpread(chunk, world, x, y, z, isSky) {
  const q = isSky ? skyQ : blkQ;
  q.clear();
  q.push(x, y, z);
  if (isSky) spreadSky(chunk, world, q);
  else spreadBlk(chunk, world, q);
}

export function localRelight(chunk, world, x, y, z) {
  const placedOpaque = isOpaqueId(chunk.voxels[idx(x, y, z)]);
  skyQ.clear();
  blkQ.clear();
  if (placedOpaque) {
    unlightSky(chunk, x, y, z);
    unlightBlk(chunk, x, y, z);
  } else {
    pullNeighbors(chunk, world, x, y, z);
  }
  const d = blockDef(chunk.voxels[idx(x, y, z)]);
  if (d.lightSource > 0) {
    setBlk(chunk, idx(x, y, z), d.lightSource);
    blkQ.push(x, y, z);
  }
  spreadSky(chunk, world, skyQ);
  spreadBlk(chunk, world, blkQ);
}

function isOpaqueId(id) {
  return !!blockDef(id).opaque;
}

function relightColumnSky(chunk, x, z) {
  const { voxels } = chunk;
  let level = 15;
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const i = idx(x, y, z);
    const d = blockDef(voxels[i]);
    if (d.opaque) break;
    const a = atten(d);
    if (a > 0 && level > 0) level = Math.max(0, level - a);
    setSky(chunk, i, level);
    if (level > 1) skyQ.push(x, y, z);
  }
}

function pullNeighbors(chunk, world, x, y, z) {
  const ci = idx(x, y, z);
  for (let f = 0; f < 6; f++) {
    const nx = x + FACES[f][0];
    const ny = y + FACES[f][1];
    const nz = z + FACES[f][2];
    if (ny < 0 || ny >= WORLD_HEIGHT) continue;
    if (nx < 0 || nx >= CS || nz < 0 || nz >= CS) {
      const pulled = world ? world.pullBorderLight(chunk.cx, chunk.cz, nx, ny, nz) : null;
      if (pulled) {
        setSky(chunk, ci, Math.max(getSky(chunk, ci), pulled.sky));
        setBlk(chunk, ci, Math.max(getBlk(chunk, ci), pulled.blk));
      }
      continue;
    }
    const i = idx(nx, ny, nz);
    const s = getSky(chunk, i);
    const b = getBlk(chunk, i);
    if (s > 1) {
      setSky(chunk, ci, Math.max(getSky(chunk, ci), s - 1));
      skyQ.push(x, y, z);
    }
    if (b > 1) {
      setBlk(chunk, ci, Math.max(getBlk(chunk, ci), b - 1));
      blkQ.push(x, y, z);
    }
  }
  relightColumnSky(chunk, x, z);
}

function unlightSky(chunk, ox, oy, oz) {
  remQ.clear();
  const startI = idx(ox, oy, oz);
  const oldLevel = getSky(chunk, startI);
  setSky(chunk, startI, 0);
  if (oldLevel > 1) remQ.push(ox, oy, oz);
  while (remQ.shift()) {
    const x = remQ.outX, y = remQ.outY, z = remQ.outZ;
    const cur = getSky(chunk, idx(x, y, z));
    for (let f = 0; f < 6; f++) {
      const nx = x + FACES[f][0];
      const ny = y + FACES[f][1];
      const nz = z + FACES[f][2];
      if (nx < 0 || nx >= CS || nz < 0 || nz >= CS || ny < 0 || ny >= WORLD_HEIGHT) continue;
      const ni = idx(nx, ny, nz);
      const nl = getSky(chunk, ni);
      if (nl === 0) continue;
      if (nl < cur || (cur === 15 && f === 3)) {
        setSky(chunk, ni, 0);
        remQ.push(nx, ny, nz);
      } else {
        skyQ.push(nx, ny, nz);
      }
    }
  }
}

function unlightBlk(chunk, ox, oy, oz) {
  remQ.clear();
  const startI = idx(ox, oy, oz);
  const oldLevel = getBlk(chunk, startI);
  setBlk(chunk, startI, 0);
  if (oldLevel > 1) remQ.push(ox, oy, oz);
  while (remQ.shift()) {
    const x = remQ.outX, y = remQ.outY, z = remQ.outZ;
    const cur = getBlk(chunk, idx(x, y, z));
    for (let f = 0; f < 6; f++) {
      const nx = x + FACES[f][0];
      const ny = y + FACES[f][1];
      const nz = z + FACES[f][2];
      if (nx < 0 || nx >= CS || nz < 0 || nz >= CS || ny < 0 || ny >= WORLD_HEIGHT) continue;
      const ni = idx(nx, ny, nz);
      const nl = getBlk(chunk, ni);
      if (nl === 0) continue;
      if (nl < cur) {
        setBlk(chunk, ni, 0);
        remQ.push(nx, ny, nz);
      } else {
        blkQ.push(nx, ny, nz);
      }
    }
  }
}
