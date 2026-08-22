import { CHUNK_SIZE, WORLD_HEIGHT, TILE } from '../config.js';
import { BLOCK_DEFS, RENDERTYPE } from '../blocks.js';
import { hash3 } from './noise.js';

const CS = CHUNK_SIZE;
const WH = WORLD_HEIGHT;
const SENTINEL = 3;
const MAGMA = 13;
const LOWER = 0.12;

const AOLVL = [1.0, 0.82, 0.66, 0.5];

const GLOW_COLORS = {
  11: [1.0, 0.55, 0.18],
  12: [0.25, 0.9, 0.8],
  13: [1.0, 0.32, 0.08],
  17: [0.62, 0.35, 1.0],
  24: [1.0, 0.78, 0.45],
  28: [0.15, 0.375, 0.35],
};

const OPQ = new Uint8Array(64);
const RTY = new Uint8Array(64);
const CUT = new Uint8Array(64);
const FTILES = new Uint16Array(64 * 6);
const GLW = new Float32Array(64 * 3);

for (let i = 0; i < BLOCK_DEFS.length; i++) {
  const d = BLOCK_DEFS[i];
  const id = d.id;
  OPQ[id] = d.opaque ? 1 : 0;
  RTY[id] = d.renderType;
  CUT[id] = d.cutout ? 1 : 0;
  const tl = d.tiles || {};
  const side = TILE[tl.side ?? tl.all];
  const top = TILE[tl.top ?? tl.all];
  const bottom = TILE[tl.bottom ?? tl.all];
  FTILES[id * 6 + 0] = side;
  FTILES[id * 6 + 1] = side;
  FTILES[id * 6 + 2] = top;
  FTILES[id * 6 + 3] = bottom;
  FTILES[id * 6 + 4] = side;
  FTILES[id * 6 + 5] = side;
  const gc = GLOW_COLORS[id];
  const e = d.emissive || 0;
  if (gc && e > 0) {
    const s = e / 15;
    GLW[id * 3] = gc[0] * s;
    GLW[id * 3 + 1] = gc[1] * s;
    GLW[id * 3 + 2] = gc[2] * s;
  }
}

const DIMS = [CS, WH, CS];
const DIRS = [
  { axis: 0, uA: 1, vA: 2, n: [1, 0, 0] },
  { axis: 0, uA: 2, vA: 1, n: [-1, 0, 0] },
  { axis: 1, uA: 2, vA: 0, n: [0, 1, 0] },
  { axis: 1, uA: 0, vA: 2, n: [0, -1, 0] },
  { axis: 2, uA: 0, vA: 1, n: [0, 0, 1] },
  { axis: 2, uA: 1, vA: 0, n: [0, 0, -1] },
];
const EU = [
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 1],
  [1, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];
const EV = [
  [0, 0, 1],
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
  [1, 0, 0],
];
const NRM = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const MASK_MAX = 192 * 16;
const maskTile = new Uint16Array(MASK_MAX);
const maskActive = new Uint8Array(MASK_MAX);
const maskAo = new Float32Array(MASK_MAX * 4);
const maskSky = new Float32Array(MASK_MAX * 4);
const maskBlk = new Float32Array(MASK_MAX * 4);
const maskGlow = new Float32Array(MASK_MAX * 3);

let VCAP = 1 << 14;
let ICAP = 1 << 13;
let posBuf = new Float32Array(VCAP * 3);
let nrmBuf = new Float32Array(VCAP * 3);
let uvBuf = new Float32Array(VCAP * 2);
let tilBuf = new Uint16Array(VCAP);
let aoBuf = new Float32Array(VCAP);
let skyBuf = new Float32Array(VCAP);
let blkBuf = new Float32Array(VCAP);
let gloBuf = new Float32Array(VCAP * 3);
let idxBuf = new Uint32Array(ICAP);

let vc = 0;
let ic = 0;

function growVerts() {
  VCAP *= 2;
  let n = new Float32Array(VCAP * 3);
  n.set(posBuf);
  posBuf = n;
  n = new Float32Array(VCAP * 3);
  n.set(nrmBuf);
  nrmBuf = n;
  n = new Float32Array(VCAP * 2);
  n.set(uvBuf);
  uvBuf = n;
  let t = new Uint16Array(VCAP);
  t.set(tilBuf);
  tilBuf = t;
  n = new Float32Array(VCAP);
  n.set(aoBuf);
  aoBuf = n;
  n = new Float32Array(VCAP);
  n.set(skyBuf);
  skyBuf = n;
  n = new Float32Array(VCAP);
  n.set(blkBuf);
  blkBuf = n;
  n = new Float32Array(VCAP * 3);
  n.set(gloBuf);
  gloBuf = n;
}

function growIdx() {
  ICAP *= 2;
  const n = new Uint32Array(ICAP);
  n.set(idxBuf);
  idxBuf = n;
}

const QP = new Float32Array(12);
const QU = new Float32Array(8);
const QA = new Float32Array(4);
const QS = new Float32Array(4);
const QB = new Float32Array(4);

function writeQuad(nx, ny, nz, tile, gr, gg, gb, flip) {
  while ((vc + 4) * 3 > posBuf.length) growVerts();
  while (ic + 6 > idxBuf.length) growIdx();
  let p = vc * 3;
  for (let k = 0; k < 4; k++) {
    posBuf[p] = QP[k * 3];
    posBuf[p + 1] = QP[k * 3 + 1];
    posBuf[p + 2] = QP[k * 3 + 2];
    nrmBuf[p] = nx;
    nrmBuf[p + 1] = ny;
    nrmBuf[p + 2] = nz;
    const v = vc + k;
    uvBuf[v * 2] = QU[k * 2];
    uvBuf[v * 2 + 1] = QU[k * 2 + 1];
    tilBuf[v] = tile;
    aoBuf[v] = QA[k];
    skyBuf[v] = QS[k];
    blkBuf[v] = QB[k];
    gloBuf[v * 3] = gr;
    gloBuf[v * 3 + 1] = gg;
    gloBuf[v * 3 + 2] = gb;
    p += 3;
  }
  const b = vc;
  if (!flip) {
    idxBuf[ic++] = b;
    idxBuf[ic++] = b + 1;
    idxBuf[ic++] = b + 2;
    idxBuf[ic++] = b;
    idxBuf[ic++] = b + 2;
    idxBuf[ic++] = b + 3;
  } else {
    idxBuf[ic++] = b + 1;
    idxBuf[ic++] = b + 2;
    idxBuf[ic++] = b + 3;
    idxBuf[ic++] = b + 1;
    idxBuf[ic++] = b + 3;
    idxBuf[ic++] = b;
  }
  vc += 4;
}

export function meshChunk(chunk) {
  const voxels = chunk.voxels;
  const lights = chunk.lights;
  const nb = chunk.neighbors || {};
  const npx = nb.px || null;
  const nnx = nb.nx || null;
  const npz = nb.pz || null;
  const nnz = nb.nz || null;
  const cr = nb.corners || {};
  const cpp = cr.pp || null;
  const cpn = cr.pn || null;
  const cnp = cr.np || null;
  const cnn = cr.nn || null;

  vc = 0;
  ic = 0;

  function vid(x, y, z) {
    if (y < 0) return SENTINEL;
    if (y >= WH) return 0;
    if (x >= 0 && x < CS && z >= 0 && z < CS) return voxels[x | (z << 4) | (y << 8)];
    const ox = x < 0 ? -1 : x >= CS ? 1 : 0;
    const oz = z < 0 ? -1 : z >= CS ? 1 : 0;
    let buf = null;
    if (ox !== 0 && oz !== 0) {
      buf = ox > 0 ? (oz > 0 ? cpp : cpn) : oz > 0 ? cnp : cnn;
    } else {
      buf = ox > 0 ? npx : ox < 0 ? nnx : oz > 0 ? npz : nnz;
    }
    if (buf) return buf.voxels[(x - (ox << 4)) | ((z - (oz << 4)) << 4) | (y << 8)];
    return SENTINEL;
  }

  function lit(x, y, z) {
    if (y < 0) y = 0;
    else if (y >= WH) y = WH - 1;
    if (x >= 0 && x < CS && z >= 0 && z < CS) return lights[x | (z << 4) | (y << 8)];
    const ox = x < 0 ? -1 : x >= CS ? 1 : 0;
    const oz = z < 0 ? -1 : z >= CS ? 1 : 0;
    let buf = null;
    let lx = x;
    let lz = z;
    if (ox !== 0 && oz !== 0) {
      buf = ox > 0 ? (oz > 0 ? cpp : cpn) : oz > 0 ? cnp : cnn;
    } else if (ox !== 0 || oz !== 0) {
      buf = ox > 0 ? npx : ox < 0 ? nnx : oz > 0 ? npz : nnz;
    }
    if (buf) {
      lx = x - (ox << 4);
      lz = z - (oz << 4);
    } else {
      lx = x < 0 ? 0 : x >= CS ? CS - 1 : x;
      lz = z < 0 ? 0 : z >= CS ? CS - 1 : z;
    }
    return lights[lx | (lz << 4) | (y << 8)];
  }

  function faceAttrs(d, ax, ay, az, mo) {
    const eu = EU[d];
    const ev = EV[d];
    const cop = OPQ[vid(ax, ay, az)];
    const cl = cop ? -1 : lit(ax, ay, az);
    const m4 = mo << 2;
    for (let k = 0; k < 4; k++) {
      const ou = (k === 1 || k === 2) ? 1 : -1;
      const ov = k >= 2 ? 1 : -1;
      const x1 = ax + eu[0] * ou;
      const y1 = ay + eu[1] * ou;
      const z1 = az + eu[2] * ou;
      const x2 = ax + ev[0] * ov;
      const y2 = ay + ev[1] * ov;
      const z2 = az + ev[2] * ov;
      const x3 = x1 + ev[0] * ov;
      const y3 = y1 + ev[1] * ov;
      const z3 = z1 + ev[2] * ov;
      const i1 = vid(x1, y1, z1);
      const i2 = vid(x2, y2, z2);
      const i3 = vid(x3, y3, z3);
      const o1 = OPQ[i1];
      const o2 = OPQ[i2];
      const o3 = OPQ[i3];
      maskAo[m4 + k] = AOLVL[o1 !== 0 && o2 !== 0 ? 3 : o1 + o2 + o3];
      let ss = 0;
      let sb = 0;
      let cnt = 0;
      if (cl >= 0) {
        ss += cl & 15;
        sb += cl >> 4;
        cnt++;
      }
      let l;
      if (o1 === 0) {
        l = lit(x1, y1, z1);
        ss += l & 15;
        sb += l >> 4;
        cnt++;
      }
      if (o2 === 0) {
        l = lit(x2, y2, z2);
        ss += l & 15;
        sb += l >> 4;
        cnt++;
      }
      if (o3 === 0) {
        l = lit(x3, y3, z3);
        ss += l & 15;
        sb += l >> 4;
        cnt++;
      }
      if (cnt > 0) {
        let avs = ss / cnt;
        let avb = sb / cnt;
        if (cl >= 0) {
          const os = cl & 15;
          const ob = cl >> 4;
          if (avs < os) avs = os;
          if (avb < ob) avb = ob;
        }
        maskSky[m4 + k] = avs / 15;
        maskBlk[m4 + k] = avb / 15;
      } else {
        maskSky[m4 + k] = 0;
        maskBlk[m4 + k] = 0;
      }
    }
  }

  function sameAttrs(a, b) {
    const a4 = a << 2;
    const b4 = b << 2;
    for (let k = 0; k < 4; k++) {
      if (maskAo[a4 + k] !== maskAo[b4 + k]) return false;
      if (maskSky[a4 + k] !== maskSky[b4 + k]) return false;
      if (maskBlk[a4 + k] !== maskBlk[b4 + k]) return false;
    }
    const a3 = a * 3;
    const b3 = b * 3;
    return (
      maskGlow[a3] === maskGlow[b3] &&
      maskGlow[a3 + 1] === maskGlow[b3 + 1] &&
      maskGlow[a3 + 2] === maskGlow[b3 + 2]
    );
  }

  function emitRect(d, L, i, j, w, h, m) {
    switch (d) {
      case 0:
        QP[0] = L + 1;
        QP[1] = i;
        QP[2] = j;
        QP[3] = L + 1;
        QP[4] = i + w;
        QP[5] = j;
        QP[6] = L + 1;
        QP[7] = i + w;
        QP[8] = j + h;
        QP[9] = L + 1;
        QP[10] = i;
        QP[11] = j + h;
        QU[0] = j;
        QU[1] = i;
        QU[2] = j;
        QU[3] = i + w;
        QU[4] = j + h;
        QU[5] = i + w;
        QU[6] = j + h;
        QU[7] = i;
        break;
      case 1:
        QP[0] = L;
        QP[1] = j;
        QP[2] = i;
        QP[3] = L;
        QP[4] = j;
        QP[5] = i + w;
        QP[6] = L;
        QP[7] = j + h;
        QP[8] = i + w;
        QP[9] = L;
        QP[10] = j + h;
        QP[11] = i;
        QU[0] = 16 - i;
        QU[1] = j;
        QU[2] = 16 - i - w;
        QU[3] = j;
        QU[4] = 16 - i - w;
        QU[5] = j + h;
        QU[6] = 16 - i;
        QU[7] = j + h;
        break;
      case 2: {
        const Y = L + 1;
        QP[0] = j;
        QP[1] = Y;
        QP[2] = i;
        QP[3] = j;
        QP[4] = Y;
        QP[5] = i + w;
        QP[6] = j + h;
        QP[7] = Y;
        QP[8] = i + w;
        QP[9] = j + h;
        QP[10] = Y;
        QP[11] = i;
        QU[0] = j;
        QU[1] = i;
        QU[2] = j;
        QU[3] = i + w;
        QU[4] = j + h;
        QU[5] = i + w;
        QU[6] = j + h;
        QU[7] = i;
        break;
      }
      case 3:
        QP[0] = i;
        QP[1] = L;
        QP[2] = j;
        QP[3] = i + w;
        QP[4] = L;
        QP[5] = j;
        QP[6] = i + w;
        QP[7] = L;
        QP[8] = j + h;
        QP[9] = i;
        QP[10] = L;
        QP[11] = j + h;
        QU[0] = i;
        QU[1] = j;
        QU[2] = i + w;
        QU[3] = j;
        QU[4] = i + w;
        QU[5] = j + h;
        QU[6] = i;
        QU[7] = j + h;
        break;
      case 4:
        QP[0] = i;
        QP[1] = j;
        QP[2] = L + 1;
        QP[3] = i + w;
        QP[4] = j;
        QP[5] = L + 1;
        QP[6] = i + w;
        QP[7] = j + h;
        QP[8] = L + 1;
        QP[9] = i;
        QP[10] = j + h;
        QP[11] = L + 1;
        QU[0] = i;
        QU[1] = j;
        QU[2] = i + w;
        QU[3] = j;
        QU[4] = i + w;
        QU[5] = j + h;
        QU[6] = i;
        QU[7] = j + h;
        break;
      default:
        QP[0] = j;
        QP[1] = i;
        QP[2] = L;
        QP[3] = j;
        QP[4] = i + w;
        QP[5] = L;
        QP[6] = j + h;
        QP[7] = i + w;
        QP[8] = L;
        QP[9] = j + h;
        QP[10] = i;
        QP[11] = L;
        QU[0] = 16 - j;
        QU[1] = i;
        QU[2] = 16 - j;
        QU[3] = i + w;
        QU[4] = 16 - j - h;
        QU[5] = i + w;
        QU[6] = 16 - j - h;
        QU[7] = i;
        break;
    }
    const m4 = m << 2;
    QA[0] = maskAo[m4];
    QA[1] = maskAo[m4 + 1];
    QA[2] = maskAo[m4 + 2];
    QA[3] = maskAo[m4 + 3];
    QS[0] = maskSky[m4];
    QS[1] = maskSky[m4 + 1];
    QS[2] = maskSky[m4 + 2];
    QS[3] = maskSky[m4 + 3];
    QB[0] = maskBlk[m4];
    QB[1] = maskBlk[m4 + 1];
    QB[2] = maskBlk[m4 + 2];
    QB[3] = maskBlk[m4 + 3];
    const m3 = m * 3;
    const flip = QA[0] + QA[2] < QA[1] + QA[3];
    writeQuad(NRM[d][0], NRM[d][1], NRM[d][2], maskTile[m], maskGlow[m3], maskGlow[m3 + 1], maskGlow[m3 + 2], flip);
  }

  const wp = [0, 0, 0];

  for (let d = 0; d < 6; d++) {
    const D = DIRS[d];
    const dimU = DIMS[D.uA];
    const dimV = DIMS[D.vA];
    const dimS = DIMS[D.axis];
    for (let s = 0; s < dimS; s++) {
      let m = 0;
      for (let j = 0; j < dimV; j++) {
        for (let i = 0; i < dimU; i++, m++) {
          maskActive[m] = 0;
          wp[D.axis] = s;
          wp[D.uA] = i;
          wp[D.vA] = j;
          const id = voxels[wp[0] | (wp[2] << 4) | (wp[1] << 8)];
          if (id === 0) continue;
          if (RTY[id] !== RENDERTYPE.CUBE) continue;
          const ax = wp[0] + D.n[0];
          const ay = wp[1] + D.n[1];
          const az = wp[2] + D.n[2];
          const nid = vid(ax, ay, az);
          if (!(OPQ[nid] === 0 && !(CUT[id] === 1 && nid === id))) continue;
          maskTile[m] = FTILES[id * 6 + d];
          const g3 = id * 3;
          maskGlow[m * 3] = GLW[g3];
          maskGlow[m * 3 + 1] = GLW[g3 + 1];
          maskGlow[m * 3 + 2] = GLW[g3 + 2];
          faceAttrs(d, ax, ay, az, m);
          maskActive[m] = 1;
        }
      }
      for (let j = 0; j < dimV; j++) {
        for (let i = 0; i < dimU; ) {
          const m = j * dimU + i;
          if (!maskActive[m]) {
            i++;
            continue;
          }
          const t = maskTile[m];
          let w = 1;
          while (i + w < dimU && maskActive[m + w] === 1 && maskTile[m + w] === t && sameAttrs(m, m + w)) w++;
          let h = 1;
          outer: while (j + h < dimV) {
            const rb = (j + h) * dimU + i;
            for (let q = 0; q < w; q++) {
              if (!maskActive[rb + q] || maskTile[rb + q] !== t || !sameAttrs(m, rb + q)) break outer;
            }
            h++;
          }
          emitRect(d, s, i, j, w, h, m);
          for (let dy = 0; dy < h; dy++) {
            const rb = (j + dy) * dimU + i;
            for (let q = 0; q < w; q++) maskActive[rb + q] = 0;
          }
          i += w;
        }
      }
    }
  }

  function putCrossQuad(ax, az, bx, bz, yb, yt, tl, gr, gg, gb) {
    QP[0] = ax;
    QP[1] = yb;
    QP[2] = az;
    QP[3] = bx;
    QP[4] = yb;
    QP[5] = bz;
    QP[6] = bx;
    QP[7] = yt;
    QP[8] = bz;
    QP[9] = ax;
    QP[10] = yt;
    QP[11] = az;
    QU[0] = 0;
    QU[1] = 0;
    QU[2] = 1;
    QU[3] = 0;
    QU[4] = 1;
    QU[5] = 1;
    QU[6] = 0;
    QU[7] = 1;
    QA[0] = 1;
    QA[1] = 1;
    QA[2] = 1;
    QA[3] = 1;
    writeQuad(0, 1, 0, tl, gr, gg, gb, false);
    let t;
    t = QP[0]; QP[0] = QP[9]; QP[9] = t;
    t = QP[1]; QP[1] = QP[10]; QP[10] = t;
    t = QP[2]; QP[2] = QP[11]; QP[11] = t;
    t = QP[3]; QP[3] = QP[6]; QP[6] = t;
    t = QP[4]; QP[4] = QP[7]; QP[7] = t;
    t = QP[5]; QP[5] = QP[8]; QP[8] = t;
    t = QU[0]; QU[0] = QU[6]; QU[6] = t;
    t = QU[1]; QU[1] = QU[7]; QU[7] = t;
    t = QU[2]; QU[2] = QU[4]; QU[4] = t;
    t = QU[3]; QU[3] = QU[5]; QU[5] = t;
    writeQuad(0, 1, 0, tl, gr, gg, gb, false);
  }

  function emitCross(id, x, y, z) {
    const li = x | (z << 4) | (y << 8);
    const tl = FTILES[id * 6 + 2];
    const g3 = id * 3;
    const lv = lights[li];
    QS[0] = (lv & 15) / 15;
    QS[1] = (lv & 15) / 15;
    QS[2] = (lv & 15) / 15;
    QS[3] = (lv & 15) / 15;
    QB[0] = (lv >> 4) / 15;
    QB[1] = (lv >> 4) / 15;
    QB[2] = (lv >> 4) / 15;
    QB[3] = (lv >> 4) / 15;
    const jx = (hash3(1717, x, z, y) - 0.5) * 0.25;
    const jz = (hash3(4049, x, z, y) - 0.5) * 0.25;
    const x0 = x + 0.15 + jx;
    const x1 = x + 0.85 + jx;
    const z0 = z + 0.15 + jz;
    const z1 = z + 0.85 + jz;
    putCrossQuad(x0, z0, x1, z1, y, y + 1, tl, GLW[g3], GLW[g3 + 1], GLW[g3 + 2]);
    putCrossQuad(x0, z1, x1, z0, y, y + 1, tl, GLW[g3], GLW[g3 + 1], GLW[g3 + 2]);
  }

  function liquidFace(d, ax, ay, az) {
    faceAttrs(d, ax, ay, az, 0);
    QS[0] = maskSky[0];
    QS[1] = maskSky[1];
    QS[2] = maskSky[2];
    QS[3] = maskSky[3];
    QB[0] = maskBlk[0];
    QB[1] = maskBlk[1];
    QB[2] = maskBlk[2];
    QB[3] = maskBlk[3];
    QA[0] = 1;
    QA[1] = 1;
    QA[2] = 1;
    QA[3] = 1;
  }

  function emitLiquid(x, y, z) {
    const tl = FTILES[MAGMA * 6 + 2];
    const g3 = MAGMA * 3;
    const gr = GLW[g3];
    const gg = GLW[g3 + 1];
    const gb = GLW[g3 + 2];
    const open = vid(x, y + 1, z) !== MAGMA;
    const h = open ? 1 - LOWER : 1;
    if (open) {
      liquidFace(2, x, y + 1, z);
      QP[0] = x;
      QP[1] = y + h;
      QP[2] = z;
      QP[3] = x;
      QP[4] = y + h;
      QP[5] = z + 1;
      QP[6] = x + 1;
      QP[7] = y + h;
      QP[8] = z + 1;
      QP[9] = x + 1;
      QP[10] = y + h;
      QP[11] = z;
      QU[0] = x;
      QU[1] = z;
      QU[2] = x;
      QU[3] = z + 1;
      QU[4] = x + 1;
      QU[5] = z + 1;
      QU[6] = x + 1;
      QU[7] = z;
      writeQuad(0, 1, 0, tl, gr, gg, gb, false);
    }
    if (vid(x - 1, y, z) !== MAGMA && OPQ[vid(x - 1, y, z)] === 0) {
      liquidFace(1, x - 1, y, z);
      QP[0] = x;
      QP[1] = y;
      QP[2] = z;
      QP[3] = x;
      QP[4] = y;
      QP[5] = z + 1;
      QP[6] = x;
      QP[7] = y + h;
      QP[8] = z + 1;
      QP[9] = x;
      QP[10] = y + h;
      QP[11] = z;
      QU[0] = 16 - z;
      QU[1] = y;
      QU[2] = 16 - z - 1;
      QU[3] = y;
      QU[4] = 16 - z - 1;
      QU[5] = y + h;
      QU[6] = 16 - z;
      QU[7] = y + h;
      writeQuad(-1, 0, 0, tl, gr, gg, gb, false);
    }
    if (vid(x + 1, y, z) !== MAGMA && OPQ[vid(x + 1, y, z)] === 0) {
      liquidFace(0, x + 1, y, z);
      QP[0] = x + 1;
      QP[1] = y;
      QP[2] = z;
      QP[3] = x + 1;
      QP[4] = y + h;
      QP[5] = z;
      QP[6] = x + 1;
      QP[7] = y + h;
      QP[8] = z + 1;
      QP[9] = x + 1;
      QP[10] = y;
      QP[11] = z + 1;
      QU[0] = z;
      QU[1] = y;
      QU[2] = z;
      QU[3] = y + h;
      QU[4] = z + 1;
      QU[5] = y + h;
      QU[6] = z + 1;
      QU[7] = y;
      writeQuad(1, 0, 0, tl, gr, gg, gb, false);
    }
    if (vid(x, y, z - 1) !== MAGMA && OPQ[vid(x, y, z - 1)] === 0) {
      liquidFace(5, x, y, z - 1);
      QP[0] = x;
      QP[1] = y;
      QP[2] = z;
      QP[3] = x;
      QP[4] = y + h;
      QP[5] = z;
      QP[6] = x + 1;
      QP[7] = y + h;
      QP[8] = z;
      QP[9] = x + 1;
      QP[10] = y;
      QP[11] = z;
      QU[0] = 16 - x;
      QU[1] = y;
      QU[2] = 16 - x;
      QU[3] = y + h;
      QU[4] = 15 - x;
      QU[5] = y + h;
      QU[6] = 15 - x;
      QU[7] = y;
      writeQuad(0, 0, -1, tl, gr, gg, gb, false);
    }
    if (vid(x, y, z + 1) !== MAGMA && OPQ[vid(x, y, z + 1)] === 0) {
      liquidFace(4, x, y, z + 1);
      QP[0] = x;
      QP[1] = y;
      QP[2] = z + 1;
      QP[3] = x + 1;
      QP[4] = y;
      QP[5] = z + 1;
      QP[6] = x + 1;
      QP[7] = y + h;
      QP[8] = z + 1;
      QP[9] = x;
      QP[10] = y + h;
      QP[11] = z + 1;
      QU[0] = x;
      QU[1] = y;
      QU[2] = x + 1;
      QU[3] = y;
      QU[4] = x + 1;
      QU[5] = y + h;
      QU[6] = x;
      QU[7] = y + h;
      writeQuad(0, 0, 1, tl, gr, gg, gb, false);
    }
    if (y > 0 && vid(x, y - 1, z) !== MAGMA && OPQ[vid(x, y - 1, z)] === 0) {
      liquidFace(3, x, y - 1, z);
      QP[0] = x;
      QP[1] = y;
      QP[2] = z;
      QP[3] = x + 1;
      QP[4] = y;
      QP[5] = z;
      QP[6] = x + 1;
      QP[7] = y;
      QP[8] = z + 1;
      QP[9] = x;
      QP[10] = y;
      QP[11] = z + 1;
      QU[0] = x;
      QU[1] = z;
      QU[2] = x + 1;
      QU[3] = z;
      QU[4] = x + 1;
      QU[5] = z + 1;
      QU[6] = x;
      QU[7] = z + 1;
      writeQuad(0, -1, 0, tl, gr, gg, gb, false);
    }
  }

  for (let y = 0; y < WH; y++) {
    const yo = y << 8;
    for (let z = 0; z < CS; z++) {
      const zo = yo | (z << 4);
      for (let x = 0; x < CS; x++) {
        const id = voxels[zo | x];
        if (id === 0) continue;
        const rt = RTY[id];
        if (rt === RENDERTYPE.CROSS) emitCross(id, x, y, z);
        else if (rt === RENDERTYPE.LIQUID) emitLiquid(x, y, z);
      }
    }
  }

  return {
    positions: posBuf.slice(0, vc * 3),
    normals: nrmBuf.slice(0, vc * 3),
    uvs: uvBuf.slice(0, vc * 2),
    tiles: tilBuf.slice(0, vc),
    ao: aoBuf.slice(0, vc),
    sky: skyBuf.slice(0, vc),
    blk: blkBuf.slice(0, vc),
    glow: gloBuf.slice(0, vc * 3),
    indices: idxBuf.slice(0, ic),
  };
}
