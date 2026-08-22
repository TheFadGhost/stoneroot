import { makeRng } from '../world/noise.js';

const MATS = new Set(['soft', 'stone', 'wood', 'leaf', 'gravel', 'glassy']);
const MOBS = new Set(['thornhound', 'rootling', 'gloomcap', 'ashwisp', 'hollowone', 'sporeling']);
const BAND_IDX = { thornwood: 0, loamhollows: 1, fungaldrifts: 2, emberdeep: 3, stillcore: 4 };
const DRONE_LVL = [0.05, 0.3, 0.5, 0.72, 1];

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function sysContext() {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!g) return null;
  const AC = g.AudioContext || (typeof window !== 'undefined' ? window.webkitAudioContext : null);
  return AC ? new AC() : null;
}

export class AudioEngine {
  constructor(opts = {}) {
    this._factory = opts.contextFactory || null;
    this._seed = (opts.seed | 0) || 20260822;
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.sfx = null;
    this.amb = null;
    this.whiteBuf = null;
    this.brownBuf = null;
    this.dripIn = null;
    this.hbBus = null;
    this._ambNodes = null;
    this._persist = [];
    this._ready = false;
    this._dead = false;
    this._vol = { master: 0.9, sfx: 0.9, ambience: 0.8 };
    this._in = { depthBand: 'thornwood', isNight: false, threat: 0, nearbyHostiles: 0, playerLight: 0 };
    this._cur = { drone: 0, wind: 0, tension: 0 };
    this._tgt = { drone: 0, wind: 0, tension: 0 };
    this._hbT = 0.2;
    this._dripT = 8;
    this._groanT = 32;
    this._lpos = null;
    this._lyaw = 0;
    this.rv = makeRng(this._seed ^ 0x51ed270b);
    this.nr = makeRng(this._seed ^ 0x9e3779b9);
  }

  get ready() {
    return this._ready;
  }

  unlock() {
    if (this._ready || this._dead) return;
    let c = null;
    try {
      c = this._factory ? this._factory() : sysContext();
    } catch (e) {
      c = null;
    }
    if (!c || typeof c.createGain !== 'function' || typeof c.createBuffer !== 'function') return;
    this.ctx = c;
    const now = c.currentTime;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.master = c.createGain();
    this.sfx = c.createGain();
    this.amb = c.createGain();
    this.master.connect(this.comp);
    this.comp.connect(c.destination);
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this._makeBuffers(c);
    this._buildAmbience(c, now);
    this.master.gain.setValueAtTime(this._vol.master, now);
    this.sfx.gain.setValueAtTime(this._vol.sfx, now);
    this.amb.gain.setValueAtTime(this._vol.ambience, now);
    if (c.state === 'suspended' && typeof c.resume === 'function') {
      try {
        const r = c.resume();
        if (r && r.catch) r.catch(() => {});
      } catch (e) {}
    }
    this._applyListener();
    this._ready = true;
  }

  dispose() {
    this._dead = true;
    this._ready = false;
    const now = this.ctx ? this.ctx.currentTime : 0;
    for (const n of this._persist) {
      try {
        n.stop(now);
      } catch (e) {}
    }
    this._persist.length = 0;
    this._ambNodes = null;
    this.hbBus = null;
    this.dripIn = null;
    const c = this.ctx;
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.sfx = null;
    this.amb = null;
    this.whiteBuf = null;
    this.brownBuf = null;
    if (c && typeof c.close === 'function') {
      try {
        const r = c.close();
        if (r && r.catch) r.catch(() => {});
      } catch (e) {}
    }
  }

  setVolume(kind, v) {
    const k = kind === 'sfx' || kind === 'ambience' || kind === 'master' ? kind : 'master';
    const val = clamp(Number(v) || 0, 0, 1);
    this._vol[k] = val;
    if (!this._ready) return;
    const bus = k === 'master' ? this.master : k === 'sfx' ? this.sfx : this.amb;
    if (bus) bus.gain.setTargetAtTime(val, this.ctx.currentTime, 0.03);
  }

  setListener(pos, yaw) {
    if (pos) this._lpos = { x: Number(pos.x) || 0, y: Number(pos.y) || 0, z: Number(pos.z) || 0 };
    this._lyaw = Number(yaw) || 0;
    if (this._ready) this._applyListener();
  }

  _applyListener() {
    const L = this.ctx && this.ctx.listener;
    if (!L) return;
    const p = this._lpos || { x: 0, y: 0, z: 0 };
    const fx = -Math.sin(this._lyaw);
    const fz = -Math.cos(this._lyaw);
    if (L.positionX && L.positionY && L.positionZ) {
      L.positionX.value = p.x;
      L.positionY.value = p.y;
      L.positionZ.value = p.z;
      if (L.forwardX) {
        L.forwardX.value = fx;
        L.forwardY.value = 0;
        L.forwardZ.value = fz;
        L.upX.value = 0;
        L.upY.value = 1;
        L.upZ.value = 0;
      }
    } else if (L.setPosition) {
      L.setPosition(p.x, p.y, p.z);
      if (L.setOrientation) L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  setAmbience(state) {
    if (!state) return;
    const band = Object.prototype.hasOwnProperty.call(BAND_IDX, state.depthBand) ? state.depthBand : 'loamhollows';
    this._in.depthBand = band;
    this._in.isNight = !!state.isNight;
    this._in.threat = clamp(Number(state.threat) || 0, 0, 1);
    this._in.nearbyHostiles = state.nearbyHostiles | 0;
    this._in.playerLight = clamp(Number(state.playerLight) || 0, 0, 15);
    const idx = BAND_IDX[band];
    const surf = 1 - idx / 4;
    this._tgt.drone = DRONE_LVL[idx];
    this._tgt.wind = (this._in.isNight ? 0.5 : 0.18) * (0.25 + 0.75 * surf);
    const gate = this._in.nearbyHostiles > 0 && this._in.threat > 0.35;
    const inten = clamp(this._in.threat * 0.6 + (Math.min(this._in.nearbyHostiles, 3) / 3) * 0.4, 0, 1);
    this._tgt.tension = gate ? inten * (1 - (0.5 * this._in.playerLight) / 15) : 0;
  }

  update(dt) {
    if (!this._ready || this._dead) return;
    const d = clamp(Number(dt) || 0, 0, 2);
    if (d <= 0) return;
    const k = 1 - Math.exp(-d / 2);
    const cur = this._cur;
    const tgt = this._tgt;
    cur.drone += (tgt.drone - cur.drone) * k;
    cur.wind += (tgt.wind - cur.wind) * k;
    cur.tension += (tgt.tension - cur.tension) * k;
    const now = this.ctx.currentTime;
    const A = this._ambNodes;
    A.droneGain.gain.setTargetAtTime(cur.drone * 0.85, now, 0.1);
    A.subGain.gain.setTargetAtTime(cur.drone * 0.5, now, 0.1);
    A.windGain.gain.setTargetAtTime(cur.wind * 0.5, now, 0.1);
    A.tAG.gain.setTargetAtTime(cur.tension * 0.5, now, 0.1);
    A.tBG.gain.setTargetAtTime(cur.tension * 0.5, now, 0.1);
    A.tremDepth.gain.setTargetAtTime(cur.tension * 0.42, now, 0.1);
    const idx = BAND_IDX[this._in.depthBand];
    if (cur.tension > 0.12 && this._in.nearbyHostiles > 0) {
      this._hbT -= d;
      let guard = 0;
      while (this._hbT <= 0 && guard++ < 8) {
        const v = 0.25 + 0.45 * Math.min(cur.tension, 1);
        this._thump(this.hbBus, now, v);
        this._thump(this.hbBus, now + 0.26 - 0.08 * Math.min(cur.tension, 1), v * 0.6);
        this._hbT += 1.1 - 0.55 * Math.min(cur.tension, 1);
      }
    } else {
      this._hbT = Math.min(this._hbT, 0.35);
    }
    if (idx === undefined || idx > 0) {
      this._dripT -= d;
      let g = 0;
      while (this._dripT <= 0 && g++ < 4) {
        this._dripVoice(this.sfx, now);
        this._dripT += 6 + this.rv() * 8;
      }
    }
    if (this._in.isNight && idx === 0) {
      this._groanT -= d;
      let g = 0;
      while (this._groanT <= 0 && g++ < 4) {
        const base = this._lpos || { x: 0, y: 64, z: 0 };
        const a = this.rv() * Math.PI * 2;
        const r = 16 + this.rv() * 14;
        const pos = { x: base.x + Math.cos(a) * r, y: base.y - 2 + this.rv() * 6, z: base.z + Math.sin(a) * r };
        this._groanVoice(this._out(pos), now);
        this._groanT += 20 + this.rv() * 30;
      }
    }
  }

  footstep(mat, speed = 1) {
    if (!this._ready) return;
    this._stepVoice(mat, this.sfx, this.ctx.currentTime, Number(speed) || 1, false, 1);
  }

  dig(mat) {
    if (!this._ready) return;
    this._stepVoice(mat, this.sfx, this.ctx.currentTime, 1, true, 0.5);
  }

  breakBlock(mat) {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const m = MATS.has(mat) ? mat : 'soft';
    const out = this.sfx;
    this._stepVoice(m, out, t, 1, false, 1.5);
    const dn = this._src(t, 0.32, 1, false);
    const dbp = this._f('bandpass', 1700, 0.7);
    dbp.frequency.setValueAtTime(1700, t);
    dbp.frequency.linearRampToValueAtTime(380, t + 0.3);
    const dg = this._g(0);
    dn.connect(dbp);
    dbp.connect(dg);
    dg.connect(out);
    this._p(dg.gain, t, 0.5, 0.004, 0.3);
    this._ping(out, t, 62, 0.5, 0.15);
    if (m === 'stone') {
      const rn = this._src(t, 0.55, 0.7, true);
      const rlp = this._f('lowpass', 480, 0.7);
      const rg = this._g(0);
      rn.connect(rlp);
      rlp.connect(rg);
      rg.connect(out);
      this._p(rg.gain, t, 0.3, 0.01, 0.45);
    } else if (m === 'wood') {
      const k = 2 + ((this.rv() * 2) | 0);
      for (let i = 0; i < k; i++) {
        const ti = t + this.rv() * 0.12;
        const o = this._o('sawtooth', 280 + this.rv() * 440);
        const lp = this._f('lowpass', 2400, 0.7);
        const g = this._g(0);
        o.connect(lp);
        lp.connect(g);
        g.connect(out);
        this._p(g.gain, ti, 0.26, 0.002, 0.03);
        this._stop(o, ti + 0.12);
      }
    } else if (m === 'soft') {
      const cn = this._src(t, 0.4, 0.9, false);
      const clp = this._f('lowpass', 340, 1.4);
      const lfo = this._o('sine', 9);
      const ld = this._g(140);
      lfo.connect(ld);
      ld.connect(clp.frequency);
      const cg = this._g(0);
      cn.connect(clp);
      clp.connect(cg);
      cg.connect(out);
      this._p(cg.gain, t, 0.4, 0.01, 0.38);
      this._stop(lfo, t + 0.6);
    } else if (m === 'glassy') {
      this._ping(out, t, 2600, 0.09, 0.3);
      this._ping(out, t + 0.03, 3400, 0.06, 0.25);
    }
  }

  place(mat) {
    if (!this._ready) return;
    this._placeVoice(MATS.has(mat) ? mat : 'soft', this.sfx, this.ctx.currentTime);
  }

  hurt() {
    if (!this._ready) return;
    this._hurtVoice(this.sfx, this.ctx.currentTime);
  }

  attackHit() {
    if (!this._ready) return;
    this._hitVoice(this.sfx, this.ctx.currentTime);
  }

  pickup() {
    if (!this._ready) return;
    const out = this.sfx;
    const t = this.ctx.currentTime;
    this._pluck(out, t, 440, 0.3);
    this._pluck(out, t + 0.09, 660, 0.26);
  }

  craft() {
    if (!this._ready) return;
    this._craftVoice(this.sfx, this.ctx.currentTime);
  }

  mobVocal(typeId, pos) {
    if (!this._ready) return;
    if (!MOBS.has(typeId)) return;
    this._mobVoice(typeId, this._out(pos), this.ctx.currentTime);
  }

  playPositional(kind, pos) {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos);
    if (MATS.has(kind)) {
      this._stepVoice(kind, out, t, 1, false, 1);
      return;
    }
    switch (kind) {
      case 'drip':
        this._dripVoice(out, t);
        return;
      case 'groan':
        this._groanVoice(out, t);
        return;
      case 'hurt':
        this._hurtVoice(out, t);
        return;
      case 'attackHit':
      case 'hit':
        this._hitVoice(out, t);
        return;
      case 'pickup':
        this._pluck(out, t, 440, 0.3);
        this._pluck(out, t + 0.09, 660, 0.26);
        return;
      case 'craft':
        this._craftVoice(out, t);
        return;
      case 'place':
        this._placeVoice('stone', out, t);
        return;
      default:
        if (MOBS.has(kind)) this._mobVoice(kind, out, t);
        else this._stepVoice('soft', out, t, 1, false, 1);
    }
  }

  _mobVoice(type, out, t) {
    if (type === 'thornhound') {
      const o = this._o('sawtooth', 70);
      o.frequency.setValueAtTime(70, t);
      o.frequency.linearRampToValueAtTime(46, t + 0.6);
      const lp = this._f('lowpass', 400, 0.8);
      const amp = this._g(0.3);
      const lfo = this._o('sine', 13);
      const ld = this._g(0.28);
      lfo.connect(ld);
      ld.connect(amp.gain);
      o.connect(lp);
      lp.connect(amp);
      amp.connect(out);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.linearRampToValueAtTime(0.5, t + 0.08);
      amp.gain.setTargetAtTime(0.0001, t + 0.18, 0.16);
      this._stop(lfo, t + 0.7);
      this._stop(o, t + 0.7);
    } else if (type === 'rootling') {
      const n = 6 + ((this.rv() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const tb = t + i * (0.03 + this.rv() * 0.03);
        const car = this._o('sine', 2000 + this.rv() * 2000);
        const mod = this._o('sine', 80 + this.rv() * 80);
        const md = this._g(200 + this.rv() * 500);
        mod.connect(md);
        md.connect(car.frequency);
        const g = this._g(0);
        car.connect(g);
        g.connect(out);
        this._p(g.gain, tb, 0.12 + this.rv() * 0.08, 0.003, 0.02 + this.rv() * 0.02);
        this._stop(car, tb + 0.1);
        this._stop(mod, tb + 0.1);
      }
    } else if (type === 'gloomcap') {
      const o = this._o('sine', 500);
      o.frequency.setValueAtTime(500, t);
      o.frequency.linearRampToValueAtTime(80, t + 0.12);
      const g = this._g(0);
      o.connect(g);
      g.connect(out);
      this._p(g.gain, t, 0.45, 0.005, 0.1);
      this._stop(o, t + 0.4);
      const sn = this._src(t + 0.02, 0.1, 1, false);
      const slp = this._f('lowpass', 900, 0.7);
      const sg = this._g(0);
      sn.connect(slp);
      slp.connect(sg);
      sg.connect(out);
      this._p(sg.gain, t + 0.02, 0.2, 0.004, 0.08);
    } else if (type === 'ashwisp') {
      const n = this._src(t, 1.2, 1, false);
      const bp = this._f('bandpass', 300, 2.2);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.linearRampToValueAtTime(1800, t + 0.5);
      bp.frequency.linearRampToValueAtTime(300, t + 1.1);
      const g = this._g(0);
      n.connect(bp);
      bp.connect(g);
      g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.3);
      g.gain.setTargetAtTime(0.0001, t + 0.35, 0.3);
      for (const f of [880, 887]) {
        const o = this._o('sine', f);
        const og = this._g(0);
        o.connect(og);
        og.connect(out);
        og.gain.setValueAtTime(0.0001, t);
        og.gain.linearRampToValueAtTime(0.05, t + 0.4);
        og.gain.setTargetAtTime(0.0001, t + 0.45, 0.3);
        this._stop(o, t + 1.4);
      }
    } else if (type === 'hollowone') {
      const o = this._o('sine', 55);
      const g = this._g(0);
      o.connect(g);
      g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.5);
      g.gain.setTargetAtTime(0.0001, t + 0.7, 0.35);
      this._stop(o, t + 1.6);
      for (const f of [210, 222]) {
        const s = this._o('sine', f);
        const sg = this._g(0);
        s.connect(sg);
        sg.connect(out);
        this._p(sg.gain, t + 0.1, 0.045, 0.3, 0.9);
        this._stop(s, t + 1.5);
      }
    } else if (type === 'sporeling') {
      const pn = this._src(t, 0.12, 1, false);
      const pbp = this._f('bandpass', 900, 1);
      const pg = this._g(0);
      pn.connect(pbp);
      pbp.connect(pg);
      pg.connect(out);
      this._p(pg.gain, t, 0.25, 0.01, 0.1);
      const o = this._o('sine', 400);
      o.frequency.setValueAtTime(400, t + 0.03);
      o.frequency.linearRampToValueAtTime(700, t + 0.17);
      const og = this._g(0);
      o.connect(og);
      og.connect(out);
      this._p(og.gain, t + 0.03, 0.2, 0.01, 0.12);
      this._stop(o, t + 0.5);
    }
  }

  _stepVoice(mat, out, t, speed, short, gmul) {
    const m = MATS.has(mat) ? mat : 'soft';
    const s = clamp(speed, 0.4, 1.8);
    const gain = gmul * ((short ? 0.4 : 0.72) * (0.78 + 0.3 * Math.min(s, 1.5)));
    const br = 0.94 + 0.14 * s;
    if (m === 'soft') {
      const n = this._src(t, short ? 0.06 : 0.09, br, false);
      const lp = this._f('lowpass', short ? 150 : 120, 0.7);
      const g = this._g(0);
      n.connect(lp);
      lp.connect(g);
      g.connect(out);
      this._p(g.gain, t, gain * 0.95, 0.004, short ? 0.05 : 0.09);
      const o = this._o('sine', 70 + this.rv() * 18);
      const og = this._g(0);
      o.connect(og);
      og.connect(out);
      this._p(og.gain, t, gain * 0.3, 0.004, 0.07);
      this._stop(o, t + 0.2);
    } else if (m === 'stone') {
      const n = this._src(t, 0.05, (1 + this.rv() * 0.2) * br, false);
      const bp = this._f('bandpass', 900 * br, 1.1);
      const g = this._g(0);
      n.connect(bp);
      bp.connect(g);
      g.connect(out);
      this._p(g.gain, t, gain * 0.6, 0.002, 0.045);
      const n2 = this._src(t, 0.03, 1.3 * br, false);
      const hp = this._f('highpass', 2600, 0.7);
      const g2 = this._g(0);
      n2.connect(hp);
      hp.connect(g2);
      g2.connect(out);
      this._p(g2.gain, t, gain * 0.18, 0.001, 0.03);
    } else if (m === 'wood') {
      const det = () => 1 + (this.rv() * 2 - 1) * 0.08;
      this._ping(out, t, 180 * det(), gain * 0.55, 0.11);
      this._ping(out, t, 240 * det(), gain * 0.36, 0.09);
      const n = this._src(t, 0.02, 1.4, false);
      const hp = this._f('highpass', 3000, 0.7);
      const g = this._g(0);
      n.connect(hp);
      hp.connect(g);
      g.connect(out);
      this._p(g.gain, t, gain * 0.12, 0.001, 0.02);
    } else if (m === 'leaf') {
      const n = this._src(t, 0.06, 1 + this.rv() * 0.3, false);
      const hp = this._f('highpass', 1900 * br, 0.7);
      const g = this._g(0);
      n.connect(hp);
      hp.connect(g);
      g.connect(out);
      this._p(g.gain, t, gain * 0.5, 0.006, 0.05);
    } else if (m === 'gravel') {
      for (let i = 0; i < 3; i++) {
        const ti = t + i * 0.026 + this.rv() * 0.008;
        const n = this._src(ti, 0.045, 0.8 + this.rv() * 0.5, false);
        const bp = this._f('bandpass', 420 + this.rv() * 830, 0.9);
        const g = this._g(0);
        n.connect(bp);
        bp.connect(g);
        g.connect(out);
        this._p(g.gain, ti, gain * (0.42 - 0.09 * i), 0.002, 0.04);
      }
    } else {
      this._ping(out, t, 1200 * br, gain * 0.16, 0.18);
      this._ping(out, t, 1800 * br, gain * 0.085, 0.14);
    }
  }

  _placeVoice(m, out, t) {
    const n = this._src(t, 0.07, 0.9, false);
    const lp = this._f('lowpass', 210, 0.7);
    const g = this._g(0);
    n.connect(lp);
    lp.connect(g);
    g.connect(out);
    this._p(g.gain, t, 0.42, 0.004, 0.08);
    this._ping(out, t, 84, 0.32, 0.09);
    const ct = t + 0.06;
    const n2 = this._src(ct, 0.02, 1.2, false);
    const bp = this._f('bandpass', 1500, 1);
    const g2 = this._g(0);
    n2.connect(bp);
    bp.connect(g2);
    g2.connect(out);
    this._p(g2.gain, ct, 0.14, 0.001, 0.02);
  }

  _hurtVoice(out, t) {
    const o = this._o('sawtooth', 300);
    o.frequency.setValueAtTime(300, t);
    o.frequency.linearRampToValueAtTime(140, t + 0.18);
    const lp = this._f('lowpass', 1000, 0.7);
    const g = this._g(0);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
    this._p(g.gain, t, 0.4, 0.008, 0.17);
    this._stop(o, t + 0.35);
    const bn = this._src(t, 0.24, 1, false);
    const bp = this._f('bandpass', 750, 0.6);
    const bg = this._g(0);
    bn.connect(bp);
    bp.connect(bg);
    bg.connect(out);
    this._p(bg.gain, t, 0.18, 0.02, 0.2);
  }

  _hitVoice(out, t) {
    const n = this._src(t, 0.06, 1, false);
    const bp = this._f('bandpass', 430, 1);
    const g = this._g(0);
    n.connect(bp);
    bp.connect(g);
    g.connect(out);
    this._p(g.gain, t, 0.5, 0.002, 0.05);
    this._ping(out, t, 135, 0.35, 0.1);
    this._ping(out, t, 2093, 0.05, 0.22, 'triangle');
    this._ping(out, t, 2640, 0.04, 0.18);
  }

  _pluck(out, t, f, peak) {
    const o = this._o('triangle', f);
    const lp = this._f('lowpass', 2200, 0.7);
    const g = this._g(0);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
    this._p(g.gain, t, peak, 0.004, 0.08);
    this._stop(o, t + 0.4);
  }

  _craftVoice(out, t) {
    const lv = [0.4, 0.33, 0.3];
    for (let i = 0; i < 3; i++) {
      const ti = t + i * 0.14;
      const n = this._src(ti, 0.04, 1.1, false);
      const bp = this._f('bandpass', 620, 1);
      const g = this._g(0);
      n.connect(bp);
      bp.connect(g);
      g.connect(out);
      this._p(g.gain, ti, lv[i], 0.002, 0.035);
    }
    const o = this._o('sine', 500);
    o.frequency.setValueAtTime(500, t + 0.34);
    o.frequency.linearRampToValueAtTime(760, t + 0.5);
    const g = this._g(0);
    o.connect(g);
    g.connect(out);
    this._p(g.gain, t + 0.34, 0.07, 0.02, 0.12);
    this._stop(o, t + 0.75);
  }

  _dripVoice(out, t) {
    const f = 1900 + this.rv() * 700;
    const o = this._o('sine', f);
    const g = this._g(0);
    o.connect(g);
    g.connect(out);
    if (this.dripIn) {
      const s = this._g(0.8);
      g.connect(s);
      s.connect(this.dripIn);
    }
    this._p(g.gain, t, 0.16, 0.002, 0.09);
    this._stop(o, t + 0.25);
  }

  _groanVoice(out, t) {
    const dur = 1.2 + this.rv();
    const f0 = 58 + this.rv() * 16;
    const mk = (ff) => {
      const o = this._o('sine', ff);
      const lp = this._f('lowpass', 300, 0.8);
      const g = this._g(0);
      o.connect(lp);
      lp.connect(g);
      g.connect(out);
      o.frequency.setValueAtTime(ff, t);
      o.frequency.linearRampToValueAtTime(ff * 0.6, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + dur * 0.45);
      g.gain.setTargetAtTime(0.0001, t + dur * 0.45, dur * 0.3);
      this._stop(o, t + dur + 0.8);
    };
    mk(f0);
    mk(f0 * 1.013);
  }

  _thump(out, t, v) {
    const o = this._o('sine', 56);
    const g = this._g(0);
    o.connect(g);
    g.connect(out);
    this._p(g.gain, t, v, 0.006, 0.1);
    this._stop(o, t + 0.35);
  }

  _out(pos) {
    if (!pos) return this.sfx;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.6;
    p.maxDistance = 64;
    if (p.positionX && p.positionY && p.positionZ) {
      p.positionX.value = Number(pos.x) || 0;
      p.positionY.value = Number(pos.y) || 0;
      p.positionZ.value = Number(pos.z) || 0;
    } else if (p.setPosition) {
      p.setPosition(Number(pos.x) || 0, Number(pos.y) || 0, Number(pos.z) || 0);
    }
    p.connect(this.sfx);
    return p;
  }

  _makeBuffers(c) {
    const sr = c.sampleRate || 44100;
    const w = c.createBuffer(1, sr, sr);
    const wd = w.getChannelData(0);
    for (let i = 0; i < sr; i++) wd[i] = this.nr() * 2 - 1;
    const b = c.createBuffer(1, sr, sr);
    const bd = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < sr; i++) {
      last = (last + 0.02 * (this.nr() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }
    this.whiteBuf = w;
    this.brownBuf = b;
  }

  _buildAmbience(c, now) {
    const droneSrc = this._loopSrc(this.brownBuf);
    const droneLP = this._f('lowpass', 220, 0.7);
    const droneGain = this._g(0);
    droneSrc.connect(droneLP);
    droneLP.connect(droneGain);
    droneGain.connect(this.amb);
    const sub = this._o('sine', 55);
    const subGain = this._g(0);
    sub.connect(subGain);
    subGain.connect(this.amb);
    const windSrc = this._loopSrc(this.whiteBuf);
    const windBP = this._f('bandpass', 610, 0.9);
    const windGain = this._g(0);
    windSrc.connect(windBP);
    windBP.connect(windGain);
    windGain.connect(this.amb);
    const windLFO = this._o('sine', 0.06);
    const windDepth = this._g(290);
    windLFO.connect(windDepth);
    windDepth.connect(windBP.frequency);
    const tA = this._o('sine', 210);
    const tB = this._o('sine', 222);
    const tAG = this._g(0);
    const tBG = this._g(0);
    const trem = this._g(0);
    const tremLFO = this._o('sine', 5.3);
    const tremDepth = this._g(0);
    tA.connect(tAG);
    tB.connect(tBG);
    tAG.connect(trem);
    tBG.connect(trem);
    trem.connect(this.amb);
    tremLFO.connect(tremDepth);
    tremDepth.connect(trem.gain);
    const hb = this._g(1);
    hb.connect(this.amb);
    const dl = c.createDelay(1);
    dl.delayTime.value = 0.31;
    const fb = this._g(0.36);
    const echo = this._g(0.5);
    dl.connect(fb);
    fb.connect(dl);
    dl.connect(echo);
    echo.connect(this.amb);
    this.hbBus = hb;
    this.dripIn = dl;
    for (const n of [droneSrc, sub, windSrc, windLFO, tA, tB, tremLFO]) {
      try {
        n.start(now);
      } catch (e) {}
      this._persist.push(n);
    }
    this._ambNodes = { droneGain, subGain, windGain, tAG, tBG, tremDepth };
  }

  _loopSrc(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = 1;
    return s;
  }

  _src(t, dur, rate, brown) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.whiteBuf;
    s.loop = true;
    s.playbackRate.value = rate || 1;
    const off = this.rv() * 0.5;
    s.start(t, off, dur + 0.05);
    this._stop(s, t + dur + 0.06);
    return s;
  }

  _ping(out, t, f, peak, dec, type = 'sine') {
    const o = this._o(type, f);
    const g = this._g(0);
    o.connect(g);
    g.connect(out);
    this._p(g.gain, t, peak, 0.003, dec);
    this._stop(o, t + dec * 4 + 0.1);
  }

  _g(v) {
    const n = this.ctx.createGain();
    n.gain.value = v;
    return n;
  }

  _f(type, freq, q) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = freq;
    if (q !== undefined) n.Q.value = q;
    return n;
  }

  _o(type, f) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  }

  _stop(n, t) {
    if (!n) return;
    try {
      n.stop(t);
    } catch (e) {}
  }

  _p(param, t0, peak, att, dec) {
    const pk = Math.max(peak, 0.0002);
    param.setValueAtTime(0.0001, t0);
    param.linearRampToValueAtTime(pk, t0 + att);
    param.setTargetAtTime(0.0001, t0 + att, Math.max(dec, 0.005) / 3);
  }
}
