import test from 'node:test';
import assert from 'node:assert/strict';
import { meshChunk } from '../src/world/mesher.js';
import { TILE, CHUNK_SIZE, WORLD_HEIGHT } from '../src/config.js';
import { BLOCK } from '../src/blocks.js';
import { hash3 } from '../src/world/noise.js';
import { makeWorldgen } from '../src/world/worldgen.js';

const CS = CHUNK_SIZE;
const WH = WORLD_HEIGHT;
const VOL = CS * CS * WH;
const vidx = (x, y, z) => x | (z << 4) | (y << 8);
const EPS = 1e-4;

function makeVol(sky = 15) {
  const lights = new Uint8Array(VOL);
  if (sky > 0) lights.fill(sky);
  return { voxels: new Uint8Array(VOL), lights };
}

function airNb() {
  return { voxels: new Uint8Array(VOL), lights: new Uint8Array(VOL).fill(15) };
}

function vertCount(m) {
  return m.positions.length / 3;
}

function normalsSet(m) {
  const set = new Set();
  for (let v = 0; v < vertCount(m); v++) {
    const x = Math.round(m.normals[v * 3]);
    const y = Math.round(m.normals[v * 3 + 1]);
    const z = Math.round(m.normals[v * 3 + 2]);
    set.add(`${x},${y},${z}`);
  }
  return set;
}

function findVerts(m, pred) {
  const out = [];
  for (let v = 0; v < vertCount(m); v++) {
    if (
      pred(
        m.positions[v * 3],
        m.positions[v * 3 + 1],
        m.positions[v * 3 + 2],
        m.normals[v * 3],
        m.normals[v * 3 + 1],
        m.normals[v * 3 + 2]
      )
    )
      out.push(v);
  }
  return out;
}

test('isolated stone block: 6 faces, palestone tiles, all axis normals', () => {
  const vol = makeVol();
  vol.voxels[vidx(8, 96, 8)] = BLOCK.PALESTONE;
  const m = meshChunk({ voxels: vol.voxels, lights: vol.lights, neighbors: {} });
  assert.equal(vertCount(m), 24);
  assert.equal(m.indices.length, 36);
  assert.equal(m.tiles.length, 24);
  for (const t of m.tiles) assert.equal(t, TILE.palestone);
  const ns = normalsSet(m);
  assert.equal(ns.size, 6);
  for (const n of ['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1']) {
    assert.ok(ns.has(n), `missing normal ${n}`);
  }
});

test('adjacent blocks share-face culling: 10 faces remain', () => {
  const vol = makeVol();
  vol.voxels[vidx(8, 100, 8)] = BLOCK.PALESTONE;
  vol.voxels[vidx(9, 100, 8)] = BLOCK.STONEBRICK;
  const m = meshChunk({ voxels: vol.voxels, lights: vol.lights, neighbors: {} });
  assert.equal(vertCount(m), 40);
  assert.equal(m.indices.length, 60);
  const shared = findVerts(m, (x, _y, _z, nx) => Math.abs(x - 9) < EPS && Math.abs(nx) > 0.5);
  assert.equal(shared.length, 0);
});

test('greedy merge: 2x2 patch top collapses to one quad', () => {
  const vol = makeVol();
  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) vol.voxels[vidx(x, 99, z)] = BLOCK.PALESTONE;
  }
  for (let x = 6; x <= 7; x++) {
    for (let z = 6; z <= 7; z++) vol.voxels[vidx(x, 100, z)] = BLOCK.PALESTONE;
  }
  const m = meshChunk({ voxels: vol.voxels, lights: vol.lights, neighbors: {} });
  const top = findVerts(
    m,
    (x, y, z, _nx, ny) =>
      ny > 0.9 && Math.abs(y - 101) < EPS && x >= 6 - EPS && x <= 8 + EPS && z >= 6 - EPS && z <= 8 + EPS
  );
  assert.equal(top.length, 4);
  let refs = 0;
  for (let k = 0; k < m.indices.length; k++) if (top.includes(m.indices[k])) refs++;
  assert.equal(refs, 6);
});

test('vertex AO uses classic levels and darkens walled corners', () => {
  const vol = makeVol();
  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) vol.voxels[vidx(x, 99, z)] = BLOCK.PALESTONE;
  }
  vol.voxels[vidx(8, 100, 8)] = BLOCK.PALESTONE;
  vol.voxels[vidx(9, 100, 8)] = BLOCK.PALESTONE;
  vol.voxels[vidx(9, 101, 8)] = BLOCK.PALESTONE;
  vol.voxels[vidx(9, 102, 8)] = BLOCK.PALESTONE;
  const m = meshChunk({ voxels: vol.voxels, lights: vol.lights, neighbors: {} });
  const levels = [1.0, 0.82, 0.66, 0.5];
  for (const a of m.ao) {
    assert.ok(levels.some((l) => Math.abs(a - l) < EPS), `ao ${a} not in level set`);
  }
  const topB = findVerts(
    m,
    (x, y, z, _nx, ny) =>
      ny > 0.9 && Math.abs(y - 101) < EPS && x >= 8 - EPS && x <= 9 + EPS && z >= 8 - EPS && z <= 9 + EPS
  );
  assert.equal(topB.length, 4);
  let min = 2;
  let max = -1;
  let dark = 0;
  for (const v of topB) {
    const a = m.ao[v];
    if (a < min) min = a;
    if (a > max) max = a;
    if (a < 0.99) dark++;
  }
  assert.equal(dark, 2);
  assert.ok(Math.abs(min - 0.82) < EPS);
  assert.ok(Math.abs(max - 1.0) < EPS);
  assert.ok(min < max);
});

test('cross plant emits 4 double-sided quads with own light', () => {
  const vol = makeVol();
  vol.voxels[vidx(8, 100, 8)] = BLOCK.SPORESPRIG;
  const m = meshChunk({ voxels: vol.voxels, lights: vol.lights, neighbors: {} });
  assert.equal(vertCount(m), 16);
  assert.equal(m.indices.length, 24);
  for (const a of m.ao) assert.equal(a, 1);
  for (const t of m.tiles) assert.equal(t, TILE.sprig);
  for (let v = 0; v < vertCount(m); v++) {
    assert.equal(m.glow[v * 3], 0);
    assert.equal(m.sky[v], 1);
    assert.equal(m.blk[v], 0);
  }
});

test('magma top face lowered to 0.88', () => {
  const vol = makeVol();
  vol.voxels[vidx(8, 50, 8)] = BLOCK.MAGMA;
  const m = meshChunk({ voxels: vol.voxels, lights: vol.lights, neighbors: {} });
  const tops = findVerts(m, (_x, _y, _z, nx, ny, nz) => ny > 0.9 && nx === 0 && nz === 0);
  assert.equal(tops.length, 4);
  for (const v of tops) assert.ok(Math.abs(m.positions[v * 3 + 1] - 50.88) < EPS);
  const fullTops = findVerts(m, (_x, y, _z, _nx, ny) => ny > 0.9 && Math.abs(y - 51) < EPS);
  assert.equal(fullTops.length, 0);
});

function fillHalfChunk(vol) {
  for (let y = 0; y < WH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 8; x < CS; x++) vol.voxels[vidx(x, y, z)] = BLOCK.PALESTONE;
    }
  }
}

test('null boundary culls +x faces, air neighbor draws them', () => {
  const volA = makeVol();
  fillHalfChunk(volA);
  const mA = meshChunk({ voxels: volA.voxels, lights: volA.lights, neighbors: {} });
  const boundaryA = findVerts(mA, (_x, _y, _z, nx) => nx > 0.5);
  assert.equal(boundaryA.length, 0);
  const volB = makeVol();
  fillHalfChunk(volB);
  const mB = meshChunk({
    voxels: volB.voxels,
    lights: volB.lights,
    neighbors: { px: airNb() },
  });
  const boundaryB = findVerts(
    mB,
    (x, _y, _z, nx) => nx > 0.5 && Math.abs(x - 16) < EPS
  );
  assert.ok(boundaryB.length >= 4, 'expected drawn +x boundary faces');
});

function buildMixedScene() {
  const vol = makeVol();
  for (let x = 0; x < CS; x++) {
    for (let z = 0; z < CS; z++) vol.voxels[vidx(x, 64, z)] = BLOCK.PALESTONE;
  }
  for (let x = 6; x <= 8; x++) {
    for (let z = 6; z <= 8; z++) {
      vol.voxels[vidx(x, 65, z)] = BLOCK.GLOOMLEAF;
      vol.voxels[vidx(x, 66, z)] = BLOCK.GLOOMLEAF;
    }
  }
  vol.voxels[vidx(4, 65, 4)] = BLOCK.CRYSTALBLOCK;
  for (let x = 11; x <= 13; x++) {
    for (let z = 11; z <= 13; z++) vol.voxels[vidx(x, 65, z)] = BLOCK.MAGMA;
  }
  vol.voxels[vidx(2, 65, 2)] = BLOCK.SPORESPRIG;
  vol.voxels[vidx(13, 65, 2)] = BLOCK.TORCHSTAKE;
  vol.voxels[vidx(2, 65, 13)] = BLOCK.LANTERN;
  vol.voxels[vidx(5, 64, 12)] = BLOCK.LUMEN_ORE;
  vol.lights[vidx(13, 65, 2)] = (14 << 4) | 15;
  return vol;
}

test('integrity: indices, bounds, attribute lengths, light ranges', () => {
  const vol = buildMixedScene();
  const m = meshChunk({ voxels: vol.voxels, lights: vol.lights, neighbors: {} });
  const n = vertCount(m);
  assert.ok(n > 0);
  assert.equal(m.indices.length % 6, 0);
  for (let k = 0; k < m.indices.length; k++) assert.ok(m.indices[k] < n);
  for (let v = 0; v < n; v++) {
    const px = m.positions[v * 3];
    const py = m.positions[v * 3 + 1];
    const pz = m.positions[v * 3 + 2];
    assert.ok(px >= -EPS && px <= CS + EPS, `pos x ${px}`);
    assert.ok(py >= -EPS && py <= WH + EPS, `pos y ${py}`);
    assert.ok(pz >= -EPS && pz <= CS + EPS, `pos z ${pz}`);
    assert.equal(m.positions.length, n * 3);
    assert.equal(m.normals.length, n * 3);
    assert.equal(m.uvs.length, n * 2);
    assert.equal(m.tiles.length, n);
    assert.equal(m.ao.length, n);
    assert.equal(m.sky.length, n);
    assert.equal(m.blk.length, n);
    assert.equal(m.glow.length, n * 3);
    assert.ok(m.sky[v] >= 0 && m.sky[v] <= 1, `sky ${m.sky[v]}`);
    assert.ok(m.blk[v] >= 0 && m.blk[v] <= 1, `blk ${m.blk[v]}`);
    assert.ok(Number.isInteger(m.tiles[v]) && m.tiles[v] >= 0);
  }
  let litGlow = false;
  for (let g = 0; g < n; g++) {
    if (m.glow[g * 3] > 0.5 || m.glow[g * 3 + 1] > 0.5) litGlow = true;
  }
  assert.ok(litGlow, 'expected emissive glow present');
});

test('perf smoke: noisy hash3 volume meshes under 200ms', (t) => {
  const vol = makeVol();
  for (let y = 0; y < WH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        if (y < 24 || (y < 150 && hash3(777, x >> 2, y >> 2, z >> 2) > 0.55)) {
          vol.voxels[vidx(x, y, z)] = BLOCK.PALESTONE;
        }
        const blkL = (hash3(911, x >> 3, y >> 3, z >> 3) * 15) | 0;
        const skyL = (hash3(313, x >> 4, y >> 4, z >> 4) * 15) | 0;
        vol.lights[vidx(x, y, z)] = (blkL << 4) | skyL;
      }
    }
  }
  const input = { voxels: vol.voxels, lights: vol.lights, neighbors: { px: airNb(), nx: airNb(), pz: airNb(), nz: airNb() } };
  const t0 = performance.now();
  const m = meshChunk(input);
  const dt = performance.now() - t0;
  t.diagnostic(`noise volume: ${vertCount(m)} verts in ${dt.toFixed(1)}ms`);
  assert.ok(dt < 200, `mesh took ${dt.toFixed(1)}ms`);
});

test('perf typical: worldgen chunk with derived lights meshes fast', (t) => {
  const gen = makeWorldgen(1234);
  const chunk = gen.generateChunk(2, -3);
  const lights = new Uint8Array(VOL);
  for (let z = 0; z < CS; z++) {
    for (let x = 0; x < CS; x++) {
      const top = chunk.surfaceY[z * CS + x];
      for (let y = top; y < WH; y++) lights[vidx(x, y, z)] = 15;
    }
  }
  const t0 = performance.now();
  const m = meshChunk({ voxels: chunk.voxels, lights, neighbors: { px: airNb(), nx: airNb(), pz: airNb(), nz: airNb() } });
  const dt = performance.now() - t0;
  t.diagnostic(`worldgen chunk: ${vertCount(m)} verts in ${dt.toFixed(1)}ms`);
  assert.ok(dt < 500, `mesh took ${dt.toFixed(1)}ms`);
});
