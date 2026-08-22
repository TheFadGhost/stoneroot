import { makeWorldgen } from '../world/worldgen.js';

let gen = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = makeWorldgen(m.seed);
    self.postMessage({ type: 'ready' });
    return;
  }
  if (m.type === 'gen') {
    const r = gen.generateChunk(m.cx, m.cz);
    self.postMessage(
      { type: 'gen', cx: m.cx, cz: m.cz, voxels: r.voxels, surfaceY: r.surfaceY },
      [r.voxels.buffer, r.surfaceY.buffer]
    );
  }
};
