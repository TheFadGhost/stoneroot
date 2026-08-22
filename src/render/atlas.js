import * as THREE from '../../vendor/three.module.js';
import { TILES, TILE, ATLAS_TILES_PER_ROW, ATLAS_TILE_PX } from '../config.js';
import { hash2, makeRng } from '../world/noise.js';

export const ATLAS_META = { tileSize: ATLAS_TILE_PX, tilesPerRow: ATLAS_TILES_PER_ROW, padding: 0 };

export const PALETTE = {
  bone: '#d8d3c8',
  ash: '#6b6570',
  ashDeep: '#494450',
  bruise: '#4a3855',
  bruiseDeep: '#33283f',
  loam: '#4c3a2d',
  ember: '#ff7a29',
  emberHot: '#ffb26b',
  spore: '#46e0c8',
};

export function hexToRgb(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function mixColor(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
}

export function shadeColor(c, f) {
  const k = f < -1 ? -1 : f > 1 ? 1 : f;
  const m = (v) => (k >= 0 ? v + (1 - v) * k : v * (1 + k));
  return { r: m(c.r), g: m(c.g), b: m(c.b) };
}

function css(c) {
  const q = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${q(c.r)},${q(c.g)},${q(c.b)})`;
}

function C(h) {
  return hexToRgb(h);
}

function hashName(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function tileIndex(name) {
  const i = TILE[name];
  if (i === undefined) throw new Error(`unknown tile: ${name}`);
  return i;
}

export function tileRect(name) {
  const i = tileIndex(name);
  const R = ATLAS_META.tilesPerRow;
  const s = 1 / R;
  const col = i % R;
  const row = Math.floor(i / R);
  return { u0: col * s, v0: 1 - (row + 1) * s, u1: (col + 1) * s, v1: 1 - row * s };
}

function fillAll(g, S, c) {
  g.fillStyle = css(c);
  g.fillRect(0, 0, S, S);
}

function speckle(g, S, rng, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = css(colors[Math.floor(rng() * colors.length)]);
    const r = rMin + rng() * (rMax - rMin);
    g.fillRect(rng() * S, rng() * S, r, r);
  }
}

function waveBand(g, S, y, h, c, rng) {
  const amp = 1.2 + rng() * 2.8;
  const ph = rng() * 6.283;
  const f = 1.5 + rng() * 2.5;
  g.fillStyle = css(c);
  g.beginPath();
  g.moveTo(0, y);
  for (let x = 0; x <= S; x += 4) g.lineTo(x, y + Math.sin(ph + (x / S) * f * Math.PI) * amp);
  for (let x = S; x >= 0; x -= 4) g.lineTo(x, y + h + Math.sin(ph * 1.7 + (x / S) * f * Math.PI) * amp);
  g.closePath();
  g.fill();
}

function strata(g, S, rng, bands, count) {
  let y = -2;
  for (let b = 0; b < count; b++) {
    const bh = (S / count) * (0.6 + rng() * 0.9);
    waveBand(g, S, y, bh, bands[Math.floor(rng() * bands.length)], rng);
    y += bh;
  }
}

function strand(g, x0, y0, x1, y1, w, c, alpha) {
  g.strokeStyle = css(c);
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.globalAlpha = 1;
}

function curveStrand(g, x0, y0, cx, cy, x1, y1, w, c, alpha) {
  g.strokeStyle = css(c);
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(cx, cy, x1, y1);
  g.stroke();
  g.globalAlpha = 1;
}

function poly(g, pts, c, alpha) {
  g.fillStyle = css(c);
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
}

function disc(g, x, y, r, c, alpha) {
  g.fillStyle = css(c);
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.beginPath();
  g.arc(x, y, r, 0, 6.2832);
  g.fill();
  g.globalAlpha = 1;
}

function clearDisc(g, x, y, r) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(x, y, r, 0, 6.2832);
  g.fill();
  g.restore();
}

function stoneBase(g, S, rng, base, bands, bandCount, flecks, fleckColors) {
  fillAll(g, S, base);
  strata(g, S, rng, bands, bandCount || 5);
  speckle(g, S, rng, 130, [shadeColor(base, -0.25), shadeColor(base, 0.18)], 1, 2.2);
  if (flecks > 0) speckle(g, S, rng, flecks, fleckColors, 1, 2);
}

function edgeVignette(g, S, seed) {
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (d[i + 3] === 0) continue;
      const ex = Math.min(x, S - 1 - x) / (S * 0.5);
      const ey = Math.min(y, S - 1 - y) / (S * 0.5);
      const e = Math.min(ex, ey);
      const k = 1 - Math.pow(Math.min(e * 1.9, 1), 1.7) * 0.24;
      const gr = (hash2(seed, x + 7, y + 13) - 0.5) * 9;
      d[i] = Math.max(0, Math.min(255, d[i] * k + gr));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * k + gr));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * k + gr));
    }
  }
  g.putImageData(img, 0, 0);
}

function grainOnly(g, S, seed) {
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (d[i + 3] === 0) continue;
      const gr = (hash2(seed, x + 31, y + 57) - 0.5) * 8;
      d[i] = Math.max(0, Math.min(255, d[i] + gr));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + gr));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + gr));
    }
  }
  g.putImageData(img, 0, 0);
}

const BONE = C('#d8d3c8');
const ASH = C('#6b6570');
const ASHD = C('#494450');
const BRUISE = C('#4a3855');
const BRUISED = C('#33283f');
const LOAM = C('#4c3a2d');
const EMBER = C('#ff7a29');
const EMBHOT = C('#ffb26b');
const SPORE = C('#46e0c8');

const PALE_BASE = C('#8f8a94');
const PALE_BANDS = [C('#7c7682'), C('#9a949e'), C('#6f6a78')];
const SLATE_BASE = C('#2c2c3a');
const SLATE_BANDS = [C('#232333'), C('#34344a'), C('#1d1d2b')];

function oreHost(g, S, rng) {
  stoneBase(g, S, rng, PALE_BASE, PALE_BANDS, 5, 24, [BONE, ASHD]);
}

function crackPath(g, rng, segs, spread) {
  let x = 4 + rng() * 40;
  let y = 4 + rng() * 40;
  g.beginPath();
  g.moveTo(x, y);
  for (let s = 0; s < segs; s++) {
    const dir = Math.floor(rng() * 4);
    const len = spread * (0.4 + rng() * 0.8);
    x += dir === 0 ? len : dir === 1 ? -len : 0;
    y += dir === 2 ? len : dir === 3 ? -len : 0;
    x = Math.max(1, Math.min(47, x));
    y = Math.max(1, Math.min(47, y));
    g.lineTo(x, y);
  }
  g.stroke();
}

const PAINTERS_A = {
  soil_top(g, S, rng) {
    fillAll(g, S, C('#37291f'));
    speckle(g, S, rng, 60, [C('#2b1f17'), C('#443228')], 1, 3);
    for (let i = 0; i < 55; i++) {
      const x = rng() * S;
      const y = 6 + rng() * (S - 8);
      const l = 3 + rng() * 5;
      const a = (rng() - 0.5) * 1.2;
      strand(g, x, y, x + Math.sin(a) * l, y - Math.cos(a) * l, 1, [C('#a8977a'), C('#7d6b52'), C('#8f7d60')][Math.floor(rng() * 3)], 0.85);
    }
    speckle(g, S, rng, 8, [ASHD], 1, 2);
  },
  soil_side(g, S, rng) {
    fillAll(g, S, LOAM);
    for (let i = 0; i < 40; i++) {
      const x = rng() * S;
      const y = rng() * S;
      strand(g, x, y, x + (rng() - 0.5) * 6, y + (rng() - 0.5) * 3, 1, rng() > 0.5 ? C('#33261c') : C('#57422f'), 0.6);
    }
    for (let i = 0; i < 18; i++) {
      const x = rng() * S;
      const y = rng() * 9;
      strand(g, x, y + 3, x + (rng() - 0.5) * 4, y, 1, C('#a8977a'), 0.8);
    }
    speckle(g, S, rng, 30, [C('#2b1f17')], 1, 2);
  },
  loam(g, S, rng) {
    fillAll(g, S, C('#443327'));
    for (let i = 0; i < 70; i++) {
      const x = rng() * S;
      const y = rng() * S;
      strand(g, x, y, x + (rng() - 0.5) * 9, y + (rng() - 0.5) * 4, 1, rng() > 0.5 ? C('#33261c') : C('#57422f'), 0.7);
    }
    speckle(g, S, rng, 25, [C('#2b2018'), C('#5f4a34')], 1, 2);
  },
  peat(g, S, rng) {
    fillAll(g, S, C('#2e2118'));
    for (let i = 0; i < 80; i++) {
      const y = rng() * S;
      const x = rng() * S;
      strand(g, x, y, x + 6 + rng() * 8, y + (rng() - 0.5) * 2, 1, rng() > 0.5 ? C('#20150e') : C('#4a3620'), 0.75);
    }
    for (let i = 0; i < 6; i++) {
      const x = rng() * S;
      const y = rng() * S;
      curveStrand(g, x, y, x + 6, y + 5, x + 2, y + 11, 1.4, C('#6b5236'), 0.6);
    }
  },
  palestone(g, S, rng) {
    stoneBase(g, S, rng, PALE_BASE, PALE_BANDS, 5, 30, [BONE, C('#b5afba')]);
    for (let i = 0; i < 3; i++) {
      const y = rng() * S;
      strand(g, 0, y, S, y + (rng() - 0.5) * 6, 1, BONE, 0.25);
    }
  },
  slatestone(g, S, rng) {
    stoneBase(g, S, rng, SLATE_BASE, SLATE_BANDS, 6, 0, []);
    for (let i = 0; i < 7; i++) {
      const x = rng() * S;
      const y = rng() * S;
      g.fillStyle = css(BONE);
      g.globalAlpha = 0.35 + rng() * 0.3;
      g.fillRect(x, y, 1 + rng(), 1);
      g.globalAlpha = 1;
    }
  },
  emberrock(g, S, rng) {
    stoneBase(g, S, rng, C('#191218'), [C('#120d12'), C('#221720'), C('#0e0a0e')], 5, 20, [C('#2c2028')]);
    g.lineWidth = 1;
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = css(mixColor(EMBER, C('#000000'), 0.45));
      crackPath(g, rng, 6, 7);
    }
    speckle(g, S, rng, 6, [EMBER], 1, 1.4);
  },
  voidstone(g, S, rng) {
    stoneBase(g, S, rng, C('#0a0710'), [C('#060409'), C('#0f0b16')], 4, 0, []);
    for (let i = 0; i < 9; i++) {
      const x = rng() * S;
      const y = rng() * S;
      disc(g, x, y, 1, C('#8a63ff'), 0.9);
      if (rng() > 0.5) disc(g, x, y, 2.4, C('#8a63ff'), 0.14);
    }
    speckle(g, S, rng, 12, [C('#171122')], 1, 2);
  },
  corestone(g, S, rng) {
    fillAll(g, S, C('#140e18'));
    const cx = S / 2 + (rng() - 0.5) * 8;
    const cy = S / 2 + (rng() - 0.5) * 8;
    g.strokeStyle = css(C('#2a2032'));
    g.lineWidth = 1;
    for (let r = 3; r < 30; r += 3.5) {
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(cx, cy, r, rng() * 6.28, rng() * 6.28 + 4.5);
      g.stroke();
    }
    g.globalAlpha = 1;
    speckle(g, S, rng, 40, [C('#0c0810'), C('#241a2e')], 1, 2);
  },
  mossstone(g, S, rng) {
    stoneBase(g, S, rng, PALE_BASE, PALE_BANDS, 5, 20, [BONE]);
    for (let i = 0; i < 14; i++) {
      const x = rng() * S;
      const y = rng() * S;
      const r = 2 + rng() * 4;
      disc(g, x, y, r, rng() > 0.5 ? C('#8ea697') : C('#6f867c'), 0.75);
      disc(g, x - r * 0.3, y - r * 0.3, r * 0.5, C('#a4b8aa'), 0.5);
    }
  },
  scree(g, S, rng) {
    fillAll(g, S, C('#3a3542'));
    for (let i = 0; i < 26; i++) {
      const x = 4 + rng() * (S - 8);
      const y = 4 + rng() * (S - 8);
      const r = 2 + rng() * 4;
      const a = rng() * 6.28;
      const chip = [];
      for (let k = 0; k < 4; k++) {
        const aa = a + (k / 4) * 6.283 + rng() * 0.5;
        chip.push([x + Math.cos(aa) * r * (0.6 + rng() * 0.6), y + Math.sin(aa) * r * (0.6 + rng() * 0.6)]);
      }
      poly(g, chip, C('#241f2c'), 0.9);
      poly(g, chip.map((p) => [p[0] - 1, p[1] - 1]), [ASH, mixColor(ASH, BONE, 0.4), ASHD][Math.floor(rng() * 3)], 1);
    }
  },
  log_side(g, S, rng) {
    fillAll(g, S, C('#4a3624'));
    for (let x = 0; x < S; x += 3) {
      const c = x % 6 === 0 ? C('#33241a') : C('#57422c');
      g.strokeStyle = css(c);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + rng(), 0);
      for (let y = 0; y <= S; y += 8) g.lineTo(x + Math.sin(y * 0.2 + x) * 1.2 + rng() * 0.6, y);
      g.stroke();
    }
    g.strokeStyle = css(C('#241a12'));
    g.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const x = 6 + rng() * (S - 12);
      const y = 6 + rng() * (S - 12);
      g.beginPath();
      g.ellipse(x, y, 2.5, 4, 0, 0, 6.283);
      g.stroke();
    }
  },
  log_top(g, S, rng) {
    fillAll(g, S, C('#33241a'));
    const cx = S / 2 + (rng() - 0.5) * 6;
    const cy = S / 2 + (rng() - 0.5) * 6;
    for (let r = 20; r > 1; r -= 2.4) {
      g.fillStyle = css(r % 4.8 < 2.4 ? C('#5a422c') : C('#4a3624'));
      g.beginPath();
      g.arc(cx, cy, r, 0, 6.283);
      g.fill();
    }
    disc(g, cx, cy, 1.6, C('#3a2a1c'));
    g.strokeStyle = css(C('#2b1f14'));
    g.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const a = rng() * 6.28;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
      g.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
      g.stroke();
    }
  },
  plank(g, S, rng) {
    fillAll(g, S, C('#6b5236'));
    for (let b = 0; b < 3; b++) {
      const y = b * 16;
      g.fillStyle = css(shadeColor(C('#6b5236'), b % 2 ? 0.06 : -0.04));
      g.fillRect(0, y, S, 16);
      g.fillStyle = css(C('#241a12'));
      g.fillRect(0, y + 14, S, 2);
      g.fillStyle = css(C('#7d6244'));
      g.fillRect(0, y, S, 1);
      for (let i = 0; i < 5; i++) {
        const gy = y + 3 + rng() * 10;
        strand(g, rng() * 10, gy, S - rng() * 10, gy + (rng() - 0.5) * 2, 1, C('#57422f'), 0.5);
      }
      const nx = (b % 2) * S;
      poly(g, [[nx, y + 2], [nx + (b % 2 ? -5 : 5), y + 8], [nx, y + 14]], C('#241a12'), 0.85);
    }
  },
  leaf(g, S, rng) {
    const cols = [C('#4d5747'), C('#3c4438'), C('#57604f'), C('#454e40')];
    for (let i = 0; i < 46; i++) {
      const a = rng() * 6.28;
      const rr = rng() * 15;
      g.fillStyle = css(cols[Math.floor(rng() * cols.length)]);
      g.beginPath();
      g.ellipse(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr * 0.9, 3.5 + rng() * 3, 2 + rng() * 2.5, a, 0, 6.283);
      g.fill();
    }
    for (let i = 0; i < 4; i++) {
      const a = rng() * 6.28;
      disc(g, S / 2 + Math.cos(a) * 6, S / 2 + Math.sin(a) * 6, 1.5, C('#2c332a'), 0.9);
    }
    for (let i = 0; i < 10; i++) {
      const a = rng() * 6.28;
      clearDisc(g, S / 2 + Math.cos(a) * (16 + rng() * 6), S / 2 + Math.sin(a) * (15 + rng() * 6), 2 + rng() * 3);
    }
    clearDisc(g, 1, 1, 2);
    clearDisc(g, S - 1, S - 1, 2);
  },
  torch(g, S, rng) {
    const cx = S / 2;
    g.fillStyle = css(C('#241a12'));
    g.fillRect(cx - 4, 16, 8, 30);
    for (let y = 20; y < 46; y += 6) {
      g.fillStyle = css(C('#3a2a1c'));
      g.fillRect(cx - 4, y, 8, 2);
    }
    g.fillStyle = css(C('#181008'));
    g.fillRect(cx - 4, 16, 2, 30);
    disc(g, cx, 14, 7, C('#7a3416'));
    disc(g, cx, 13, 5, C('#c94f16'));
    disc(g, cx, 12, 3.5, EMBER);
    disc(g, cx, 11, 1.8, EMBHOT);
    for (let i = 0; i < 5; i++) {
      const a = rng() * 6.28;
      disc(g, cx + Math.cos(a) * 6, 12 + Math.sin(a) * 5, 0.8, EMBHOT, 0.8);
    }
    clearDisc(g, 4, 4, 3);
    clearDisc(g, S - 4, 6, 3);
  },
};

const PAINTERS_B = {
  glowcap(g, S, rng) {
    const cx = S / 2;
    g.fillStyle = css(C('#c9c2b4'));
    g.fillRect(cx - 2, 28, 5, 16);
    g.fillStyle = css(C('#a89e8c'));
    g.fillRect(cx - 2, 28, 2, 16);
    g.fillStyle = css(BRUISE);
    g.beginPath();
    g.ellipse(cx, 28, 16, 13, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = css(BRUISED);
    g.beginPath();
    g.ellipse(cx, 29, 16, 3.5, 0, 0, Math.PI);
    g.fill();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 5);
      disc(g, cx + Math.cos(a) * 11, 28 + Math.sin(a) * 9, 1.6, C('#8a76a0'), 0.9);
    }
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 7);
      disc(g, cx + Math.cos(a) * 13, 29.5 + Math.sin(a) * 2.5, 1.2, SPORE, 0.95);
      disc(g, cx + Math.cos(a) * 13, 29.5 + Math.sin(a) * 2.5, 2.6, SPORE, 0.18);
    }
    clearDisc(g, 5, 8, 4);
    clearDisc(g, S - 5, 10, 4);
  },
  magma(g, S, rng) {
    fillAll(g, S, C('#160d0d'));
    for (let i = 0; i < 9; i++) {
      const x = rng() * S;
      const y = rng() * S;
      poly(g, [[x, y], [x + 6 + rng() * 8, y + rng() * 4], [x + rng() * 6, y + 6 + rng() * 8], [x - rng() * 5, y + 5]], rng() > 0.5 ? C('#241416') : C('#2e1a18'));
    }
    g.lineCap = 'round';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = css(EMBER);
      crackPath(g, rng, 4, 9);
    }
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = css(EMBHOT);
      crackPath(g, rng, 3, 6);
    }
    for (let i = 0; i < 8; i++) disc(g, 3 + rng() * (S - 6), 3 + rng() * (S - 6), 1, C('#ffd27a'), 0.9);
  },
  ash(g, S, rng) {
    fillAll(g, S, ASH);
    for (let i = 0; i < 6; i++) {
      const y = rng() * S;
      g.fillStyle = css(ASHD);
      g.globalAlpha = 0.35;
      g.fillRect(0, y, S, 2 + rng() * 4);
      g.globalAlpha = 1;
    }
    speckle(g, S, rng, 50, [C('#7d7884'), C('#5a5560')], 1, 2);
    speckle(g, S, rng, 10, [BONE], 1, 1.5);
    speckle(g, S, rng, 6, [C('#3a3542')], 2, 3);
  },
  crystal(g, S, rng) {
    for (let i = 0; i < 5; i++) {
      const x = 10 + rng() * (S - 20);
      const y = 14 + rng() * (S - 24);
      const h = 9 + rng() * 14;
      const w = 3 + rng() * 4;
      const lean = (rng() - 0.5) * 6;
      const base = [mixColor(C('#7a5cff'), C('#5b3fb0'), rng()), C('#7a5cff'), C('#5b3fb0'), C('#9d84ff')][Math.floor(rng() * 4)];
      poly(g, [[x, y], [x + w, y + lean], [x + w * 0.6, y - h], [x - w * 0.2, y + lean * 0.5]], C('#1c1428'));
      poly(g, [[x, y], [x + w * 0.6, y - h], [x - w * 0.4, y - h * 0.7]], base);
      poly(g, [[x, y], [x - w * 0.4, y - h * 0.7], [x - w * 0.8, y + lean * 0.8]], shadeColor(base, -0.3));
      poly(g, [[x, y], [x + w * 0.6, y - h], [x + w * 0.35, y - h * 0.8]], shadeColor(base, 0.4), 0.7);
    }
    speckle(g, S, rng, 6, [C('#cfc4ff')], 1, 1.2);
  },
  stonebrick(g, S, rng) {
    fillAll(g, S, C('#221c28'));
    for (let row = 0; row < 3; row++) {
      const y = row * 16;
      let x = row % 2 ? -8 : 0;
      while (x < S) {
        const w = 14 + rng() * 14;
        const sh = shadeColor(C('#7d7684'), (rng() - 0.5) * 0.24);
        g.fillStyle = css(sh);
        g.fillRect(x + 1, y + 1, w - 2, 14);
        g.fillStyle = css(shadeColor(sh, 0.22));
        g.fillRect(x + 1, y + 1, w - 2, 1);
        g.fillStyle = css(shadeColor(sh, -0.28));
        g.fillRect(x + 1, y + 13, w - 2, 2);
        if (rng() > 0.7) {
          g.fillStyle = css(C('#221c28'));
          g.fillRect(x + 2 + rng() * (w - 5), y + 2 + rng() * 10, 2, 2);
        }
        x += w;
      }
    }
  },
  bench_top(g, S, rng) {
    PAINTERS_A.plank(g, S, rng);
    g.strokeStyle = css(C('#3f3226'));
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 12, 2);
      g.lineTo(i * 12, S - 2);
      g.stroke();
      g.beginPath();
      g.moveTo(2, i * 12);
      g.lineTo(S - 2, i * 12);
      g.stroke();
    }
    g.strokeStyle = css(C('#241a12'));
    for (let i = 0; i < 6; i++) {
      const x = 4 + rng() * (S - 12);
      const y = 4 + rng() * (S - 12);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 3 + rng() * 3, y + (rng() - 0.5) * 2);
      g.stroke();
    }
    g.beginPath();
    g.arc(S / 2, S / 2, 6, 0.5, 4);
    g.stroke();
  },
  bench_side(g, S, rng) {
    fillAll(g, S, C('#5f4a30'));
    for (let b = 0; b < 2; b++) {
      const x = b * 24;
      g.fillStyle = css(b % 2 ? C('#66512f') : C('#57442a'));
      g.fillRect(x + 1, 0, 22, S);
      g.fillStyle = css(C('#241a12'));
      g.fillRect(x, 0, 2, S);
    }
    g.fillStyle = css(C('#241a12'));
    g.fillRect(8, 14, 10, 4);
    g.fillRect(12, 16, 3, 16);
    poly(g, [[32, 14], [42, 14], [42, 20], [38, 20], [38, 18], [34, 18], [34, 26], [32, 26]], C('#241a12'));
    for (let i = 0; i < 8; i++) strand(g, rng() * S, rng() * S, rng() * S, rng() * S, 1, C('#3a2c1c'), 0.4);
  },
  sprig(g, S, rng) {
    for (let i = 0; i < 5; i++) {
      const x0 = 14 + i * 5 + (rng() - 0.5) * 3;
      const tx = x0 + (rng() - 0.5) * 16;
      curveStrand(g, x0, 46, x0 + (tx - x0) * 0.3, 30, tx, 14 + rng() * 10, 1.5, C('#57604f'), 1);
      disc(g, tx, 13 + rng() * 8, 1.4, C('#9db3a6'), 1);
    }
    for (let i = 0; i < 8; i++) {
      const a = rng() * 6.28;
      disc(g, S / 2 + Math.cos(a) * 10, 28 + Math.sin(a) * 12, 1.6, C('#454e40'), 1);
    }
    clearDisc(g, 3, 3, 3);
    clearDisc(g, S - 3, 5, 3);
  },
  embergrass(g, S, rng) {
    for (let i = 0; i < 12; i++) {
      const x0 = 6 + rng() * (S - 12);
      const tipX = x0 + (rng() - 0.5) * 14;
      const tipY = 8 + rng() * 18;
      curveStrand(g, x0, 47, x0 + (tipX - x0) * 0.4, 46 - (46 - tipY) * 0.4, tipX, tipY, 1.4, C('#8a6a34'), 1);
      strand(g, tipX, tipY + 4, tipX + (rng() - 0.5), tipY, 1.2, C('#c96b2a'), 0.95);
    }
    for (let i = 0; i < 5; i++) disc(g, rng() * S, 44 + rng() * 3, 1.2, EMBER, 0.85);
    clearDisc(g, 2, 2, 3);
    clearDisc(g, S - 2, 3, 3);
  },
  berrybush(g, S, rng) {
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const x0 = 8 + rng() * (S - 16);
      curveStrand(g, x0, 47, x0 + (rng() - 0.5) * 20, 26, 8 + rng() * (S - 16), 10 + rng() * 14, 2, C('#3c3228'), 1);
    }
    for (let i = 0; i < 10; i++) {
      const x = 8 + rng() * (S - 16);
      const y = 14 + rng() * 22;
      disc(g, x, y, 2.4, C('#5a4a78'), 1);
      disc(g, x - 0.8, y - 0.8, 0.9, C('#8a76a0'), 0.9);
    }
    for (let i = 0; i < 8; i++) {
      const a = rng() * 6.28;
      g.fillStyle = css(C('#46503f'));
      g.beginPath();
      g.ellipse(S / 2 + Math.cos(a) * 12, 26 + Math.sin(a) * 12, 3, 1.8, a, 0, 6.283);
      g.fill();
    }
    clearDisc(g, 3, 3, 3);
    clearDisc(g, S - 3, 4, 3);
  },
  rootsprout(g, S, rng) {
    disc(g, S / 2, 44, 6, C('#57422f'), 1);
    for (let i = 0; i < 3; i++) {
      const x0 = 16 + i * 8;
      const dir = i % 2 ? 1 : -1;
      let px = x0;
      let py = 44;
      for (let s = 0; s < 4; s++) {
        const nx = px + dir * (4 + rng() * 4);
        const ny = py - 7 - rng() * 3;
        curveStrand(g, px, py, px + dir * 6, py - 4, nx, ny, 2, C('#c8b89c'), 1);
        px = nx;
        py = ny;
      }
      disc(g, px, py, 1.4, C('#8a7a5f'), 1);
    }
    clearDisc(g, 3, 4, 3);
    clearDisc(g, S - 3, 3, 3);
  },
  lantern(g, S, rng) {
    const grd = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, 22);
    grd.addColorStop(0, '#fff3d0');
    grd.addColorStop(0.5, '#ffcf7a');
    grd.addColorStop(1, '#b97a2e');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = css(C('#241a12'));
    g.lineWidth = 3;
    g.strokeRect(2, 2, S - 4, S - 4);
    g.beginPath();
    g.moveTo(S / 2, 2);
    g.lineTo(S / 2, S - 2);
    g.moveTo(2, S / 2);
    g.lineTo(S - 2, S / 2);
    g.stroke();
    g.lineWidth = 2;
    g.strokeRect(8, 8, S - 16, S - 16);
    disc(g, S / 2, S / 2, 4, C('#fff8e8'), 0.95);
    for (const p of [[4, 4], [S - 4, 4], [4, S - 4], [S - 4, S - 4]]) disc(g, p[0], p[1], 1.5, C('#181008'), 1);
  },
  ore_ferrite(g, S, rng) {
    oreHost(g, S, rng);
    for (let i = 0; i < 5; i++) {
      const x = 8 + rng() * (S - 16);
      const y = 8 + rng() * (S - 16);
      const r = 3 + rng() * 3;
      poly(g, [[x - r, y], [x, y - r * 0.8], [x + r, y], [x, y + r * 0.8]], C('#5c2c14'));
      poly(g, [[x - r + 1, y], [x, y - r * 0.8 + 1], [x + r - 1, y], [x, y + r * 0.8 - 1]], C('#b0562a'));
      disc(g, x - r * 0.3, y - r * 0.25, 0.9, C('#d88a54'), 0.9);
    }
    speckle(g, S, rng, 8, [C('#7a3c1c')], 1, 1.5);
  },
  ore_cupral(g, S, rng) {
    oreHost(g, S, rng);
    for (let i = 0; i < 4; i++) {
      const x = 9 + rng() * (S - 18);
      const y = 9 + rng() * (S - 18);
      const r = 3 + rng() * 2;
      disc(g, x, y, r + 0.8, C('#2e5c50'), 1);
      disc(g, x, y, r, C('#4f9a82'), 1);
      disc(g, x - r * 0.3, y - r * 0.3, r * 0.45, C('#79bfa6'), 0.9);
      disc(g, x + r * 0.4, y + r * 0.3, 0.8, C('#8fbfae'), 0.7);
    }
    speckle(g, S, rng, 6, [C('#3f7a68')], 1, 1.4);
  },
  ore_lumen(g, S, rng) {
    oreHost(g, S, rng);
    for (let i = 0; i < 6; i++) {
      const x = 8 + rng() * (S - 16);
      const y = 8 + rng() * (S - 16);
      const r = 1.5 + rng() * 1.5;
      disc(g, x, y, r * 2.6, SPORE, 0.16);
      disc(g, x, y, r, SPORE, 0.95);
      disc(g, x, y, r * 0.45, C('#d8fff4'), 1);
    }
    speckle(g, S, rng, 5, [C('#2e8a78')], 1, 1.3);
  },
};

function makeCrack(level) {
  return function crackN(g, S, rng) {
    g.lineCap = 'round';
    const segsPer = [3, 5, 8, 11][level];
    const lines = [1, 2, 3, 4][level];
    const spread = [10, 9, 8, 7][level];
    g.lineWidth = level >= 3 ? 2.5 : 2;
    g.strokeStyle = css(C('#0a080c'));
    for (let l = 0; l < lines; l++) crackPath(g, rng, segsPer, spread);
    if (level >= 2) {
      g.lineWidth = 1.2;
      for (let l = 0; l < level; l++) crackPath(g, rng, 2, 4);
    }
  };
}

const PAINTERS = Object.assign({}, PAINTERS_A, PAINTERS_B, {
  crystal: PAINTERS_B.crystal,
  crack_0: makeCrack(0),
  crack_1: makeCrack(1),
  crack_2: makeCrack(2),
  crack_3: makeCrack(3),
});

const CUTOUT_TILES = new Set([
  'leaf',
  'torch',
  'glowcap',
  'crystal',
  'sprig',
  'embergrass',
  'berrybush',
  'rootsprout',
  'crack_0',
  'crack_1',
  'crack_2',
  'crack_3',
]);

export function buildAtlas() {
  if (typeof document === 'undefined') return null;
  const S = ATLAS_META.tileSize;
  const R = ATLAS_META.tilesPerRow;
  const canvas = document.createElement('canvas');
  canvas.width = S * R;
  canvas.height = S * R;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  TILES.forEach((name, i) => {
    if (!PAINTERS[name]) throw new Error(`no painter for tile: ${name}`);
    const cx = (i % R) * S;
    const cy = Math.floor(i / R) * S;
    g.save();
    g.translate(cx, cy);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    PAINTERS[name](g, S, makeRng(hashName(name) ^ 0x5bd1e995));
    g.restore();
    const seed = hashName(name);
    g.save();
    g.translate(cx, cy);
    if (CUTOUT_TILES.has(name)) grainOnly(g, S, seed);
    else edgeVignette(g, S, seed);
    g.restore();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.needsUpdate = true;
  return { texture, canvas, tileSize: S, tilesPerRow: R };
}

