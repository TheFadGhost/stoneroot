import * as THREE from '../../vendor/three.module.js';
import { TILE } from '../config.js';
import { ATLAS_META } from './atlas.js';
import { makeRng } from '../world/noise.js';

export const TILE_AVG = new Map();

const FALLBACK_AVG = { r: 0.5, g: 0.5, b: 0.5 };

export function blockAvgColor(canvas, tileName) {
  if (TILE_AVG.has(tileName)) return TILE_AVG.get(tileName);
  let avg = FALLBACK_AVG;
  if (canvas && typeof canvas.getContext === 'function') {
    const S = ATLAS_META.tileSize;
    const R = ATLAS_META.tilesPerRow;
    const idx = TILE[tileName] !== undefined ? TILE[tileName] : 0;
    const cx = (idx % R) * S;
    const cy = Math.floor(idx / R) * S;
    const d = canvas.getContext('2d').getImageData(cx, cy, S, S).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 128) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
    }
    if (n > 0) avg = { r: r / n / 255, g: g / n / 255, b: b / n / 255 };
  }
  TILE_AVG.set(tileName, avg);
  return avg;
}

const MAX_PARTICLES = 600;

const rng = makeRng(0x5eed7a11);

const _m4 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export class ParticleSystem {
  constructor(scene, atlas) {
    this.atlas = atlas || null;
    this.max = MAX_PARTICLES;
    this.n = 0;
    this.gravity = 22;
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mat.toneMapped = false;
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _c.setRGB(1, 1, 1);
    for (let i = 0; i < MAX_PARTICLES; i++) this.mesh.setColorAt(i, _c);
    this.px = new Float32Array(MAX_PARTICLES);
    this.py = new Float32Array(MAX_PARTICLES);
    this.pz = new Float32Array(MAX_PARTICLES);
    this.vx = new Float32Array(MAX_PARTICLES);
    this.vy = new Float32Array(MAX_PARTICLES);
    this.vz = new Float32Array(MAX_PARTICLES);
    this.life = new Float32Array(MAX_PARTICLES);
    this.ttl = new Float32Array(MAX_PARTICLES);
    this.size = new Float32Array(MAX_PARTICLES);
    this.cr = new Float32Array(MAX_PARTICLES);
    this.cg = new Float32Array(MAX_PARTICLES);
    this.cb = new Float32Array(MAX_PARTICLES);
    if (scene) scene.add(this.mesh);
  }

  spawnBurst(x, y, z, color, count = 14, spread = 0.35, speed = 3.2) {
    if (typeof color === 'object' && color !== null && !color.isColor) _c.setRGB(color.r, color.g, color.b);
    else _c.set(color);
    for (let k = 0; k < count; k++) {
      if (this.n >= this.max) return;
      const i = this.n++;
      this.px[i] = x + (rng() - 0.5) * spread;
      this.py[i] = y + (rng() - 0.5) * spread * 0.6;
      this.pz[i] = z + (rng() - 0.5) * spread;
      this.vx[i] = (rng() - 0.5) * 2 * speed;
      this.vy[i] = rng() * speed * 0.9 + 1.2;
      this.vz[i] = (rng() - 0.5) * 2 * speed;
      this.life[i] = 0;
      this.ttl[i] = 0.7 * (0.75 + rng() * 0.5);
      this.size[i] = 0.7 + rng() * 0.6;
      const j = 0.8 + rng() * 0.4;
      this.cr[i] = Math.min(1, _c.r * j);
      this.cg[i] = Math.min(1, _c.g * j);
      this.cb[i] = Math.min(1, _c.b * j);
    }
  }

  update(dt) {
    const g = this.gravity;
    let n = this.n;
    for (let i = 0; i < n; ) {
      this.life[i] += dt;
      if (this.life[i] >= this.ttl[i]) {
        const l = --n;
        this.px[i] = this.px[l];
        this.py[i] = this.py[l];
        this.pz[i] = this.pz[l];
        this.vx[i] = this.vx[l];
        this.vy[i] = this.vy[l];
        this.vz[i] = this.vz[l];
        this.life[i] = this.life[l];
        this.ttl[i] = this.ttl[l];
        this.size[i] = this.size[l];
        this.cr[i] = this.cr[l];
        this.cg[i] = this.cg[l];
        this.cb[i] = this.cb[l];
        continue;
      }
      this.vy[i] -= g * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      i++;
    }
    this.n = n;
    for (let i = 0; i < n; i++) {
      const t = this.life[i] / this.ttl[i];
      let sc = this.size[i] * 0.09 * 2.2;
      if (t > 0.55) {
        const k = (t - 0.55) / 0.45;
        sc *= 1 - k * k;
      }
      const spinA = ((i % 7) + 2) * 1.3;
      const spinB = ((i % 5) + 1) * 1.7;
      _e.set(this.life[i] * spinA, this.life[i] * spinB, 0);
      _q.setFromEuler(_e);
      _v.set(this.px[i], this.py[i], this.pz[i]);
      _s.set(sc, sc, sc);
      _m4.compose(_v, _q, _s);
      this.mesh.setMatrixAt(i, _m4);
      _c.setRGB(this.cr[i], this.cg[i], this.cb[i]);
      this.mesh.setColorAt(i, _c);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
