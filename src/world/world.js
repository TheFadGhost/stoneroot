import {
  CHUNK_SIZE, WORLD_HEIGHT, RENDER_DISTANCE_CHUNKS, UNLOAD_DISTANCE_CHUNKS,
  MAX_GEN_JOBS_INFLIGHT, MAX_MESH_JOBS_INFLIGHT,
} from '../config.js';
import { BLOCK, blockDef } from '../blocks.js';
import { lightChunk, localRelight, idx, seedAndSpread } from './lighting.js';

const CS = CHUNK_SIZE;

function key(cx, cz) {
  return cx + ',' + cz;
}

class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, []);
    this.map.get(ev).push(fn);
  }
  off(ev, fn) {
    const l = this.map.get(ev);
    if (l) this.map.set(ev, l.filter((f) => f !== fn));
  }
  emit(ev, payload) {
    const l = this.map.get(ev);
    if (l) for (const fn of l) fn(payload);
  }
}

export class World extends Emitter {
  constructor(seed) {
    super();
    this.seed = seed >>> 0;
    this.chunks = new Map();
    this.diffs = new Map();
    this.timeOfDay = 0.03;
    this.threatLevel = 0;
    this.genInflight = 0;
    this.meshInflight = 0;
    this.pendingGen = new Set();
    this.pendingMesh = new Set();
    this.lightQueue = [];
    this.urgentMesh = [];
    this.meshQueue = [];
    this.frameCount = 0;
    this.jobSeq = 1;

    this.genWorker = new Worker(new URL('../workers/genworker.js', import.meta.url), { type: 'module' });
    this.genWorker.onmessage = (e) => this.onGenResult(e.data);
    this.genWorker.postMessage({ type: 'init', seed: this.seed });

    this.meshWorker = new Worker(new URL('../workers/meshworker.js', import.meta.url), { type: 'module' });
    this.meshWorker.onmessage = (e) => this.onMeshResult(e.data);
  }

  dispose() {
    this.genWorker.terminate();
    this.meshWorker.terminate();
    for (const ch of this.chunks.values()) this.disposeChunkMeshes(ch);
    this.chunks.clear();
  }

  getChunk(cx, cz) {
    return this.chunks.get(key(cx, cz));
  }

  getBlock(x, y, z) {
    if (y < 0) return BLOCK.CORESTONE;
    if (y >= WORLD_HEIGHT) return BLOCK.AIR;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const ch = this.chunks.get(key(fx >> 4, fz >> 4));
    if (!ch || !ch.hasVoxels) return BLOCK.AIR;
    return ch.voxels[idx(fx & 15, fy, fz & 15)];
  }

  isSolid(x, y, z) {
    return blockDef(this.getBlock(x, y, z)).solid === true;
  }

  isLiquidAt(x, y, z) {
    return this.getBlock(x, y, z) === BLOCK.MAGMA;
  }

  getLightRaw(x, y, z) {
    if (y >= WORLD_HEIGHT) return 0xf0;
    if (y < 0) return 0;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const ch = this.chunks.get(key(fx >> 4, fz >> 4));
    if (!ch || !ch.lit) return 0xc0;
    return ch.lights[idx(fx & 15, fy, fz & 15)];
  }

  getSky(x, y, z) {
    return this.getLightRaw(x, y, z) & 15;
  }

  getBlockLight(x, y, z) {
    return (this.getLightRaw(x, y, z) >> 4) & 15;
  }

  lightAt(x, y, z) {
    const raw = this.getLightRaw(x, y, z);
    return { sky: raw & 15, blk: (raw >> 4) & 15 };
  }

  surfaceHeight(x, z) {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    const ch = this.chunks.get(key(fx >> 4, fz >> 4));
    if (!ch || !ch.hasVoxels) return 151;
    return ch.surfaceY[(fx & 15) | ((fz & 15) << 4)];
  }

  setBlock(x, y, z, id, opts = {}) {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    if (fy < 0 || fy >= WORLD_HEIGHT) return false;
    const cx = fx >> 4;
    const cz = fz >> 4;
    const ch = this.chunks.get(key(cx, cz));
    if (!ch || !ch.hasVoxels) return false;
    if (!opts.force && blockDef(id).hardness === Infinity && id !== BLOCK.AIR) return false;
    const lx = fx & 15;
    const lz = fz & 15;
    const i = idx(lx, fy, lz);
    if (ch.voxels[i] === id) return true;
    ch.voxels[i] = id;

    let d = this.diffs.get(key(cx, cz));
    if (!d) {
      d = new Map();
      this.diffs.set(key(cx, cz), d);
    }
    d.set(i, id);

    localRelight(ch, this, lx, fy, lz);

    this.queueUrgentRemesh(cx, cz);
    for (let f = 0; f < 4; f++) {
      const nx = f === 0 ? cx + 1 : f === 1 ? cx - 1 : cx;
      const nz = f === 2 ? cz + 1 : f === 3 ? cz - 1 : cz;
      this.queueUrgentRemesh(nx, nz);
    }

    this.emit('block-changed', { x: fx, y: fy, z: fz, id });
    return true;
  }

  pokeBorderLight(cx, cz, nx, ny, nz, level, isSky) {
    const dx = nx < 0 ? -1 : nx >= CS ? 1 : 0;
    const dz = nz < 0 ? -1 : nz >= CS ? 1 : 0;
    if (dx === 0 && dz === 0) return;
    const ch = this.chunks.get(key(cx + dx, cz + dz));
    if (!ch || !ch.lit) return;
    const lx = ((nx % CS) + CS) % CS;
    const lz = ((nz % CS) + CS) % CS;
    const i = idx(lx, ny, lz);
    const d = blockDef(ch.voxels[i]);
    if (d.opaque) return;
    let nl = level - 1 - (d.cutout ? 1 : 0);
    if (nl <= 0) return;
    const cur = isSky ? (ch.lights[i] & 15) : ((ch.lights[i] >> 4) & 15);
    if (cur >= nl) return;
    if (isSky) ch.lights[i] = (ch.lights[i] & 0xf0) | nl;
    else ch.lights[i] = (ch.lights[i] & 0x0f) | (nl << 4);
    seedAndSpread(ch, this, lx, ny, lz, isSky);
    this.flagRemesh(cx + dx, cz + dz);
  }

  pullBorderLight(cx, cz, nx, ny, nz) {
    const dx = nx < 0 ? -1 : nx >= CS ? 1 : 0;
    const dz = nz < 0 ? -1 : nz >= CS ? 1 : 0;
    const ch = this.chunks.get(key(cx + dx, cz + dz));
    if (!ch || !ch.lit) return null;
    const lx = ((nx % CS) + CS) % CS;
    const lz = ((nz % CS) + CS) % CS;
    const raw = ch.lights[idx(lx, ny, lz)];
    return { sky: raw & 15, blk: (raw >> 4) & 15 };
  }

  applyDiffOverlay(cx, cz, diffEntries) {
    const ch = this.chunks.get(key(cx, cz));
    if (!ch || !ch.hasVoxels) return false;
    for (const [i, id] of diffEntries) ch.voxels[i] = id;
    return true;
  }

  update(px, pz, budgetMs = 6) {
    this.frameCount++;
    const pcx = Math.floor(px / CS);
    const pcz = Math.floor(pz / CS);
    const t0 = performance.now();

    this.processLightQueue(budgetMs * 0.6);

    const R = RENDER_DISTANCE_CHUNKS;
    const wanted = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R + R) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const k = key(cx, cz);
        if (this.chunks.has(k) || this.pendingGen.has(k)) continue;
        wanted.push([dx * dx + dz * dz, cx, cz]);
      }
    }
    wanted.sort((a, b) => a[0] - b[0]);
    while (wanted.length && this.genInflight < MAX_GEN_JOBS_INFLIGHT) {
      const [, cx, cz] = wanted.shift();
      const k = key(cx, cz);
      this.pendingGen.add(k);
      this.genInflight++;
      this.genWorker.postMessage({ type: 'gen', cx, cz });
    }

    if (this.frameCount % 45 === 0) this.unloadFar(pcx, pcz);

    this.dispatchMeshJobs(pcx, pcz);
  }

  processLightQueue(budgetMs) {
    if (!this.lightQueue.length) return;
    const t0 = performance.now();
    this.lightQueue.sort((a, b) => a.d - b.d);
    while (this.lightQueue.length) {
      if (performance.now() - t0 > budgetMs) break;
      const entry = this.lightQueue.shift();
      const ch = this.chunks.get(entry.k);
      if (!ch || !ch.hasVoxels) continue;
      lightChunk(ch, this);
      ch.lit = true;
      ch.relightPasses++;
      this.emit('chunk-lit', { cx: ch.cx, cz: ch.cz });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key(ch.cx + dx, ch.cz + dz);
        const nb = this.chunks.get(nk);
        if (nb && nb.lit && nb.relightPasses < 3) {
          this.lightQueue.push({ k: nk, d: entry.d });
        }
      }
    }
  }

  dispatchMeshJobs(pcx, pcz) {
    while (this.urgentMesh.length && this.meshInflight < 8) {
      const k = this.urgentMesh.pop();
      this.sendMeshJob(k, true);
    }
    if (this.meshQueue.length) {
      this.meshQueue.sort((a, b) => a.d - b.d);
    }
    while (this.meshQueue.length && this.meshInflight < MAX_MESH_JOBS_INFLIGHT) {
      const e = this.meshQueue.shift();
      this.sendMeshJob(e.k, false);
    }
  }

  sendMeshJob(k, urgent) {
    const ch = this.chunks.get(k);
    if (!ch || !ch.lit || !ch.hasVoxels || this.pendingMesh.has(k)) return;
    const nbrs = {};
    let ready = true;
    for (const [name, dx, dz] of [['px', 1, 0], ['nx', -1, 0], ['pz', 0, 1], ['nz', 0, -1], ['pp', 1, 1], ['pn', 1, -1], ['np', -1, 1], ['nn', -1, -1]]) {
      const nb = this.chunks.get(key(ch.cx + dx, ch.cz + dz));
      if (!nb || !nb.hasVoxels) {
        ready = false;
        break;
      }
      nbrs[name] = nb;
    }
    if (!ready) {
      if (!urgent) return;
      for (const name of Object.keys(nbrs)) delete nbrs[name];
    }
    this.pendingMesh.add(k);
    this.meshInflight++;
    const pack = (c) => ({ voxels: c.voxels.slice(), lights: c.lights.slice() });
    const msg = {
      type: 'mesh',
      jobId: this.jobSeq++,
      cx: ch.cx,
      cz: ch.cz,
      voxels: ch.voxels.slice(),
      lights: ch.lights.slice(),
      px: nbrs.px ? pack(nbrs.px) : null,
      nx: nbrs.nx ? pack(nbrs.nx) : null,
      pz: nbrs.pz ? pack(nbrs.pz) : null,
      nz: nbrs.nz ? pack(nbrs.nz) : null,
      pp: nbrs.pp ? pack(nbrs.pp) : null,
      pn: nbrs.pn ? pack(nbrs.pn) : null,
      np: nbrs.np ? pack(nbrs.np) : null,
      nn: nbrs.nn ? pack(nbrs.nn) : null,
    };
    this.meshWorker.postMessage(msg, [
      msg.voxels.buffer, msg.lights.buffer,
      ...(msg.px ? [msg.px.voxels.buffer, msg.px.lights.buffer] : []),
      ...(msg.nx ? [msg.nx.voxels.buffer, msg.nx.lights.buffer] : []),
      ...(msg.pz ? [msg.pz.voxels.buffer, msg.pz.lights.buffer] : []),
      ...(msg.nz ? [msg.nz.voxels.buffer, msg.nz.lights.buffer] : []),
      ...(msg.pp ? [msg.pp.voxels.buffer, msg.pp.lights.buffer] : []),
      ...(msg.pn ? [msg.pn.voxels.buffer, msg.pn.lights.buffer] : []),
      ...(msg.np ? [msg.np.voxels.buffer, msg.np.lights.buffer] : []),
      ...(msg.nn ? [msg.nn.voxels.buffer, msg.nn.lights.buffer] : []),
    ]);
  }

  onGenResult(m) {
    this.genInflight--;
    const k = key(m.cx, m.cz);
    this.pendingGen.delete(k);
    let ch = this.chunks.get(k);
    if (!ch) {
      ch = {
        cx: m.cx, cz: m.cz,
        voxels: null, lights: null, surfaceY: null,
        hasVoxels: false, lit: false, meshed: false, dirty: false,
        relightPasses: 0,
        meshesOpaque: null, meshesCutout: null,
      };
      this.chunks.set(k, ch);
    }
    const diffs = this.diffs.get(k);
    if (diffs) {
      for (const [i, id] of diffs) m.voxels[i] = id;
    }
    ch.voxels = m.voxels;
    ch.surfaceY = m.surfaceY;
    ch.hasVoxels = true;
    this.lightQueue.push({ k, d: m.cx * m.cx + m.cz * m.cz });
    this.emit('chunk-generated', { cx: m.cx, cz: m.cz });
  }

  onMeshResult(m) {
    this.meshInflight--;
    const k = key(m.cx, m.cz);
    this.pendingMesh.delete(k);
    const ch = this.chunks.get(k);
    if (!ch) return;
    ch.meshed = true;
    this.emit('mesh-ready', { cx: m.cx, cz: m.cz, data: m.result });
  }

  flagRemesh(cx, cz) {
    const ch = this.chunks.get(key(cx, cz));
    if (ch && ch.meshed && !this.pendingMesh.has(key(cx, cz))) {
      this.meshQueue.push({ k: key(cx, cz), d: 0 });
    }
  }

  queueUrgentRemesh(cx, cz) {
    const k = key(cx, cz);
    const ch = this.chunks.get(k);
    if (ch && ch.lit && !this.pendingMesh.has(k)) {
      this.urgentMesh.push(k);
    } else {
      this.flagRemesh(cx, cz);
    }
  }

  enqueueInitialMeshChecks() {
    for (const ch of this.chunks.values()) {
      if (ch.lit && !ch.meshed && !this.pendingMesh.has(key(ch.cx, ch.cz))) {
        this.meshQueue.push({ k: key(ch.cx, ch.cz), d: ch.cx * ch.cx + ch.cz * ch.cz });
      }
    }
  }

  unloadFar(pcx, pcz) {
    const R = UNLOAD_DISTANCE_CHUNKS;
    for (const [k, ch] of this.chunks) {
      const dx = ch.cx - pcx;
      const dz = ch.cz - pcz;
      if (dx * dx + dz * dz > R * R) {
        this.disposeChunkMeshes(ch);
        this.chunks.delete(k);
        this.emit('chunk-unload', { cx: ch.cx, cz: ch.cz });
      }
    }
  }

  disposeChunkMeshes(ch) {
    if (this.disposeHook) this.disposeHook(ch);
  }

  areaReady(px, pz, r = 2) {
    const pcx = Math.floor(px / CS);
    const pcz = Math.floor(pz / CS);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const ch = this.chunks.get(key(pcx + dx, pcz + dz));
        if (!ch || !ch.lit || !ch.meshed) return false;
      }
    }
    return true;
  }
}
