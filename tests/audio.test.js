import test from 'node:test';
import assert from 'assert/strict';
import { AudioEngine } from '../src/audio/audio.js';

class FakeParam {
  constructor(name, value) {
    this.name = name;
    this.value = value;
    this.events = [];
  }
  setValueAtTime(v, t) {
    this.events.push(['setValueAtTime', v, t]);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v, t) {
    this.events.push(['linearRamp', v, t]);
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v, t) {
    this.events.push(['exponentialRamp', v, t]);
    this.value = v;
    return this;
  }
  setTargetAtTime(v, t, tc) {
    this.events.push(['setTarget', v, t, tc]);
    return this;
  }
  cancelScheduledValues(t) {
    this.events.push(['cancel', t]);
    return this;
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.params = [];
    this.outputs = [];
  }
  param(name, v) {
    const p = new FakeParam(name, v);
    this[name] = p;
    this.params.push(p);
    return p;
  }
  connect(dest) {
    this.outputs.push(dest);
    this.ctx.edges.push([this, dest]);
    return dest;
  }
  disconnect() {
    this.outputs.length = 0;
  }
}

class FakeGain extends FakeNode {
  constructor(c) {
    super(c, 'gain');
    this.param('gain', 1);
  }
}

class FakeBufferSource extends FakeNode {
  constructor(c) {
    super(c, 'bufferSource');
    this.buffer = null;
    this.loop = false;
    this.param('playbackRate', 1);
    this.starts = [];
    this.stops = [];
  }
  start(t, off, dur) {
    this.starts.push([t, off, dur]);
    this.ctx.startedSources.push(this);
  }
  stop(t) {
    this.stops.push(t);
  }
}

class FakeOsc extends FakeNode {
  constructor(c) {
    super(c, 'oscillator');
    this.type = 'sine';
    this.param('frequency', 440);
    this.param('detune', 0);
    this.starts = [];
    this.stops = [];
  }
  start(t) {
    this.starts.push(t);
  }
  stop(t) {
    this.stops.push(t);
  }
}

class FakeFilter extends FakeNode {
  constructor(c) {
    super(c, 'biquad');
    this.type = 'lowpass';
    this.param('frequency', 350);
    this.param('Q', 1);
    this.param('detune', 0);
  }
}

class FakeComp extends FakeNode {
  constructor(c) {
    super(c, 'compressor');
    for (const [n, v] of [
      ['threshold', -24],
      ['knee', 30],
      ['ratio', 12],
      ['attack', 0.003],
      ['release', 0.25],
    ]) {
      this.param(n, v);
    }
  }
}

class FakeDelay extends FakeNode {
  constructor(c, maxDelay) {
    super(c, 'delay');
    this.maxDelay = maxDelay;
    this.param('delayTime', 0);
  }
}

class FakePanner extends FakeNode {
  constructor(c) {
    super(c, 'panner');
    this.panningModel = 'equalpower';
    this.distanceModel = 'inverse';
    this.refDistance = 1;
    this.rolloffFactor = 1;
    this.maxDistance = 10000;
    for (const n of ['positionX', 'positionY', 'positionZ']) this.param(n, 0);
    this.positionCalls = [];
  }
  setPosition(x, y, z) {
    this.positionCalls.push([x, y, z]);
  }
}

class FakeDestination extends FakeNode {
  constructor(c) {
    super(c, 'destination');
  }
}

class FakeBuffer {
  constructor(ch, len, sr) {
    this.numberOfChannels = ch;
    this.length = len;
    this.sampleRate = sr;
    this.data = [];
    for (let i = 0; i < ch; i++) this.data.push(new Float32Array(len));
  }
  getChannelData(i) {
    return this.data[i];
  }
}

class FakeListener {
  constructor() {
    for (const n of [
      'positionX',
      'positionY',
      'positionZ',
      'forwardX',
      'forwardY',
      'forwardZ',
      'upX',
      'upY',
      'upZ',
    ]) {
      this[n] = new FakeParam(n, 0);
    }
    this.upY.value = 1;
    this.setPositionCalls = [];
    this.orientationCalls = [];
  }
  setPosition(x, y, z) {
    this.setPositionCalls.push([x, y, z]);
  }
  setOrientation(...a) {
    this.orientationCalls.push(a);
  }
}

class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = new FakeDestination(this);
    this.listener = new FakeListener();
    this.nodes = [];
    this.edges = [];
    this.buffers = [];
    this.startedSources = [];
    this.createCounts = {};
    this.resumes = 0;
    this.closed = false;
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
  _reg(type, node) {
    this.createCounts[type] = (this.createCounts[type] || 0) + 1;
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this._reg('gain', new FakeGain(this));
  }
  createBufferSource() {
    return this._reg('bufferSource', new FakeBufferSource(this));
  }
  createOscillator() {
    return this._reg('oscillator', new FakeOsc(this));
  }
  createBiquadFilter() {
    return this._reg('biquad', new FakeFilter(this));
  }
  createDynamicsCompressor() {
    return this._reg('compressor', new FakeComp(this));
  }
  createDelay(maxDelay) {
    return this._reg('delay', new FakeDelay(this, maxDelay));
  }
  createPanner() {
    return this._reg('panner', new FakePanner(this));
  }
  createBuffer(ch, len, sr) {
    const b = new FakeBuffer(ch, len, sr);
    this.buffers.push(b);
    return b;
  }
  count(type) {
    return this.createCounts[type] || 0;
  }
  allParams() {
    const out = [];
    for (const n of this.nodes) out.push(...n.params);
    return out;
  }
  autoEvents(types) {
    let k = 0;
    for (const p of this.allParams()) {
      for (const e of p.events) if (!types || types.includes(e[0])) k++;
    }
    return k;
  }
}

test('all methods are safe no-ops while locked and factory is never touched', () => {
  let built = 0;
  const eng = new AudioEngine({
    contextFactory() {
      built++;
      throw new Error('must not construct while locked');
    },
  });
  eng.setVolume('sfx', 0.5);
  eng.setAmbience({ depthBand: 'stillcore', isNight: true, threat: 0.9, nearbyHostiles: 2, playerLight: 0 });
  eng.setListener({ x: 1, y: 2, z: 3 }, 1.5);
  eng.footstep('stone', 1.2);
  eng.dig('wood');
  eng.breakBlock('soft');
  eng.place('stone');
  eng.hurt();
  eng.attackHit();
  eng.pickup();
  eng.craft();
  eng.mobVocal('hollowone', { x: 0, y: 0, z: 0 });
  eng.mobVocal('unknown-thing');
  eng.playPositional('drip', { x: 1, y: 1, z: 1 });
  eng.update(0.5);
  assert.equal(eng.ready, false);
  assert.equal(built, 0, 'lazy construction: no context before unlock');
  eng.dispose();
  assert.equal(eng.ready, false);
});

test('unlock without any available AudioContext stays locked', () => {
  const eng = new AudioEngine({ seed: 5 });
  eng.unlock();
  assert.equal(eng.ready, false);
  eng.footstep('soft');
  eng.update(1);
  eng.dispose();
  assert.equal(eng.ready, false);
});

test('unlock builds master graph buses buffers and applies stored volumes', () => {
  const ctx = new FakeContext();
  const eng = new AudioEngine({ contextFactory: () => ctx, seed: 7 });
  eng.setVolume('sfx', 0.5);
  eng.unlock();
  assert.equal(eng.ready, true);
  assert.ok(ctx.count('gain') >= 3, 'master + sfx + ambience gains');
  assert.ok(ctx.count('compressor') >= 1, 'master compressor');
  assert.ok(ctx.buffers.length >= 2, 'white + brown noise buffers generated once');
  assert.ok(ctx.buffers[0].getChannelData(0).length === 48000, '1 second noise buffer at ctx rate');
  assert.equal(eng.master.outputs[0], eng.comp, 'master -> compressor');
  assert.equal(eng.comp.outputs[0], ctx.destination, 'compressor -> destination');
  assert.ok(ctx.edges.some(([a, b]) => a === eng.sfx && b === eng.master), 'sfx bus into master');
  assert.ok(ctx.edges.some(([a, b]) => a === eng.amb && b === eng.master), 'ambience bus into master');
  const applied = ctx
    .allParams()
    .some((p) => p.events.some((e) => e[0] === 'setValueAtTime' && e[1] === 0.5));
  assert.ok(applied, 'volume set while locked is applied on unlock');
  eng.unlock();
  assert.equal(eng.ready, true, 'double unlock idempotent');
  eng.setListener({ x: 3, y: 4, z: 5 }, Math.PI / 2);
  assert.equal(ctx.listener.positionX.value, 3);
  assert.equal(ctx.listener.forwardX.value, -1, 'yaw pi/2 faces -x');
  assert.equal(ctx.listener.upY.value, 1);
});

test('footstep stone creates noise buffer sources after unlock and all voices run', () => {
  const ctx = new FakeContext();
  const eng = new AudioEngine({ contextFactory: () => ctx, seed: 99 });
  eng.unlock();
  const before = ctx.count('bufferSource');
  eng.footstep('stone', 1.3);
  const after = ctx.count('bufferSource');
  assert.ok(after > before, 'footstep spawned buffer sources');
  const fresh = ctx.nodes.filter((n) => n.kind === 'bufferSource').slice(before);
  assert.ok(
    fresh.every((n) => n.buffer === ctx.buffers[0] || n.buffer === ctx.buffers[1]),
    'sources reuse the shared noise pool'
  );
  assert.ok(fresh.some((n) => n.starts.length > 0), 'a source was started');
  for (const m of ['soft', 'wood', 'leaf', 'gravel', 'glassy']) eng.footstep(m, 1);
  eng.dig('stone');
  eng.breakBlock('wood');
  eng.breakBlock('soft');
  eng.breakBlock('stone');
  eng.place('gravel');
  eng.hurt();
  eng.attackHit();
  eng.pickup();
  eng.craft();
  const pansBefore = ctx.count('panner');
  for (const id of ['thornhound', 'rootling', 'gloomcap', 'ashwisp', 'hollowone', 'sporeling']) {
    eng.mobVocal(id, { x: 1, y: 40, z: 2 });
  }
  assert.ok(ctx.count('panner') >= pansBefore + 6, 'each positional vocal gets its own panner');
  eng.playPositional('drip', { x: 2, y: 3, z: 4 });
  eng.playPositional('mystery-kind', { x: 2, y: 3, z: 4 });
  assert.ok(true, 'every one-shot voice executed without throwing');
});

test('positional panner uses HRTF with contract distances', () => {
  const ctx = new FakeContext();
  const eng = new AudioEngine({ contextFactory: () => ctx });
  eng.unlock();
  eng.playPositional('thornhound', { x: 5, y: 6, z: 7 });
  const p = [...ctx.nodes].reverse().find((n) => n.kind === 'panner');
  assert.ok(p, 'panner created');
  assert.equal(p.panningModel, 'HRTF');
  assert.equal(p.distanceModel, 'inverse');
  assert.equal(p.refDistance, 4);
  assert.equal(p.rolloffFactor, 1.6);
  assert.equal(p.maxDistance, 64);
  assert.equal(p.positionX.value, 5);
  assert.equal(p.outputs[0], eng.sfx, 'panner feeds sfx bus');
});

test('setAmbience plus update drives gain automation and ambient schedulers', () => {
  const ctx = new FakeContext();
  const eng = new AudioEngine({ contextFactory: () => ctx, seed: 1234 });
  eng.unlock();
  const strictBefore = ctx.autoEvents(['setValueAtTime', 'linearRamp']);
  eng.setAmbience({ depthBand: 'stillcore', isNight: false, threat: 0.9, nearbyHostiles: 2, playerLight: 0 });
  eng.update(2);
  assert.ok(ctx.autoEvents(['setValueAtTime', 'linearRamp']) > strictBefore, 'update recorded setValueAtTime or ramp events');
  assert.ok(ctx.autoEvents(['setTarget']) > 0, 'update eased layer gains via setTargetAtTime');
  for (let i = 0; i < 40; i++) eng.update(0.5);
  const oscCount = ctx.nodes.filter((n) => n.kind === 'oscillator').length;
  assert.ok(oscCount > 5, 'heartbeat lub-dub and cave drips scheduled extra oscillators, got ' + oscCount);
  const delay = ctx.nodes.find((n) => n.kind === 'delay');
  assert.ok(delay, 'drip echo delay node exists');
  const pansBefore = ctx.count('panner');
  eng.setAmbience({ depthBand: 'thornwood', isNight: true, threat: 0.2, nearbyHostiles: 0 });
  for (let i = 0; i < 130; i++) eng.update(0.5);
  assert.ok(ctx.count('panner') > pansBefore, 'night surface groan scheduler fired positionally');
  eng.update(-1);
  eng.update(NaN);
  assert.ok(true, 'degenerate dt values handled');
});

test('setListener falls back to setPosition on legacy listeners', () => {
  const ctx = new FakeContext();
  delete ctx.listener.positionX;
  delete ctx.listener.positionY;
  delete ctx.listener.positionZ;
  const eng = new AudioEngine({ contextFactory: () => ctx });
  eng.unlock();
  eng.setListener({ x: 8, y: 12, z: -4 }, 0.25);
  assert.deepEqual(ctx.listener.setPositionCalls.at(-1), [8, 12, -4]);
  assert.ok(ctx.listener.orientationCalls.length > 0, 'orientation fallback used');
  const [fx, fy, fz, ux, uy, uz] = ctx.listener.orientationCalls.at(-1);
  assert.ok(Math.abs(fx + Math.sin(0.25)) < 1e-9 && Math.abs(fz + Math.cos(0.25)) < 1e-9);
  assert.equal(fy, 0);
  assert.deepEqual([ux, uy, uz], [0, 1, 0]);
});

test('dispose closes the context and permanently silences the engine', () => {
  const ctx = new FakeContext();
  const eng = new AudioEngine({ contextFactory: () => ctx });
  eng.unlock();
  assert.equal(eng.ready, true);
  const persistNodes = ctx.nodes.length;
  assert.ok(persistNodes > 0);
  eng.dispose();
  assert.equal(ctx.closed, true, 'context.close called');
  assert.equal(ctx.state, 'closed');
  assert.equal(eng.ready, false);
  eng.footstep('stone');
  eng.hurt();
  eng.update(1);
  eng.dispose();
  assert.equal(ctx.closed, true, 'double dispose safe');
});
