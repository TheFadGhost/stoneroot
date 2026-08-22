import * as THREE from '../../vendor/three.module.js';
import { MAX_DYNAMIC_POINT_LIGHTS } from '../config.js';
import { ATLAS_META } from './atlas.js';

const VERT = `
attribute float tiles;
attribute float ao;
attribute float sky;
attribute float blk;
attribute vec3 glow;
varying vec2 vUv;
varying float vTile;
varying float vAo;
varying float vSky;
varying float vBlk;
varying vec3 vGlow;
varying vec3 vNorm;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vTile = tiles;
  vAo = ao;
  vSky = sky;
  vBlk = blk;
  vGlow = glow;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNorm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = `
#define MAXL ${MAX_DYNAMIC_POINT_LIGHTS}
#define TPX ${ATLAS_META.tileSize}.0
uniform sampler2D uAtlas;
uniform float uTilesPerRow;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uNightFactor;
uniform float uTime;
uniform vec3 uCamPos;
uniform int uPointLightCount;
uniform vec4 uPointLights[MAXL];
uniform vec3 uPointLightColors[MAXL];
varying vec2 vUv;
varying float vTile;
varying float vAo;
varying float vSky;
varying float vBlk;
varying vec3 vGlow;
varying vec3 vNorm;
varying vec3 vWorld;
float hashDither(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec3 acesFilmic(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  float pad = 0.5 / (uTilesPerRow * TPX);
  vec2 fuv = clamp(fract(vUv), pad, 1.0 - pad);
  float ti = floor(vTile + 0.5);
  float col = mod(ti, uTilesPerRow);
  float row = floor(ti / uTilesPerRow);
  vec2 auv = (vec2(col, row) + fuv) / uTilesPerRow;
  vec4 tex = texture2D(uAtlas, auv);
  if (tex.a < 0.5) discard;
  vec3 N = normalize(vNorm);
  float skyC = clamp(vSky, 0.0, 1.0);
  float blkC = clamp(vBlk, 0.0, 1.0);
  float ndl = max(dot(N, uSunDir), 0.0);
  float dayVis = 1.0 - uNightFactor * 0.92;
  vec3 sunTerm = uSunColor * ndl * (0.15 + 0.85 * skyC) * pow(skyC, 1.35) * dayVis;
  vec3 ambTerm = uAmbient * mix(0.30, 1.0, skyC);
  vec3 torchRamp = mix(vec3(0.88, 0.74, 0.62), vec3(1.0, 0.698, 0.42), smoothstep(0.0, 1.0, blkC));
  vec3 torchTerm = pow(blkC, 1.4) * torchRamp * 1.35;
  vec3 pointSum = vec3(0.0);
  for (int i = 0; i < MAXL; i++) {
    if (i >= uPointLightCount) break;
    vec3 dv = vWorld - uPointLights[i].xyz;
    float dist = length(dv);
    float rad = uPointLights[i].w;
    float att = pow(clamp(1.0 - dist / max(rad, 0.0001), 0.0, 1.0), 2.0) / (1.0 + dist * dist * 0.18);
    pointSum += uPointLightColors[i] * att;
  }
  float fs;
  if (N.y > 0.5) fs = 1.0;
  else if (N.y < -0.5) fs = 0.58;
  else if (abs(N.z) > 0.5) fs = 0.82;
  else fs = 0.74;
  vec3 light = sunTerm + ambTerm;
  light = max(light, torchTerm);
  light += pointSum;
  vec3 lit = tex.rgb * light * vAo * fs;
  float pulse = 1.15 + 0.12 * sin(uTime * 2.2 + dot(vWorld.xz, vec2(0.7, 1.3)));
  vec3 fin = lit + vGlow * pulse;
  float distC = length(vWorld - uCamPos);
  float hb = clamp((100.0 - vWorld.y) * 0.004, 0.0, 0.6) + clamp((100.0 - uCamPos.y) * 0.004, 0.0, 0.6);
  float fogF = 1.0 - exp(-pow(distC * uFogDensity * (1.0 + hb), 1.5));
  fin = mix(fin, uFogColor, clamp(fogF, 0.0, 1.0));
  fin = acesFilmic(fin);
  fin = pow(fin, vec3(0.4545));
  fin += (hashDither(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(fin, 1.0);
}
`;

function baseUniforms(atlas) {
  return {
    uAtlas: { value: atlas ? atlas.texture : null },
    uTilesPerRow: { value: ATLAS_META.tilesPerRow },
    uFogColor: { value: new THREE.Color(0x141220) },
    uFogDensity: { value: 0.028 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(0xfff1dc) },
    uAmbient: { value: new THREE.Color(0x3a3644) },
    uNightFactor: { value: 0 },
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uPointLightCount: { value: 0 },
    uPointLights: { value: Array.from({ length: MAX_DYNAMIC_POINT_LIGHTS }, () => new THREE.Vector4(0, -9999, 0, 1)) },
    uPointLightColors: { value: Array.from({ length: MAX_DYNAMIC_POINT_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  };
}

export function createTerrainMaterials(atlas) {
  const uniforms = baseUniforms(atlas);
  const opaque = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
    lights: false,
  });
  const cutout = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    lights: false,
  });
  opaque.toneMapped = false;
  cutout.toneMapped = false;
  return { opaque, cutout };
}

export function updateEnvironmentUniforms(materials, env) {
  const mats = [materials.opaque, materials.cutout];
  for (let m = 0; m < mats.length; m++) {
    const u = mats[m].uniforms;
    u.uSunDir.value.set(env.sunDir.x, env.sunDir.y, env.sunDir.z).normalize();
    u.uSunColor.value.setRGB(env.sunColor.r, env.sunColor.g, env.sunColor.b);
    u.uAmbient.value.setRGB(env.ambient.r, env.ambient.g, env.ambient.b);
    u.uFogColor.value.setRGB(env.fogColor.r, env.fogColor.g, env.fogColor.b);
    u.uFogDensity.value = env.fogDensity;
    u.uNightFactor.value = env.nightFactor;
    u.uTime.value = env.time;
    u.uCamPos.value.set(env.camPos.x, env.camPos.y, env.camPos.z);
    const n = Math.min(env.pointLights.length, MAX_DYNAMIC_POINT_LIGHTS);
    u.uPointLightCount.value = n;
    for (let i = 0; i < n; i++) {
      const pl = env.pointLights[i];
      u.uPointLights.value[i].set(pl.x, pl.y, pl.z, pl.radius);
      u.uPointLightColors.value[i].setRGB(pl.r, pl.g, pl.b);
    }
    for (let i = n; i < MAX_DYNAMIC_POINT_LIGHTS; i++) {
      u.uPointLights.value[i].set(0, -9999, 0, 1);
      u.uPointLightColors.value[i].setRGB(0, 0, 0);
    }
  }
}

export function faceShadeForNormal(nx, ny, nz) {
  if (ny > 0.5) return 1.0;
  if (ny < -0.5) return 0.58;
  if (Math.abs(nz) > 0.5) return 0.82;
  return 0.74;
}

export function torchWarmRamp(t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const s = k * k * (3 - 2 * k);
  return { r: 0.88 + (1.0 - 0.88) * s, g: 0.74 + (0.698 - 0.74) * s, b: 0.62 + (0.42 - 0.62) * s };
}

export function fogFactorExp(dist, density, heightBias) {
  const f = 1 - Math.exp(-Math.pow(Math.max(0, dist) * density * (1 + heightBias), 1.5));
  return Math.max(0, Math.min(1, f));
}

export function acesApprox(x) {
  const c = x < 0 ? 0 : x;
  const v = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return Math.max(0, Math.min(1, v));
}

export function hashDither(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
