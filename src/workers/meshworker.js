import { meshChunk } from '../world/mesher.js';

self.onmessage = (e) => {
  const m = e.data;
  if (m.type !== 'mesh') return;
  const result = meshChunk({
    voxels: m.voxels,
    lights: m.lights,
    neighbors: {
      px: m.px, nx: m.nx, pz: m.pz, nz: m.nz,
      corners: { pp: m.pp, pn: m.pn, np: m.np, nn: m.nn },
    },
  });
  const transfer = [];
  for (const k of Object.keys(result)) {
    const v = result[k];
    if (v && v.buffer) transfer.push(v.buffer);
  }
  self.postMessage({ type: 'meshed', jobId: m.jobId, cx: m.cx, cz: m.cz, result }, transfer);
};
