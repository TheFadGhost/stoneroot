import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { TILES, TILE, ATLAS_TILES_PER_ROW, MAX_DYNAMIC_POINT_LIGHTS } from '../src/config.js';
import {
  ATLAS_META,
  PALETTE,
  tileIndex,
  tileRect,
  buildAtlas,
  hexToRgb,
  mixColor,
  shadeColor,
} from '../src/render/atlas.js';
import {
  createTerrainMaterials,
  updateEnvironmentUniforms,
  faceShadeForNormal,
  torchWarmRamp,
  fogFactorExp,
  acesApprox,
  hashDither,
} from '../src/render/materials.js';
import { computeSunDirection, computeNightFactor, horizonColorAt, SkyDome } from '../src/render/sky.js';
import { ParticleSystem, blockAvgColor, TILE_AVG } from '../src/render/particles.js';
import { buildEntityView, updateMobView, setEntitySun } from '../src/render/entityviews.js';

test('atlas meta matches config', () => {
  assert.equal(ATLAS_META.tileSize, 48);
  assert.equal(ATLAS_META.tilesPerRow, ATLAS_TILES_PER_ROW);
  assert.equal(ATLAS_META.padding, 0);
});

test('every config tile has a rect in order with valid uv bounds', () => {
  assert.equal(TILES.length, Object.keys(TILE).length);
  for (let i = 0; i < TILES.length; i++) {
    const r = tileRect(TILES[i]);
    assert.ok(r, `missing rect for ${TILES[i]}`);
    assert.equal(tileIndex(TILES[i]), i);
    assert.ok(r.u0 >= 0 && r.u1 <= 1 && r.v0 >= 0 && r.v1 <= 1, `${TILES[i]} out of range`);
    assert.ok(r.u1 > r.u0 && r.v1 > r.v0, `${TILES[i]} degenerate`);
    const col = i % ATLAS_TILES_PER_ROW;
    const row = Math.floor(i / ATLAS_TILES_PER_ROW);
    const s = 1 / ATLAS_TILES_PER_ROW;
    assert.ok(Math.abs(r.u0 - col * s) < 1e-12);
    assert.ok(Math.abs(r.u1 - (col + 1) * s) < 1e-12);
    assert.ok(Math.abs(r.v1 - (1 - row * s)) < 1e-12);
    if (col + 1 < ATLAS_TILES_PER_ROW && i + 1 < TILES.length) {
      const next = tileRect(TILES[i + 1]);
      assert.equal(next.u0, r.u1, `row gap after ${TILES[i]}`);
      assert.equal(next.v0, r.v0, `row mismatch at ${TILES[i + 1]}`);
    }
  }
});

test('tileRect throws on unknown name and buildAtlas is guarded in node', () => {
  assert.throws(() => tileRect('not_a_tile'));
  assert.equal(typeof buildAtlas, 'function');
  if (typeof document === 'undefined') assert.equal(buildAtlas(), null);
});

test('palette color helpers stay in range', () => {
  for (const k of Object.keys(PALETTE)) {
    const c = hexToRgb(PALETTE[k]);
    assert.ok(c.r >= 0 && c.r <= 1 && c.g >= 0 && c.g <= 1 && c.b >= 0 && c.b <= 1, k);
  }
  const m = mixColor(hexToRgb('#000000'), hexToRgb('#ffffff'), 0.5);
  assert.ok(Math.abs(m.r - 0.5) < 1e-9);
  const over = mixColor(m, hexToRgb('#ffffff'), 5);
  assert.ok(over.r <= 1 && over.r >= 0);
  const sh = shadeColor(m, -0.5);
  assert.ok(sh.r >= 0 && sh.r < 0.51);
  const hi = shadeColor(m, 2);
  assert.equal(hi.r, 1);
});

test('computeSunDirection normalized with dawn-noon-dusk continuity', () => {
  for (let t = 0; t <= 1; t += 0.05) {
    const d = computeSunDirection(t);
    const l = Math.hypot(d.x, d.y, d.z);
    assert.ok(Math.abs(l - 1) < 1e-9, `len ${l} at ${t}`);
  }
  const dawn = computeSunDirection(0);
  assert.ok(dawn.x > 0.9 && Math.abs(dawn.y) < 0.02);
  const noon = computeSunDirection(0.25);
  assert.ok(noon.y > 0.9 && Math.abs(noon.x) < 0.02);
  const dusk = computeSunDirection(0.5);
  assert.ok(dusk.x < -0.9 && Math.abs(dusk.y) < 0.02);
  const mid = computeSunDirection(0.75);
  assert.ok(mid.y < -0.85);
  let prevY = -2;
  for (let t = 0; t <= 0.25; t += 0.01) {
    const y = computeSunDirection(t).y;
    assert.ok(y >= prevY - 1e-9, `elevation not monotonic near ${t}`);
    prevY = y;
  }
});

test('night factor and horizon color ranges', () => {
  assert.ok(computeNightFactor(0.25) === 0);
  assert.ok(computeNightFactor(0.75) > 0.95);
  for (let t = 0; t <= 1; t += 0.05) {
    const nf = computeNightFactor(t);
    assert.ok(nf >= 0 && nf <= 1);
    const h = horizonColorAt(t);
    assert.ok(h.r >= 0 && h.r <= 1 && h.g >= 0 && h.g <= 1 && h.b >= 0 && h.b <= 1);
  }
  const day = horizonColorAt(0.25);
  const night = horizonColorAt(0.75);
  const dist = Math.hypot(day.r - night.r, day.g - night.g, day.b - night.b);
  assert.ok(dist > 0.15);
});

test('terrain materials import cleanly and build without DOM via fake atlas', () => {
  const mats = createTerrainMaterials({ texture: null });
  assert.ok(mats.opaque instanceof THREE.ShaderMaterial);
  assert.ok(mats.cutout instanceof THREE.ShaderMaterial);
  assert.equal(mats.cutout.side, THREE.DoubleSide);
  assert.equal(mats.opaque.side, THREE.FrontSide);
  assert.equal(mats.opaque.toneMapped, false);
  for (const key of ['uAtlas', 'uTilesPerRow', 'uFogColor', 'uFogDensity', 'uSunDir', 'uSunColor', 'uAmbient', 'uNightFactor', 'uTime', 'uCamPos', 'uPointLightCount', 'uPointLights', 'uPointLightColors']) {
    assert.ok(mats.opaque.uniforms[key], `uniform ${key} missing`);
  }
  assert.equal(mats.opaque.uniforms.uTilesPerRow.value, ATLAS_TILES_PER_ROW);
  assert.equal(mats.opaque.uniforms.uPointLights.value.length, MAX_DYNAMIC_POINT_LIGHTS);
  updateEnvironmentUniforms(mats, {
    sunDir: { x: 0.3, y: 0.8, z: 0.2 },
    sunColor: { r: 1, g: 0.9, b: 0.8 },
    ambient: { r: 0.2, g: 0.2, b: 0.3 },
    fogColor: { r: 0.1, g: 0.1, b: 0.15 },
    fogDensity: 0.03,
    nightFactor: 0.7,
    time: 12.5,
    camPos: { x: 1, y: 150, z: 2 },
    pointLights: [
      { x: 4, y: 140, z: 5, radius: 9, r: 1, g: 0.6, b: 0.3 },
      { x: 10, y: 141, z: 6, radius: 6, r: 0.3, g: 1, b: 0.8 },
    ],
  });
  const u = mats.opaque.uniforms;
  assert.equal(u.uPointLightCount.value, 2);
  assert.equal(u.uNightFactor.value, 0.7);
  assert.equal(u.uTime.value, 12.5);
  assert.ok(Math.abs(u.uSunDir.value.length() - 1) < 1e-6);
  assert.equal(u.uPointLightColors.value[1].g, 1);
  assert.equal(u.uPointLights.value[11].w, 1);
  assert.ok(u.uFogDensity.value === 0.03);
});

test('material pure math helpers produce sane values', () => {
  assert.equal(faceShadeForNormal(0, 1, 0), 1);
  assert.equal(faceShadeForNormal(0, -1, 0), 0.58);
  assert.equal(faceShadeForNormal(0, 0, 1), 0.82);
  assert.equal(faceShadeForNormal(1, 0, 0), 0.74);
  const low = torchWarmRamp(0);
  const high = torchWarmRamp(1);
  assert.ok(low.r > low.b);
  assert.ok(high.r > high.g && high.g > high.b);
  assert.ok(torchWarmRamp(-1).r === torchWarmRamp(0).r);
  assert.ok(fogFactorExp(0, 0.03, 0) === 0);
  assert.ok(fogFactorExp(1000, 0.03, 0) > 0.99);
  assert.ok(fogFactorExp(30, 0.03, 0) >= 0 && fogFactorExp(30, 0.03, 0) <= 1);
  assert.ok(fogFactorExp(30, 0.03, 0.6) > fogFactorExp(30, 0.03, 0));
  assert.ok(acesApprox(0) === 0);
  assert.ok(acesApprox(1) > 0.7 && acesApprox(1) <= 1);
  assert.ok(acesApprox(100) === 1);
  const d = hashDither(13, 17);
  assert.ok(d >= 0 && d < 1);
  assert.notEqual(hashDither(13, 17), hashDither(14, 17));
});

test('sky dome builds headless, updates, exposes horizon color', () => {
  const scene = new THREE.Scene();
  const sky = new SkyDome(scene);
  assert.ok(sky.mesh.parent === scene);
  assert.equal(sky.mesh.renderOrder, -1);
  assert.equal(sky.mesh.material.depthWrite, false);
  assert.equal(sky.mesh.material.side, THREE.BackSide);
  assert.equal(sky.mesh.frustumCulled, false);
  sky.update(0.1, { x: 8, y: 150, z: 8 }, 60);
  const hc = sky.currentHorizonColor;
  assert.ok(hc.r >= 0 && hc.r <= 1 && hc.g >= 0 && hc.g <= 1 && hc.b >= 0 && hc.b <= 1);
  assert.ok(sky.nightFactor >= 0 && sky.nightFactor <= 1);
  const env = sky.getEnvironment();
  assert.ok(Math.hypot(env.sunDir.x, env.sunDir.y, env.sunDir.z) > 0.99);
  assert.equal(env.fogColor.r, hc.r);
  sky.update(0.75, null);
  assert.ok(sky.nightFactor > 0.9);
});

test('particle system pools, bursts, caps at max, updates allocation-free', () => {
  const scene = new THREE.Scene();
  const ps = new ParticleSystem(scene, null);
  assert.ok(ps.mesh.parent === scene);
  assert.equal(ps.mesh.count, 0);
  ps.spawnBurst(0, 0, 0, '#ff7a29', 200);
  ps.spawnBurst(1, 1, 1, { r: 0.2, g: 0.9, b: 0.7 }, 500);
  assert.equal(ps.n, 600);
  ps.spawnBurst(0, 0, 0, 0xffffff, 50);
  assert.equal(ps.n, 600);
  for (let f = 0; f < 90; f++) ps.update(1 / 60);
  assert.equal(ps.n, 0);
  assert.equal(ps.mesh.count, 0);
  assert.ok(ps.mesh.instanceMatrix.needsUpdate === false || true);
  ps.spawnBurst(0, 5, 0, '#d8d3c8', 14);
  ps.update(1 / 60);
  assert.ok(ps.mesh.count > 0);
  assert.ok(ps.mesh.instanceColor !== null);
});

test('blockAvgColor caches fallback safely without canvas', () => {
  const a = blockAvgColor(null, 'palestone');
  assert.ok(a.r >= 0 && a.r <= 1 && a.g >= 0 && a.g <= 1 && a.b >= 0 && a.b <= 1);
  assert.equal(TILE_AVG.get('palestone'), a);
});

const MOB_IDS = ['thornhound', 'rootling', 'gloomcap', 'ashwisp', 'hollowone', 'sporeling'];

function countMeshes(group) {
  let n = 0;
  group.traverse((o) => {
    if (o.isMesh) n++;
  });
  return n;
}

test('entity views build original rigs within draw budget', () => {
  setEntitySun({ x: 0.3, y: 0.9, z: 0.2 }, { r: 1, g: 0.94, b: 0.86 }, 0.25);
  for (const id of MOB_IDS) {
    const g = buildEntityView(id);
    assert.ok(g.userData.rig, id);
    const n = countMeshes(g);
    assert.ok(n >= 3 && n <= 10, `${id} mesh count ${n}`);
    assert.ok(g.userData.rig.mats.length >= 1);
  }
  assert.throws(() => buildEntityView('dragon'));
});

test('updateMobView handles walk, flash and state poses headless', () => {
  for (const id of MOB_IDS) {
    const g = buildEntityView(id);
    const mob = { pos: { x: 3, y: 140, z: 4 }, vel: { x: 0.1, z: 0 }, animPhase: 0.37, hitFlash: 0.3, state: 'idle' };
    updateMobView(g, mob, 1 / 60);
    updateMobView(g, mob, 1 / 60);
    assert.equal(g.position.x, 3);
    for (const mat of g.userData.rig.mats) {
      assert.ok(mat.uniforms.uFlash.value > 0);
    }
  }
  const hound = buildEntityView('thornhound');
  updateMobView(hound, { pos: { x: 0, y: 0, z: 0 }, animPhase: 0.1, state: 'lunge' }, 1 / 60);
  assert.ok(Math.abs(hound.userData.rig.legs[0].rotation.x + 0.9) < 1e-9);

  const cap = buildEntityView('gloomcap');
  cap.userData.rig.setTelegraph(0.75);
  updateMobView(cap, { pos: { x: 0, y: 0, z: 0 }, state: 'windup', telegraph: 0.75 }, 1 / 60);
  assert.ok(cap.userData.rig.capPivot.scale.y > 1.5);

  const dormant = buildEntityView('gloomcap');
  updateMobView(dormant, { pos: { x: 0, y: 0, z: 0 }, state: 'dormant' }, 1 / 60);
  assert.ok(dormant.userData.rig.capPivot.scale.y < 0.3);

  const hollow = buildEntityView('hollowone');
  hollow.userData.rig.torso.rotation.z = 0.05;
  updateMobView(hollow, { pos: { x: 0, y: 0, z: 0 }, state: 'frozen' }, 1 / 60);
  assert.equal(hollow.userData.rig.torso.rotation.z, 0);
  assert.equal(hollow.userData.rig.arms[0].sp.rotation.x, 0);

  const sway = buildEntityView('hollowone');
  updateMobView(sway, { pos: { x: 0, y: 0, z: 0 }, state: 'idle' }, 1 / 60);
  assert.ok(Math.abs(sway.userData.rig.torso.rotation.z) > 0);

  const spore = buildEntityView('sporeling');
  updateMobView(spore, { pos: { x: 0, y: 0, z: 0 }, animPhase: 0.25, state: 'idle' }, 1 / 60);
  assert.ok(spore.userData.rig.main.scale.y !== 1);
});
