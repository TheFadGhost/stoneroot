import { BLOCK, BLOCK_DEFS } from '../blocks.js';
import { fbm2, fbm3, ridged3, hash2, hash3 } from './noise.js';

const B = BLOCK;
const SOLID = new Uint8Array(32);
const STONE_HOST = new Uint8Array(32);
for (let k = 0; k < BLOCK_DEFS.length; k++) {
  if (BLOCK_DEFS[k].solid === true) SOLID[BLOCK_DEFS[k].id] = 1;
}
STONE_HOST[B.PALESTONE] = 1;
STONE_HOST[B.SLATESTONE] = 1;
STONE_HOST[B.EMBERROCK] = 1;
STONE_HOST[B.VOIDSTONE] = 1;

export function makeWorldgen(seed) {
  const s = seed | 0;
  const sWarpA = s + 101;
  const sWarpB = s + 211;
  const sHeight = s + 307;
  const sRidge = s + 401;
  const sRidgeMask = s + 523;
  const sScree = s + 617;
  const sPeat = s + 709;
  const sLoamD = s + 811;
  const sWormA = s + 907;
  const sWormB = s + 1013;
  const sCheese = s + 1103;
  const sRavine = s + 1201;
  const sRavGate = s + 1301;
  const sRavBot = s + 1409;
  const sOreF = s + 1501;
  const sOreC = s + 1601;
  const sOreL = s + 1701;
  const sLake = s + 1801;
  const sMoss = s + 1901;
  const sMossK = s + 2003;
  const sCryF = s + 2101;
  const sCryC = s + 2203;
  const sGlow = s + 2309;
  const sFloraK = s + 2411;
  const sTreeP = s + 2503;
  const sTreeS = s + 2603;
  const sCanopy = s + 2707;
  const sFlare = s + 2801;
  const sDecor = s + 2903;

  function heightAt(wx, wz) {
    const wa = fbm2(sWarpA, wx * 0.011, wz * 0.011, 3) - 0.5;
    const wb = fbm2(sWarpB, wx * 0.011 + 43.7, wz * 0.011 - 61.3, 3) - 0.5;
    const px = wx + wa * 52;
    const pz = wz + wb * 52;
    let h = 150 + (fbm2(sHeight, px * 0.016, pz * 0.016, 4) - 0.5) * 22;
    const m = fbm2(sRidgeMask, wx * 0.0034, wz * 0.0034, 2);
    if (m > 0.56) {
      const rr = 1 - Math.abs(2 * fbm2(sRidge, px * 0.007, pz * 0.007, 3) - 1);
      h += rr * rr * ((m - 0.56) / 0.44) * 9;
    }
    h = Math.floor(h);
    if (h < 138) return 138;
    if (h > 162) return 162;
    return h;
  }

  let bx = 0;
  let bz = 0;
  const latWA = new Float32Array(1225);
  const latWB = new Float32Array(1225);
  const latCh = new Float32Array(1225);
  const latOF = new Float32Array(1225);
  const latOC = new Float32Array(1225);
  const latOL = new Float32Array(1225);

  function fillLat(arr, fn, iy0, iy1) {
    for (let iy = iy0; iy <= iy1; iy++) {
      const gy = iy * 4;
      for (let iz = 0; iz < 5; iz++) {
        const gz = bz + iz * 4;
        const row = iy * 25 + iz * 5;
        for (let ix = 0; ix < 5; ix++) {
          arr[row + ix] = fn(bx + ix * 4, gy, gz);
        }
      }
    }
  }

  function samp(a, fx, fy, fz) {
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const ty = fy - iy;
    const tz = fz - iz;
    const b000 = a[iy * 25 + iz * 5 + ix];
    const b100 = a[iy * 25 + iz * 5 + ix + 1];
    const b010 = a[(iy + 1) * 25 + iz * 5 + ix];
    const b110 = a[(iy + 1) * 25 + iz * 5 + ix + 1];
    const b001 = a[iy * 25 + (iz + 1) * 5 + ix];
    const b101 = a[iy * 25 + (iz + 1) * 5 + ix + 1];
    const b011 = a[(iy + 1) * 25 + (iz + 1) * 5 + ix];
    const b111 = a[(iy + 1) * 25 + (iz + 1) * 5 + ix + 1];
    const x00 = b000 + (b100 - b000) * tx;
    const x10 = b010 + (b110 - b010) * tx;
    const x01 = b001 + (b101 - b001) * tx;
    const x11 = b011 + (b111 - b011) * tx;
    const y0 = x00 + (x10 - x00) * ty;
    const y1 = x01 + (x11 - x01) * ty;
    return y0 + (y1 - y0) * tz;
  }

  function generateChunk(cx, cz) {
    bx = cx * 16;
    bz = cz * 16;
    const vox = new Uint8Array(49152);
    const surfaceY = new Uint8Array(256);
    const EH = new Int32Array(484);
    for (let dz = 0; dz < 22; dz++) {
      for (let dx = 0; dx < 22; dx++) {
        EH[dx + dz * 22] = heightAt(bx - 3 + dx, bz - 3 + dz);
      }
    }
    fillLat(latWA, (x, y, z) => ridged3(sWormA, x * 0.021, y * 0.032, z * 0.021, 3), 0, 42);
    fillLat(latWB, (x, y, z) => ridged3(sWormB, x * 0.019 + 77.7, y * 0.03, z * 0.019 - 31.1, 3), 0, 42);
    fillLat(latCh, (x, y, z) => fbm3(sCheese, x * 0.026, y * 0.036, z * 0.026, 3), 12, 35);
    fillLat(latOF, (x, y, z) => fbm3(sOreF, x * 0.085, y * 0.085, z * 0.085, 2), 5, 31);
    fillLat(latOC, (x, y, z) => fbm3(sOreC, x * 0.095 + 13.7, y * 0.095, z * 0.095 + 91.3, 2), 2, 16);
    fillLat(latOL, (x, y, z) => fbm3(sOreL, x * 0.105 - 51.9, y * 0.105, z * 0.105 + 27.9, 2), 1, 8);
    const ravA = new Uint8Array(256);
    const ravB = new Int16Array(256);
    for (let lz = 0; lz < 16; lz++) {
      const wz = bz + lz;
      for (let lx = 0; lx < 16; lx++) {
        const wx = bx + lx;
        const col = lx | (lz << 4);
        const h = EH[lx + 3 + (lz + 3) * 22];
        const screeOn = fbm2(sScree, wx * 0.045, wz * 0.045, 2) > 0.63;
        const peatOn = fbm2(sPeat, wx * 0.04 + 17.9, wz * 0.04 - 33.1, 2) > 0.62;
        const loamD = 3 + ((hash2(sLoamD, wx, wz) * 3) | 0);
        const rv = 1 - Math.abs(2 * fbm2(sRavine, wx * 0.0045, wz * 0.0045, 3) - 1);
        if (rv > 0.978 && fbm2(sRavGate, wx * 0.01, wz * 0.01, 2) > 0.45) {
          ravA[col] = 1;
          ravB[col] = 34 + ((fbm2(sRavBot, wx * 0.012, wz * 0.012, 2) * 40) | 0);
        }
        const fx = lx * 0.25;
        const fz = lz * 0.25;
        for (let y = 0; y < h; y++) {
          const i = col | (y << 8);
          const d = h - 1 - y;
          let id;
          if (y <= 2) {
            id = B.CORESTONE;
          } else if (d === 0) {
            id = screeOn ? B.SCREE : B.THORNSOIL;
          } else if (d <= loamD && y >= 96) {
            id = peatOn ? B.PEAT : B.LOAM;
          } else if (y >= 110) {
            id = B.PALESTONE;
          } else if (y >= 60) {
            id = peatOn && y <= 94 ? B.PEAT : B.SLATESTONE;
          } else if (y >= 24) {
            id = B.EMBERROCK;
          } else {
            id = B.VOIDSTONE;
          }
          if (y > 3) {
            let carve = false;
            const dd = h - y;
            const wBand = 0.05 + (dd > 60 ? 60 : dd) * 0.0005;
            if (samp(latWA, fx, y * 0.25, fz) > 1 - wBand && samp(latWB, fx, y * 0.25, fz) > 1 - wBand) {
              carve = true;
            } else if (y >= 50 && y <= 135 && dd >= 6) {
              let tC = 0.74;
              if (y < 56) tC += (56 - y) * 0.02;
              else if (y > 128) tC += (y - 128) * 0.02;
              if (samp(latCh, fx, y * 0.25, fz) > tC) carve = true;
            }
            if (!carve && ravA[col] && y <= h - 5 && y >= ravB[col]) carve = true;
            if (carve) continue;
            if (STONE_HOST[id]) {
              if (y >= 20 && y <= 120 && samp(latOF, fx, y * 0.25, fz) > 0.79) {
                vox[i] = B.FERRITE_ORE;
                continue;
              }
              if (y >= 8 && y <= 60 && samp(latOC, fx, y * 0.25, fz) > 0.79) {
                vox[i] = B.CUPRAL_ORE;
                continue;
              }
              if (y >= 3 && y <= 30 && samp(latOL, fx, y * 0.25, fz) > 0.8) {
                vox[i] = B.LUMEN_ORE;
                continue;
              }
            }
          }
          vox[i] = id;
        }
      }
    }
    for (let lz = 0; lz < 16; lz++) {
      const wz = bz + lz;
      for (let lx = 0; lx < 16; lx++) {
        const wx = bx + lx;
        if (fbm2(sMoss, wx * 0.05, wz * 0.05, 2) <= 0.48) continue;
        const col = lx | (lz << 4);
        for (let y = 48; y < 96; y++) {
          const i = col | (y << 8);
          const id = vox[i];
          if (id !== B.SLATESTONE && id !== B.PALESTONE) continue;
          const nb =
            (lx > 0 && vox[i - 1] === B.AIR) ||
            (lx < 15 && vox[i + 1] === B.AIR) ||
            (lz > 0 && vox[i - 16] === B.AIR) ||
            (lz < 15 && vox[i + 16] === B.AIR) ||
            vox[i - 256] === B.AIR ||
            vox[i + 256] === B.AIR;
          if (nb && hash3(sMossK, wx, y, wz) < 0.45) vox[i] = B.MOSSPALE;
        }
      }
    }
    for (let lz = 0; lz < 16; lz++) {
      const wz = bz + lz;
      for (let lx = 0; lx < 16; lx++) {
        const wx = bx + lx;
        const col = lx | (lz << 4);
        const lakeOn = fbm2(sLake, wx * 0.028, wz * 0.028, 2) > 0.56;
        const cryOn = fbm2(sCryF, wx * 0.07, wz * 0.07, 2) > 0.58;
        const glowOn = fbm2(sGlow, wx * 0.09, wz * 0.09, 2) > 0.58;
        for (let y = 4; y < 96; y++) {
          const i = col | (y << 8);
          if (vox[i] !== B.AIR) continue;
          const below = vox[i - 256];
          const above = y < 191 ? vox[i + 256] : B.AIR;
          if (lakeOn && y >= 18 && y <= 40 && (below === B.EMBERROCK || below === B.VOIDSTONE || below === B.MAGMA)) {
            vox[i] = B.MAGMA;
          } else if (glowOn && y >= 48 && SOLID[below]) {
            const r = hash3(sFloraK, wx, y, wz);
            if (r < 0.3) vox[i] = B.GLOWCAP;
            else if (r < 0.42) vox[i] = B.SPORESPRIG;
            else if (r < 0.54) vox[i] = B.ROOTSPROUT;
          } else if (cryOn && y <= 47) {
            if (SOLID[below]) {
              if (hash3(sCryF + 31, wx, y, wz) < 0.12) vox[i] = B.CRYSTALBLOCK;
            } else if (SOLID[above] && hash3(sCryC, wx, y, wz) < 0.1) {
              vox[i] = B.CRYSTALBLOCK;
            }
          }
        }
      }
    }
    for (let lz = 0; lz < 16; lz++) {
      const wz = bz + lz;
      for (let lx = 0; lx < 16; lx++) {
        const wx = bx + lx;
        const col = lx | (lz << 4);
        const h = EH[lx + 3 + (lz + 3) * 22];
        const gi = col | ((h - 1) << 8);
        const top = vox[gi];
        if (top !== B.THORNSOIL && top !== B.SCREE) continue;
        const ai = col | (h << 8);
        if (vox[ai] !== B.AIR) continue;
        const r = hash2(sDecor, wx, wz);
        if (top === B.THORNSOIL) {
          if (r < 0.09) vox[ai] = B.EMBERGRASS;
          else if (r < 0.11) vox[ai] = B.GLOOMBERRYBUSH;
          else if (r < 0.125 && hash2(sDecor + 7, wx, wz) < 0.5) vox[ai] = B.ASHPILE;
        } else if (r < 0.05) {
          vox[ai] = B.ASHPILE;
        }
      }
    }
    function put(wx, y, wz, id, onlyAir) {
      const lx = wx - bx;
      if (lx < 0 || lx > 15) return;
      const lz = wz - bz;
      if (lz < 0 || lz > 15) return;
      if (y < 0 || y > 191) return;
      const i = (lx | (lz << 4)) | (y << 8);
      const cur = vox[i];
      if (onlyAir) {
        if (cur !== B.AIR) return;
      } else if (cur === B.CORESTONE || cur === B.MAGMA) {
        return;
      }
      vox[i] = id;
    }
    for (let wz = bz - 3; wz < bz + 19; wz++) {
      for (let wx = bx - 3; wx < bx + 19; wx++) {
        const r = hash2(sTreeP, wx, wz);
        if (r < 0.94) continue;
        let best = true;
        for (let dz = -2; dz <= 2 && best; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dz === 0) continue;
            if (hash2(sTreeP, wx + dx, wz + dz) >= r) {
              best = false;
              break;
            }
          }
        }
        if (!best) continue;
        const h = EH[wx - (bx - 3) + (wz - (bz - 3)) * 22];
        const rs = hash2(sTreeS, wx, wz);
        const th = 4 + ((hash2(sTreeS + 13, wx, wz) * 4) | 0);
        const bend1 = rs < 0.75;
        const bend2 = rs < 0.4;
        const o1x = ((hash2(sTreeS + 29, wx, wz) * 3) | 0) - 1;
        const o1z = ((hash2(sTreeS + 47, wx, wz) * 3) | 0) - 1;
        const o2x = ((hash2(sTreeS + 61, wx, wz) * 3) | 0) - 1;
        const o2z = ((hash2(sTreeS + 79, wx, wz) * 3) | 0) - 1;
        const b1y = 2 + ((hash2(sTreeS + 97, wx, wz) * 2) | 0);
        let px = wx;
        let pz = wz;
        for (let k = 0; k < th; k++) {
          if (k === b1y) {
            if (bend1) {
              px += o1x;
              pz += o1z;
            }
            if (bend2) {
              px += o2x;
              pz += o2z;
            }
          }
          put(px, h + k, pz, B.ROOTWOOD, false);
        }
        const rad = 1 + ((hash2(sTreeS + 113, wx, wz) * 3) | 0);
        const cy = h + th - 1;
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dz = -rad; dz <= rad; dz++) {
            for (let dx = -rad; dx <= rad; dx++) {
              if (dx * dx + dy * dy * 1.21 + dz * dz > rad * rad + 0.6) continue;
              if (hash3(sCanopy, px + dx, cy + dy, pz + dz) <= 0.14) continue;
              put(px + dx, cy + dy, pz + dz, B.GLOOMLEAF, true);
            }
          }
        }
        for (let f = 0; f < 4; f++) {
          const fdx = f === 0 ? 1 : f === 1 ? -1 : 0;
          const fdz = f === 2 ? 1 : f === 3 ? -1 : 0;
          if (hash2(sFlare, wx * 7 + f, wz * 7 - f) < 0.6) put(wx + fdx, h - 1, wz + fdz, B.ROOTWOOD, true);
        }
      }
    }
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const col = lx | (lz << 4);
        let sy = 192;
        for (let y = 191; y >= 0; y--) {
          if (SOLID[vox[col | (y << 8)]]) {
            sy = y + 1;
            break;
          }
        }
        surfaceY[col] = sy;
      }
    }
    return { voxels: vox, surfaceY };
  }

  return { generateChunk };
}
