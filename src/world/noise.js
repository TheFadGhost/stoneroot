const U32 = 4294967296;

export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / U32;
  };
}

function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function hash2(seed, x, z) {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= z | 0;
  return mix(h) / U32;
}

export function hash3(seed, x, y, z) {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  h ^= y | 0;
  h = Math.imul(h ^ (h >>> 13), 0x165667b1);
  h ^= z | 0;
  return mix(h) / U32;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function valueNoise2(seed, x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(z - zi);
  const a = hash2(seed, xi, zi);
  const b = hash2(seed, xi + 1, zi);
  const c = hash2(seed, xi, zi + 1);
  const d = hash2(seed, xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function valueNoise3(seed, x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const c000 = hash3(seed, xi, yi, zi);
  const c100 = hash3(seed, xi + 1, yi, zi);
  const c010 = hash3(seed, xi, yi + 1, zi);
  const c110 = hash3(seed, xi + 1, yi + 1, zi);
  const c001 = hash3(seed, xi, yi, zi + 1);
  const c101 = hash3(seed, xi + 1, yi, zi + 1);
  const c011 = hash3(seed, xi, yi + 1, zi + 1);
  const c111 = hash3(seed, xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

export function fbm2(seed, x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fz = z;
  let s = seed | 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(s, fx, fz);
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fz *= lacunarity;
    s = (s + 1013904223) | 0;
  }
  return sum / norm;
}

export function fbm3(seed, x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fz = z;
  let s = seed | 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise3(s, fx, fy, fz);
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
    fz *= lacunarity;
    s = (s + 1013904223) | 0;
  }
  return sum / norm;
}

export function ridged3(seed, x, y, z, octaves = 3, lacunarity = 2, gain = 0.5) {
  const n = fbm3(seed, x, y, z, octaves, lacunarity, gain);
  return 1 - Math.abs(2 * n - 1);
}
