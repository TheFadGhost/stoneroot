import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorldgen } from '../src/world/worldgen.js';
import { BLOCK } from '../src/blocks.js';

const SEED = 1234;

function eqBytes(a, b) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

test('determinism: same worldgen, same chunk, byte-identical', () => {
  const a = makeWorldgen(SEED).generateChunk(3, -7);
  const b = makeWorldgen(SEED).generateChunk(3, -7);
  assert.ok(eqBytes(a.voxels, b.voxels));
  assert.ok(eqBytes(a.surfaceY, b.surfaceY));
});

test('determinism: generation order does not matter', () => {
  const coords = [
    [0, 0],
    [5, 3],
    [2, 2],
  ];
  const fwd = coords.map(([cx, cz]) => makeWorldgen(SEED).generateChunk(cx, cz));
  const rev = [...coords].reverse().map(([cx, cz]) => makeWorldgen(SEED).generateChunk(cx, cz));
  for (let k = 0; k < coords.length; k++) {
    assert.ok(eqBytes(fwd[k].voxels, rev[coords.length - 1 - k].voxels), `chunk ${coords[k]} voxels`);
    assert.ok(eqBytes(fwd[k].surfaceY, rev[coords.length - 1 - k].surfaceY), `chunk ${coords[k]} surfaceY`);
  }
  const again = makeWorldgen(SEED).generateChunk(3, -7);
  const earlier = makeWorldgen(SEED).generateChunk(3, -7);
  assert.ok(eqBytes(again.voxels, earlier.voxels));
});

test('different seeds produce different bytes in chunk (0,0)', () => {
  const base = makeWorldgen(SEED).generateChunk(0, 0);
  let found = false;
  for (let s = SEED + 1; s <= SEED + 6 && !found; s++) {
    const other = makeWorldgen(s).generateChunk(0, 0);
    for (let i = 0; i < other.voxels.length; i++) {
      if (other.voxels[i] !== base.voxels[i]) {
        found = true;
        break;
      }
    }
    if (!found) {
      for (let i = 0; i < other.surfaceY.length; i++) {
        if (other.surfaceY[i] !== base.surfaceY[i]) {
          found = true;
          break;
        }
      }
    }
  }
  assert.ok(found, 'expected some seed to differ');
});

test('structure sanity: strata order, corestone floor, id range', () => {
  const { voxels, surfaceY } = makeWorldgen(SEED).generateChunk(0, 0);
  const B = BLOCK;
  let goodColumn = false;
  for (let col = 0; col < 256 && !goodColumn; col++) {
    const top = surfaceY[col] - 1;
    if (top <= 8 || top > 190) continue;
    if (voxels[col | (top << 8)] !== B.THORNSOIL) continue;
    let sawLoam = false;
    let sawPale = false;
    for (let y = top - 1; y >= top - 12 && y > 4; y--) {
      const id = voxels[col | (y << 8)];
      if (!sawPale && !sawLoam) {
        if (id === B.LOAM || id === B.PEAT) sawLoam = true;
      } else if (sawLoam && !sawPale) {
        if (id === B.PALESTONE) sawPale = true;
      }
    }
    if (sawLoam && sawPale) goodColumn = true;
  }
  assert.ok(goodColumn, 'expected some column thornsoil over loam over palestone');
  for (let col = 0; col < 256; col += 5) {
    for (let y = 0; y <= 2; y++) {
      assert.equal(voxels[col | (y << 8)], B.CORESTONE, `corestone at y=${y}`);
    }
  }
  for (let i = 0; i < voxels.length; i++) {
    const id = voxels[i];
    assert.ok(id >= 0 && id <= 28, `block id ${id} out of range at ${i}`);
  }
  for (let col = 1; col < 256; col += 17) {
    assert.ok(surfaceY[col] >= 139 && surfaceY[col] <= 163, `surfaceY ${surfaceY[col]} plausible`);
  }
});

test('caves generate: carved air below y=130 around origin', () => {
  const chunks = [
    [0, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
  ];
  let totalAir = 0;
  const w = makeWorldgen(777);
  for (const [cx, cz] of chunks) {
    const { voxels } = w.generateChunk(cx, cz);
    for (let y = 3; y < 130; y++) {
      const row = y << 8;
      for (let i = row; i < row + 256; i++) {
        if (voxels[i] === BLOCK.AIR) totalAir++;
      }
    }
  }
  assert.ok(totalAir > 1500, `expected substantial cave air, got ${totalAir}`);
});

test('magma exists in emberdeep band within scanned chunks', () => {
  const w = makeWorldgen(99);
  const coords = [];
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) coords.push([dx, dz]);
  let found = false;
  for (const [cx, cz] of coords) {
    const { voxels } = w.generateChunk(cx, cz);
    for (let y = 18; y < 48 && !found; y++) {
      const row = y << 8;
      for (let i = row; i < row + 256; i++) {
        if (voxels[i] === BLOCK.MAGMA) {
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  assert.ok(found, 'expected magma in emberdeep band near origin');
});
