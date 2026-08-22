import { TILE } from './config.js';

export const BLOCK = {
  AIR: 0,
  THORNSOIL: 1,
  LOAM: 2,
  PALESTONE: 3,
  SLATESTONE: 4,
  EMBERROCK: 5,
  VOIDSTONE: 6,
  CORESTONE: 7,
  ROOTWOOD: 8,
  HEARTPLANK: 9,
  GLOOMLEAF: 10,
  TORCHSTAKE: 11,
  GLOWCAP: 12,
  MAGMA: 13,
  ASHPILE: 14,
  PEAT: 15,
  MOSSPALE: 16,
  CRYSTALBLOCK: 17,
  STONEBRICK: 18,
  WORKBENCH: 19,
  SPORESPRIG: 20,
  EMBERGRASS: 21,
  GLOOMBERRYBUSH: 22,
  ROOTSPROUT: 23,
  LANTERN: 24,
  SCREE: 25,
  FERRITE_ORE: 26,
  CUPRAL_ORE: 27,
  LUMEN_ORE: 28,
};

export const RENDERTYPE = { CUBE: 0, CROSS: 1, LIQUID: 2 };

const def = (o) => o;

export const BLOCK_DEFS = [
  def({ id: 0, name: 'air', solid: false, opaque: false, renderType: RENDERTYPE.CUBE }),
  def({
    id: 1, name: 'thornsoil', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 0.7, tool: 'shovel', minTier: 0, drops: [{ block: 2, count: 1 }],
    emissive: 0, soundMat: 'soft', tiles: { top: 'soil_top', side: 'soil_side', bottom: 'loam' },
  }),
  def({
    id: 2, name: 'loam', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 0.6, tool: 'shovel', minTier: 0, drops: [{ block: 2, count: 1 }],
    emissive: 0, soundMat: 'soft', tiles: { all: 'loam' },
  }),
  def({
    id: 3, name: 'palestone', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 1.6, tool: 'pick', minTier: 1, drops: [{ block: 3, count: 1 }],
    emissive: 0, soundMat: 'stone', tiles: { all: 'palestone' },
  }),
  def({
    id: 4, name: 'slatestone', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 2.2, tool: 'pick', minTier: 1, drops: [{ block: 4, count: 1 }],
    emissive: 0, soundMat: 'stone', tiles: { all: 'slatestone' },
  }),
  def({
    id: 5, name: 'emberrock', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 2.8, tool: 'pick', minTier: 2, drops: [{ block: 5, count: 1 }],
    emissive: 0, soundMat: 'stone', tiles: { all: 'emberrock' },
  }),
  def({
    id: 6, name: 'voidstone', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 3.4, tool: 'pick', minTier: 2, drops: [{ block: 6, count: 1 }],
    emissive: 0, soundMat: 'stone', tiles: { all: 'voidstone' },
  }),
  def({
    id: 7, name: 'corestone', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: Infinity, tool: 'pick', minTier: 99, drops: [],
    emissive: 0, soundMat: 'stone', tiles: { all: 'corestone' },
  }),
  def({
    id: 8, name: 'rootwood', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 1.4, tool: 'axe', minTier: 0, drops: [{ block: 8, count: 1 }],
    emissive: 0, soundMat: 'wood', tiles: { side: 'log_side', top: 'log_top', bottom: 'log_top' },
  }),
  def({
    id: 9, name: 'heartplank', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 1.2, tool: 'axe', minTier: 0, drops: [{ block: 9, count: 1 }],
    emissive: 0, soundMat: 'wood', tiles: { all: 'plank' },
  }),
  def({
    id: 10, name: 'gloomleaf', solid: true, opaque: false, renderType: RENDERTYPE.CUBE,
    hardness: 0.3, tool: 'none', minTier: 0, drops: [{ item: 'fiber', chance: 0.35 }, { item: 'gloomberry', chance: 0.12 }],
    emissive: 0, soundMat: 'leaf', tiles: { all: 'leaf' }, cutout: true,
  }),
  def({
    id: 11, name: 'torchstake', solid: false, opaque: false, renderType: RENDERTYPE.CROSS,
    hardness: 0.05, tool: 'none', minTier: 0, drops: [{ item: 'torchstake', count: 1 }],
    emissive: 14, lightSource: 14, soundMat: 'wood', tiles: { all: 'torch' }, cutout: true,
  }),
  def({
    id: 12, name: 'glowcap', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 0.4, tool: 'none', minTier: 0, drops: [{ block: 12, count: 1 }],
    emissive: 11, lightSource: 11, soundMat: 'leaf', tiles: { all: 'glowcap' },
  }),
  def({
    id: 13, name: 'magma', solid: false, opaque: false, renderType: RENDERTYPE.LIQUID,
    hardness: Infinity, tool: 'none', minTier: 99, drops: [],
    emissive: 15, lightSource: 15, soundMat: 'stone', tiles: { all: 'magma' }, damage: 4, liquid: true,
  }),
  def({
    id: 14, name: 'ashpile', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 0.5, tool: 'shovel', minTier: 0, drops: [{ item: 'ash', count: 2 }],
    emissive: 0, soundMat: 'gravel', tiles: { all: 'ash' },
  }),
  def({
    id: 15, name: 'peat', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 0.8, tool: 'shovel', minTier: 0, drops: [{ block: 15, count: 1 }, { item: 'fiber', chance: 0.2 }],
    emissive: 0, soundMat: 'soft', tiles: { all: 'peat' },
  }),
  def({
    id: 16, name: 'mosspale', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 1.7, tool: 'pick', minTier: 1, drops: [{ block: 16, count: 1 }],
    emissive: 0, soundMat: 'stone', tiles: { all: 'mossstone' },
  }),
  def({
    id: 17, name: 'crystalblock', solid: true, opaque: false, renderType: RENDERTYPE.CUBE,
    hardness: 2.0, tool: 'pick', minTier: 2, drops: [{ item: 'crystal_shard', count: 2 }],
    emissive: 12, lightSource: 12, soundMat: 'glassy', tiles: { all: 'crystal' }, cutout: true,
  }),
  def({
    id: 18, name: 'stonebrick', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 2.0, tool: 'pick', minTier: 1, drops: [{ block: 18, count: 1 }],
    emissive: 0, soundMat: 'stone', tiles: { all: 'stonebrick' },
  }),
  def({
    id: 19, name: 'workbench', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 1.4, tool: 'axe', minTier: 0, drops: [{ block: 19, count: 1 }],
    emissive: 0, soundMat: 'wood', tiles: { top: 'bench_top', side: 'bench_side', bottom: 'plank' },
  }),
  def({
    id: 20, name: 'sporesprig', solid: false, opaque: false, renderType: RENDERTYPE.CROSS,
    hardness: 0.05, tool: 'none', minTier: 0, drops: [{ chance: 0.5, item: 'spore' }],
    emissive: 0, soundMat: 'leaf', tiles: { all: 'sprig' }, cutout: true,
  }),
  def({
    id: 21, name: 'embergrass', solid: false, opaque: false, renderType: RENDERTYPE.CROSS,
    hardness: 0.05, tool: 'none', minTier: 0, drops: [{ chance: 0.4, item: 'fiber' }],
    emissive: 0, soundMat: 'leaf', tiles: { all: 'embergrass' }, cutout: true,
  }),
  def({
    id: 22, name: 'gloomberrybush', solid: false, opaque: false, renderType: RENDERTYPE.CROSS,
    hardness: 0.1, tool: 'none', minTier: 0, drops: [{ item: 'gloomberry', count: 2 }],
    emissive: 0, soundMat: 'leaf', tiles: { all: 'berrybush' }, cutout: true,
  }),
  def({
    id: 23, name: 'rootsprout', solid: false, opaque: false, renderType: RENDERTYPE.CROSS,
    hardness: 0.05, tool: 'none', minTier: 0, drops: [{ chance: 0.3, item: 'fiber' }],
    emissive: 0, soundMat: 'leaf', tiles: { all: 'rootsprout' }, cutout: true,
  }),
  def({
    id: 24, name: 'lantern', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 0.9, tool: 'pick', minTier: 0, drops: [{ block: 24, count: 1 }],
    emissive: 15, lightSource: 15, soundMat: 'stone', tiles: { all: 'lantern' },
  }),
  def({
    id: 25, name: 'scree', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 0.7, tool: 'shovel', minTier: 0, drops: [{ block: 25, count: 1 }],
    emissive: 0, soundMat: 'gravel', tiles: { all: 'scree' },
  }),
  def({
    id: 26, name: 'ferrite_ore', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 2.6, tool: 'pick', minTier: 1, drops: [{ item: 'ferrite_chunk', count: 1 }],
    emissive: 0, soundMat: 'stone', tiles: { all: 'ore_ferrite' },
  }),
  def({
    id: 27, name: 'cupral_ore', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 2.9, tool: 'pick', minTier: 2, drops: [{ item: 'cupral_chunk', count: 1 }],
    emissive: 0, soundMat: 'stone', tiles: { all: 'ore_cupral' },
  }),
  def({
    id: 28, name: 'lumen_ore', solid: true, opaque: true, renderType: RENDERTYPE.CUBE,
    hardness: 3.0, tool: 'pick', minTier: 2, drops: [{ item: 'lumen_dust', count: 2 }],
    emissive: 6, lightSource: 6, soundMat: 'glassy', tiles: { all: 'ore_lumen' },
  }),
];

const byId = new Map(BLOCK_DEFS.map((d) => [d.id, d]));

export function blockDef(id) {
  return byId.get(id) || byId.get(0);
}

export function isSolid(id) {
  return byId.get(id)?.solid === true;
}

export function isOpaque(id) {
  return byId.get(id)?.opaque === true;
}

export function lightOf(id) {
  return byId.get(id)?.lightSource || 0;
}

const faceCache = new Map();

export function faceTile(id, face) {
  const key = id;
  let m = faceCache.get(key);
  if (!m) {
    const t = byId.get(id)?.tiles || {};
    const all = t.all;
    m = {
      px: TILE[t.side ?? all],
      nx: TILE[t.side ?? all],
      pz: TILE[t.side ?? all],
      nz: TILE[t.side ?? all],
      py: TILE[t.top ?? all],
      ny: TILE[t.bottom ?? all],
    };
    faceCache.set(key, m);
  }
  return m[face];
}

export const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
