import * as THREE from '../../vendor/three.module.js';

const SUN = new THREE.Vector3(0.35, 0.85, 0.25).normalize();
const SUNCOL = new THREE.Color(0xfff1dc);
const AMB = new THREE.Color(0x3a3644);
const NIGHT = { value: 0 };
const CORE_EMBER = new THREE.Color(0xff7a29);

export function setEntitySun(dir, color, nightFactor) {
  SUN.set(dir.x, dir.y, dir.z).normalize();
  SUNCOL.setRGB(color.r, color.g, color.b);
  NIGHT.value = nightFactor;
}

const VERT = `
varying vec3 vN;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uFlash;
uniform float uAlpha;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform float uNight;
varying vec3 vN;
vec3 acesFilmic(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 N = normalize(vN);
  float ndl = max(dot(N, uSun), 0.0) * (1.0 - uNight * 0.92);
  float hemi = N.y * 0.5 + 0.5;
  vec3 light = uAmb * (0.35 + 0.65 * hemi) + uSunCol * ndl * 0.95;
  light = max(light, vec3(0.05));
  vec3 c = uColor * light + uEmissive;
  c = mix(c, vec3(1.0, 0.42, 0.32), uFlash);
  c = acesFilmic(c);
  gl_FragColor = vec4(pow(c, vec3(0.4545)), uAlpha);
}
`;

function makeMobMat(hex, opts) {
  const o = opts || {};
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hex) },
      uEmissive: { value: new THREE.Color(o.emissive || 0x000000) },
      uFlash: { value: 0 },
      uAlpha: { value: o.alpha === undefined ? 1 : o.alpha },
      uSun: { value: SUN },
      uSunCol: { value: SUNCOL },
      uAmb: { value: AMB },
      uNight: { value: NIGHT },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    lights: false,
    transparent: o.alpha !== undefined && o.alpha < 1,
  });
}

function flat(geo) {
  const ngeo = geo.toNonIndexed();
  ngeo.computeVertexNormals();
  geo.dispose();
  return ngeo;
}

function mkMesh(geo, mat, parent, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function pivot(parent, x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

function collectMats(group) {
  const list = [];
  group.traverse((o) => {
    if (o.isMesh) list.push(o.material);
  });
  return list;
}

const BUILDERS = {
  thornhound() {
    const g = new THREE.Group();
    const hide = makeMobMat('#4a4038');
    const dark = makeMobMat('#2e2622');
    const eye = makeMobMat('#201408', { emissive: 0xff7a29 });
    const body = new THREE.Group();
    g.add(body);
    mkMesh(new THREE.BoxGeometry(0.62, 0.42, 0.5), hide, body, 0, 0.55, 0.12);
    mkMesh(new THREE.BoxGeometry(0.4, 0.34, 0.44), hide, body, 0, 0.52, -0.36);
    const head = mkMesh(new THREE.BoxGeometry(0.28, 0.24, 0.38), hide, body, 0, 0.74, 0.46);
    head.rotation.x = -0.12;
    const crest = mkMesh(flat(new THREE.ConeGeometry(0.05, 0.36, 5)), dark, body, 0, 0.86, 0.02);
    crest.rotation.x = -2.3;
    mkMesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), eye, head, 0.08, 0.02, 0.2);
    mkMesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), eye, head, -0.08, 0.02, 0.2);
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const px = i % 2 === 0 ? 0.17 : -0.17;
      const pz = i < 2 ? 0.3 : -0.32;
      const lp = pivot(body, px, 0.6, pz);
      mkMesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), dark, lp, 0, -0.25, 0);
      legs.push(lp);
    }
    g.userData.rig = { type: 'thornhound', body, head, legs, t: 0 };
    return g;
  },

  rootling() {
    const g = new THREE.Group();
    const pebble = makeMobMat('#5c5560');
    const root = makeMobMat('#4a3624');
    const eye = makeMobMat('#140a18', { emissive: 0x8a76a0 });
    const body = new THREE.Group();
    g.add(body);
    mkMesh(flat(new THREE.SphereGeometry(0.17, 7, 5)), pebble, body, 0, 0.18, 0);
    const roots = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const rp = pivot(body, Math.cos(a) * 0.13, 0.16, Math.sin(a) * 0.13);
      rp.rotation.z = Math.cos(a) * 0.9;
      rp.rotation.x = -Math.sin(a) * 0.9;
      mkMesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), root, rp, 0, 0, 0.12);
      roots.push(rp);
    }
    mkMesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), eye, body, 0.06, 0.26, 0.15);
    mkMesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), eye, body, -0.06, 0.26, 0.15);
    g.userData.rig = { type: 'rootling', body, roots, t: 0 };
    return g;
  },

  gloomcap() {
    const g = new THREE.Group();
    const flesh = makeMobMat('#b9ae9c');
    const capMat = makeMobMat('#4a3855');
    const gillBase = new THREE.Color('#123c36');
    const gillMat = makeMobMat('#1a2f2a', { emissive: '#123c36' });
    const spot = makeMobMat('#8a76a0');
    const legs = [];
    for (let i = 0; i < 2; i++) {
      legs.push(mkMesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), flesh, g, i === 0 ? 0.08 : -0.08, 0.07, 0));
    }
    mkMesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), flesh, g, 0, 0.24, 0);
    const capPivot = pivot(g, 0, 0.36, 0);
    const cap = mkMesh(flat(new THREE.SphereGeometry(0.3, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2)), capMat, capPivot, 0, 0, 0);
    cap.scale.set(1, 0.72, 1);
    const gill = mkMesh(new THREE.CylinderGeometry(0.27, 0.24, 0.03, 9), gillMat, capPivot, 0, -0.01, 0);
    mkMesh(flat(new THREE.SphereGeometry(0.05, 5, 4)), spot, cap, 0.12, 0.18, 0.08);
    mkMesh(flat(new THREE.SphereGeometry(0.04, 5, 4)), spot, cap, -0.14, 0.15, -0.06);
    const rig = { type: 'gloomcap', capPivot, gillMat, gillBase, legs, t: 0, tk: 0, lr: 0, manualTele: null };
    rig.setTelegraph = (k) => {
      rig.manualTele = k;
    };
    g.userData.rig = rig;
    return g;
  },

  ashwisp() {
    const g = new THREE.Group();
    const bellMat = makeMobMat('#5a5260', { alpha: 0.85 });
    const coreMat = makeMobMat('#301408', { emissive: 0xff7a29 });
    const tendrilMat = makeMobMat('#3a3440');
    const body = new THREE.Group();
    g.add(body);
    const bell = mkMesh(flat(new THREE.SphereGeometry(0.3, 9, 6)), bellMat, body, 0, 0.9, 0);
    bell.scale.set(1, 0.72, 1);
    const core = mkMesh(flat(new THREE.SphereGeometry(0.11, 7, 5)), coreMat, body, 0, 0.88, 0);
    const tendrils = [];
    for (let i = 0; i < 3; i++) {
      const tp = pivot(body, (i - 1) * 0.14, 0.68, 0.05 * ((i % 2) * 2 - 1));
      mkMesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), tendrilMat, tp, 0, -0.2, 0);
      tendrils.push(tp);
    }
    mkMesh(new THREE.BoxGeometry(0.16, 0.03, 0.1), tendrilMat, body, 0.3, 0.98, 0);
    mkMesh(new THREE.BoxGeometry(0.16, 0.03, 0.1), tendrilMat, body, -0.3, 0.98, 0);
    g.userData.rig = { type: 'ashwisp', body, bell, core, coreMat, tendrils, baseBellY: 0.9, t: 0 };
    return g;
  },

  hollowone() {
    const g = new THREE.Group();
    const skin = makeMobMat('#57505c');
    const dark = makeMobMat('#33283f');
    const body = new THREE.Group();
    g.add(body);
    const legs = [];
    for (let i = 0; i < 2; i++) {
      const lp = pivot(body, i === 0 ? 0.09 : -0.09, 1.02, 0);
      mkMesh(new THREE.BoxGeometry(0.09, 1.02, 0.11), skin, lp, 0, -0.51, 0);
      legs.push(lp);
    }
    mkMesh(new THREE.BoxGeometry(0.26, 0.18, 0.16), dark, body, 0, 1.1, 0);
    const torso = mkMesh(new THREE.BoxGeometry(0.3, 0.85, 0.18), skin, body, 0, 1.62, 0);
    mkMesh(new THREE.BoxGeometry(0.24, 0.5, 0.03), dark, torso, 0, 0, -0.105);
    const head = mkMesh(flat(new THREE.SphereGeometry(0.13, 8, 6)), skin, body, 0, 2.22, 0.03);
    head.scale.set(0.85, 1.3, 0.95);
    head.rotation.x = 0.35;
    const arms = [];
    for (let i = 0; i < 2; i++) {
      const sp = pivot(body, i === 0 ? 0.19 : -0.19, 1.98, 0);
      mkMesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), skin, sp, 0, -0.275, 0);
      const elbow = pivot(sp, 0, -0.55, 0);
      mkMesh(new THREE.BoxGeometry(0.055, 0.58, 0.055), skin, elbow, 0, -0.29, 0);
      arms.push({ sp, elbow });
    }
    g.userData.rig = { type: 'hollowone', body, torso, head, legs, arms, t: 0 };
    return g;
  },

  sporeling() {
    const g = new THREE.Group();
    const puff = makeMobMat('#a89e8c');
    const foot = makeMobMat('#4a4038');
    const poreMat = makeMobMat('#12332e', { emissive: 0x46e0c8 });
    const body = new THREE.Group();
    g.add(body);
    const main = mkMesh(flat(new THREE.SphereGeometry(0.2, 8, 6)), puff, body, 0, 0.22, 0);
    mkMesh(flat(new THREE.SphereGeometry(0.09, 6, 4)), puff, body, 0.14, 0.34, 0.06);
    mkMesh(flat(new THREE.SphereGeometry(0.07, 6, 4)), puff, body, -0.13, 0.3, -0.07);
    mkMesh(new THREE.BoxGeometry(0.05, 0.06, 0.08), foot, body, 0.08, 0.03, 0.02);
    mkMesh(new THREE.BoxGeometry(0.05, 0.06, 0.08), foot, body, -0.08, 0.03, -0.02);
    mkMesh(flat(new THREE.SphereGeometry(0.03, 5, 4)), poreMat, main, 0, 0.21, 0);
    g.userData.rig = { type: 'sporeling', body, main, t: 0 };
    return g;
  },
};

export function buildEntityView(typeId) {
  const b = BUILDERS[typeId];
  if (!b) throw new Error(`unknown entity view: ${typeId}`);
  const g = b();
  g.userData.rig.mats = collectMats(g);
  return g;
}

export function updateMobView(group, mob, dt) {
  const rig = group.userData.rig;
  if (!rig || !rig.mats) return;
  const d = dt || 0;
  rig.t += d;
  const t = rig.t;
  const pos = mob.pos || {};
  if (typeof pos.x === 'number') {
    group.position.set(pos.x, typeof pos.y === 'number' ? pos.y : group.position.y, pos.z);
  }
  if (typeof mob.yaw === 'number') {
    group.rotation.y = mob.yaw;
  } else if (mob.vel && Math.abs(mob.vel.x) + Math.abs(mob.vel.z) > 0.05) {
    group.rotation.y = Math.atan2(mob.vel.x, mob.vel.z);
  }
  const flash = Math.min(1, (mob.hitFlash || mob.flashTimer || 0) * 4);
  for (let i = 0; i < rig.mats.length; i++) rig.mats[i].uniforms.uFlash.value = flash;
  const phase = mob.animPhase || 0;
  const st = mob.state || 'idle';
  const TAU = Math.PI * 2;

  if (rig.type === 'thornhound') {
    const sw = Math.sin(phase * TAU);
    if (st === 'lunge' || st === 'pounce') {
      for (let i = 0; i < 4; i++) rig.legs[i].rotation.x = i < 2 ? -0.9 : 0.9;
      rig.head.rotation.x = -0.5;
      rig.body.position.y = 0.08;
    } else {
      rig.legs[0].rotation.x = sw * 0.75;
      rig.legs[1].rotation.x = -sw * 0.75;
      rig.legs[2].rotation.x = -sw * 0.75;
      rig.legs[3].rotation.x = sw * 0.75;
      rig.head.rotation.x = -0.12;
      rig.body.position.y = Math.abs(Math.cos(phase * TAU)) * 0.05;
    }
  } else if (rig.type === 'rootling') {
    rig.body.rotation.z = Math.sin(phase * TAU * 3) * 0.12;
    rig.body.position.y = Math.abs(Math.sin(phase * TAU * 2)) * 0.06;
    for (let i = 0; i < rig.roots.length; i++) rig.roots[i].rotation.y = Math.sin(t * 9 + i * 2.1) * 0.2;
  } else if (rig.type === 'gloomcap') {
    let tk = rig.tk;
    if (st === 'windup') tk = rig.manualTele != null ? rig.manualTele : Math.min(1, tk + d * 2);
    else tk = Math.max(0, tk - d * 3);
    rig.tk = tk;
    if (st === 'lunge') rig.lr = Math.min(1, rig.lr + d * 8);
    else rig.lr = Math.max(0, rig.lr - d * 4);
    const closed = st === 'dormant' ? 1 : 0;
    rig.capPivot.scale.set(
      1 + tk * 0.45,
      1 - closed * 0.85 + tk * 0.9 * (1 - closed),
      1 + tk * 0.45
    );
    rig.capPivot.rotation.x = rig.lr * 0.8;
    rig.gillMat.uniforms.uEmissive.value.copy(rig.gillBase).multiplyScalar(0.25 + tk * 1.6 + rig.lr);
  } else if (rig.type === 'ashwisp') {
    rig.bell.position.y = rig.baseBellY + Math.sin(t * 2.1) * 0.06;
    rig.core.position.y = rig.baseBellY - 0.02 + Math.sin(t * 2.1) * 0.06;
    for (let i = 0; i < rig.tendrils.length; i++) rig.tendrils[i].rotation.x = Math.sin(t * 3 + i * 1.9) * 0.35;
    const pulse = 1 + 0.25 * Math.sin(t * 5);
    rig.core.scale.setScalar(pulse);
    rig.coreMat.uniforms.uEmissive.value.copy(CORE_EMBER).multiplyScalar(pulse);
  } else if (rig.type === 'hollowone') {
    if (st === 'frozen' || st === 'lit') {
      rig.torso.rotation.z = 0;
      rig.head.rotation.x = 0.35;
      for (let i = 0; i < 2; i++) {
        rig.arms[i].sp.rotation.set(0, 0, 0);
        rig.arms[i].elbow.rotation.set(0, 0, 0);
        rig.legs[i].rotation.set(0, 0, 0);
      }
      return;
    }
    rig.torso.rotation.z = Math.sin(t * 0.9) * 0.02;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      rig.arms[i].sp.rotation.x = Math.sin(t * 0.7 + i * 2.4) * 0.03;
      rig.arms[i].elbow.rotation.x = 0.06 * s;
      rig.legs[i].rotation.x = Math.sin(t * 0.5 + i * Math.PI) * 0.01;
    }
  } else if (rig.type === 'sporeling') {
    const ph = (phase + t * 0.5) % 1;
    let sy = 1 + 0.25 * Math.sin(ph * TAU);
    if (mob.state === 'hurt') sy = 0.8;
    const sxz = 1 / Math.sqrt(sy);
    rig.main.scale.set(sxz, sy, sxz);
    rig.body.position.y = Math.max(0, Math.sin(ph * Math.PI)) * 0.16;
  }
}

