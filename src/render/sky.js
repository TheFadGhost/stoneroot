import * as THREE from '../../vendor/three.module.js';

const DAY_ZENITH = { r: 0.353, g: 0.4, b: 0.471 };
const NIGHT_ZENITH = { r: 0.027, g: 0.02, b: 0.047 };
const DAY_HORIZON = { r: 0.541, g: 0.518, b: 0.58 };
const NIGHT_HORIZON = { r: 0.141, g: 0.102, b: 0.18 };
const DUSK_EMBER = { r: 0.69, g: 0.337, b: 0.164 };

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function computeSunDirection(timeOfDay) {
  const a = timeOfDay * Math.PI * 2;
  const x = Math.cos(a);
  const y = Math.sin(a);
  const z = 0.22;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}

export function computeNightFactor(timeOfDay) {
  const a = timeOfDay * Math.PI * 2;
  const e = Math.sin(a);
  let t = clamp01((0.08 - e) / 0.22);
  t = t * t * (3 - 2 * t);
  return t;
}

function mix3(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export function horizonColorAt(timeOfDay) {
  const nf = computeNightFactor(timeOfDay);
  const e = Math.sin(timeOfDay * Math.PI * 2);
  const dusk = clamp01(1 - Math.abs(e) * 3.2);
  let c = mix3(DAY_HORIZON, NIGHT_HORIZON, nf);
  c = mix3(c, DUSK_EMBER, dusk * 0.45);
  return c;
}

const VERT = `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = `
uniform float uTod;
uniform float uNight;
uniform float uDusk;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uHorizon;
varying vec3 vDir;
float h21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float h31(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453123);
}
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i);
  float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0));
  float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 sd = normalize(uSunDir);
  float h = d.y;
  float horizMask = pow(1.0 - clamp(h, 0.0, 1.0), 2.2);
  vec3 zenDay = vec3(0.353, 0.4, 0.471);
  vec3 zenNight = vec3(0.027, 0.02, 0.047);
  vec3 col = mix(mix(zenDay, zenNight, uNight), uHorizon, horizMask);
  float sunAmt = max(dot(d, sd), 0.0);
  float azW = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sd.x, 0.001, sd.z))), 0.0);
  col += vec3(0.85, 0.35, 0.12) * pow(azW, 3.0) * pow(1.0 - clamp(abs(h), 0.0, 1.0), 3.0) * uDusk * 0.8;
  float disc = smoothstep(0.99930, 0.99965, sunAmt);
  col += mix(vec3(1.0, 0.82, 0.6), vec3(1.0, 0.97, 0.92), disc * 0.7) * disc * (1.0 - uNight * 0.85) * 2.4;
  col += vec3(0.9, 0.5, 0.25) * pow(sunAmt, 180.0) * 0.5 * (1.0 - uNight);
  float moonAmt = max(dot(d, -sd), 0.0);
  float mdisc = smoothstep(0.99855, 0.99900, moonAmt);
  float moonVis = clamp(uNight + 0.15, 0.0, 1.0);
  if (mdisc > 0.0 && moonVis > 0.01) {
    float blotch = h31(floor(d * 260.0));
    vec3 husk = vec3(0.62, 0.58, 0.53) * (0.72 + 0.28 * blotch);
    col = mix(col, husk, mdisc * moonVis);
    col += vec3(0.05, 0.045, 0.04) * mdisc * moonVis;
  }
  col += vec3(0.22, 0.2, 0.18) * pow(moonAmt, 300.0) * 0.5 * moonVis;
  vec3 sp = floor(d * 220.0);
  float sh = h31(sp);
  float star = step(0.9975, sh) * uNight * clamp(h * 2.5, 0.0, 1.0) * (0.55 + 0.45 * sin(uTime * 3.0 + sh * 40.0));
  col += vec3(max(star, 0.0)) * 0.9;
  if (h > 0.02) {
    vec2 cuv = d.xz / (d.y * 0.6 + 0.25) * 0.9 + vec2(uTime * 0.004, uTime * 0.0016);
    float cl = fbm(cuv * 1.7);
    float cmask = smoothstep(0.52, 0.78, cl) * clamp(h * 3.0, 0.0, 1.0);
    vec3 cloudCol = mix(col * 0.82, uHorizon * 1.06, 0.45);
    col = mix(col, cloudCol, cmask * 0.42);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export class SkyDome {
  constructor(scene) {
    this.uniforms = {
      uTod: { value: 0 },
      uNight: { value: 0 },
      uDusk: { value: 0 },
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uHorizon: { value: new THREE.Color(0.5, 0.48, 0.54) },
    };
    const geo = new THREE.SphereGeometry(800, 32, 20);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      lights: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.currentHorizonColor = { r: DAY_HORIZON.r, g: DAY_HORIZON.g, b: DAY_HORIZON.b };
    this.nightFactor = 0;
    this.sunDirection = { x: 1, y: 0, z: 0 };
    if (scene) scene.add(this.mesh);
  }

  update(timeOfDay, camPos, timeSeconds) {
    this.uniforms.uTod.value = timeOfDay;
    const sd = computeSunDirection(timeOfDay);
    this.sunDirection = sd;
    this.uniforms.uSunDir.value.set(sd.x, sd.y, sd.z);
    this.nightFactor = computeNightFactor(timeOfDay);
    this.uniforms.uNight.value = this.nightFactor;
    const e = Math.sin(timeOfDay * Math.PI * 2);
    this.uniforms.uDusk.value = clamp01(1 - Math.abs(e) * 3.5);
    const hc = horizonColorAt(timeOfDay);
    this.currentHorizonColor = hc;
    this.uniforms.uHorizon.value.setRGB(hc.r, hc.g, hc.b);
    this.uniforms.uTime.value = timeSeconds === undefined ? timeOfDay * 600 : timeSeconds;
    if (camPos) this.mesh.position.set(camPos.x, camPos.y, camPos.z);
    return this;
  }

  getEnvironment() {
    return {
      sunDir: { ...this.sunDirection },
      nightFactor: this.nightFactor,
      fogColor: { ...this.currentHorizonColor },
    };
  }

  dispose(scene) {
    if (scene) scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
