import { BLOCK } from '../blocks.js';

const tool = (kind, tier, speed, durabilityMax, damage) => ({ kind, tier, speed, durabilityMax, damage });

export const ITEMS = {
  fiber: { name: 'fiber', stack: 64 },
  splint: { name: 'splint', stack: 64 },
  ash: { name: 'ash', stack: 64 },
  spore: { name: 'spore', stack: 64 },
  gloomberry: { name: 'gloomberry', stack: 64, food: { heal: 2 } },
  rootvein: { name: 'rootvein', stack: 64 },
  roasted_rootvein: { name: 'roasted rootvein', stack: 64, food: { heal: 4 } },
  ferrite_chunk: { name: 'ferrite chunk', stack: 64 },
  cupral_chunk: { name: 'cupral chunk', stack: 64 },
  lumen_dust: { name: 'lumen dust', stack: 64 },
  crystal_shard: { name: 'crystal shard', stack: 64 },
  emberpaste: { name: 'emberpaste', stack: 64 },
  bowl: { name: 'bowl', stack: 64 },
  rootstew: { name: 'root stew', stack: 16, food: { heal: 9 } },
  gloomberry_tart: { name: 'gloomberry tart', stack: 16, food: { heal: 5 } },
  bandage: { name: 'bandage', stack: 32, food: { heal: 5 } },

  torchstake: { name: 'torchstake', stack: 64, place: BLOCK.TORCHSTAKE },
  lantern: { name: 'lantern', stack: 16, place: BLOCK.LANTERN },
  heartplank: { name: 'heartplank', stack: 64, place: BLOCK.HEARTPLANK },
  stonebrick: { name: 'stonebrick', stack: 64, place: BLOCK.STONEBRICK },
  workbench: { name: 'workbench', stack: 16, place: BLOCK.WORKBENCH },
  loam: { name: 'loam', stack: 64, place: BLOCK.LOAM },
  palestone: { name: 'palestone', stack: 64, place: BLOCK.PALESTONE },
  slatestone: { name: 'slatestone', stack: 64, place: BLOCK.SLATESTONE },
  emberrock: { name: 'emberrock', stack: 64, place: BLOCK.EMBERROCK },
  voidstone: { name: 'voidstone', stack: 64, place: BLOCK.VOIDSTONE },
  gloomleaf: { name: 'gloomleaf', stack: 64, place: BLOCK.GLOOMLEAF },
  glowcap: { name: 'glowcap', stack: 64, place: BLOCK.GLOWCAP },
  peat: { name: 'peat', stack: 64, place: BLOCK.PEAT },
  mosspale: { name: 'mosspale', stack: 64, place: BLOCK.MOSSPALE },
  ashpile: { name: 'ashpile', stack: 64, place: BLOCK.ASHPILE },
  scree: { name: 'scree', stack: 64, place: BLOCK.SCREE },
  rootwood: { name: 'rootwood', stack: 64, place: BLOCK.ROOTWOOD },
  crystalblock: { name: 'crystalblock', stack: 64, place: BLOCK.CRYSTALBLOCK },

  chipped_pick: { name: 'chipped pick', stack: 1, tool: tool('pick', 1, 2, 60, 3) },
  chipped_axe: { name: 'chipped axe', stack: 1, tool: tool('axe', 1, 2, 60, 4) },
  chipped_shovel: { name: 'chipped shovel', stack: 1, tool: tool('shovel', 1, 2, 60, 2) },
  chipped_blade: { name: 'chipped blade', stack: 1, tool: tool('blade', 1, 2, 60, 4) },
  ferrite_pick: { name: 'ferrite pick', stack: 1, tool: tool('pick', 2, 3.5, 160, 5) },
  ferrite_axe: { name: 'ferrite axe', stack: 1, tool: tool('axe', 2, 3.5, 160, 6) },
  ferrite_shovel: { name: 'ferrite shovel', stack: 1, tool: tool('shovel', 2, 3.5, 160, 3) },
  ferrite_blade: { name: 'ferrite blade', stack: 1, tool: tool('blade', 2, 3.5, 160, 6) },
  emberforged_pick: { name: 'emberforged pick', stack: 1, tool: tool('pick', 3, 5.5, 380, 7) },
  emberforged_axe: { name: 'emberforged axe', stack: 1, tool: tool('axe', 3, 5.5, 380, 9) },
  emberforged_shovel: { name: 'emberforged shovel', stack: 1, tool: tool('shovel', 3, 5.5, 380, 4) },
  emberforged_blade: { name: 'emberforged blade', stack: 1, tool: tool('blade', 3, 5.5, 380, 9) },
};

export function itemDef(id) {
  return Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null;
}

export function maxStack(id) {
  const d = itemDef(id);
  if (!d) return 1;
  return d.stack || 64;
}

export function itemName(id) {
  const d = itemDef(id);
  return d ? d.name : id;
}

const PAL = {
  bone: '#d8d3c8',
  ash: '#6b6570',
  bruise: '#4a3855',
  ember: '#ff7a29',
  cyan: '#46e0c8',
  wood: '#6e4a32',
};

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function poly(ctx, s, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function stroke(ctx, s, x1, y1, x2, y2, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w * s;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x1 * s, y1 * s);
  ctx.lineTo(x2 * s, y2 * s);
  ctx.stroke();
}

function dot(ctx, s, x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
  ctx.fill();
}

function handle(ctx, s) {
  stroke(ctx, s, 0.36, 0.88, 0.62, 0.24, PAL.wood, 0.09);
  stroke(ctx, s, 0.33, 0.85, 0.59, 0.21, rgba(PAL.wood, 0.55), 0.03);
}

function paintPick(ctx, s, head, edge) {
  handle(ctx, s);
  poly(ctx, s, [[0.28, 0.38], [0.58, 0.12], [0.66, 0.20], [0.42, 0.44]], head);
  poly(ctx, s, [[0.88, 0.38], [0.58, 0.12], [0.50, 0.20], [0.74, 0.44]], head);
  stroke(ctx, s, 0.56, 0.15, 0.63, 0.22, edge, 0.04);
}

function paintAxe(ctx, s, head, edge) {
  handle(ctx, s);
  poly(ctx, s, [[0.58, 0.10], [0.90, 0.24], [0.84, 0.50], [0.60, 0.42], [0.56, 0.22]], head);
  poly(ctx, s, [[0.86, 0.27], [0.84, 0.46], [0.76, 0.43], [0.79, 0.26]], edge);
}

function paintShovel(ctx, s, head, edge) {
  stroke(ctx, s, 0.52, 0.40, 0.44, 0.90, PAL.wood, 0.08);
  stroke(ctx, s, 0.36, 0.34, 0.68, 0.34, PAL.wood, 0.06);
  poly(ctx, s, [[0.38, 0.34], [0.66, 0.34], [0.60, 0.12], [0.46, 0.12]], head);
  stroke(ctx, s, 0.47, 0.14, 0.59, 0.14, edge, 0.04);
}

function paintBlade(ctx, s, metal, edge) {
  poly(ctx, s, [[0.30, 0.60], [0.72, 0.14], [0.82, 0.24], [0.42, 0.70]], metal);
  stroke(ctx, s, 0.48, 0.30, 0.62, 0.44, edge, 0.035);
  stroke(ctx, s, 0.28, 0.50, 0.42, 0.64, PAL.ash, 0.06);
  stroke(ctx, s, 0.30, 0.62, 0.18, 0.80, PAL.wood, 0.09);
}

function rockChunk(ctx, s, base, shade, spark) {
  poly(ctx, s, [[0.18, 0.78], [0.12, 0.46], [0.34, 0.20], [0.70, 0.16], [0.88, 0.42], [0.80, 0.80]], base);
  poly(ctx, s, [[0.12, 0.46], [0.34, 0.20], [0.44, 0.44], [0.26, 0.62]], shade);
  poly(ctx, s, [[0.44, 0.44], [0.70, 0.16], [0.88, 0.42], [0.62, 0.56]], shade);
  stroke(ctx, s, 0.34, 0.20, 0.44, 0.44, spark, 0.03);
}

const PAINTERS = {
  fiber(ctx, s) {
    stroke(ctx, s, 0.22, 0.82, 0.62, 0.20, PAL.bone, 0.05);
    stroke(ctx, s, 0.30, 0.20, 0.72, 0.80, PAL.bone, 0.05);
    stroke(ctx, s, 0.18, 0.48, 0.82, 0.52, rgba(PAL.bone, 0.6), 0.04);
  },
  splint(ctx, s) {
    stroke(ctx, s, 0.28, 0.84, 0.70, 0.16, PAL.wood, 0.08);
    stroke(ctx, s, 0.25, 0.81, 0.67, 0.13, rgba(PAL.bone, 0.35), 0.02);
  },
  ash(ctx, s) {
    poly(ctx, s, [[0.14, 0.80], [0.28, 0.52], [0.54, 0.44], [0.82, 0.58], [0.86, 0.80]], PAL.ash);
    poly(ctx, s, [[0.28, 0.52], [0.54, 0.44], [0.56, 0.62], [0.34, 0.68]], rgba(PAL.bone, 0.35));
    dot(ctx, s, 0.44, 0.36, 0.045, rgba(PAL.bone, 0.7));
    dot(ctx, s, 0.62, 0.32, 0.035, rgba(PAL.bone, 0.5));
    dot(ctx, s, 0.72, 0.42, 0.03, rgba(PAL.bone, 0.4));
  },
  spore(ctx, s) {
    dot(ctx, s, 0.50, 0.46, 0.17, rgba(PAL.cyan, 0.85));
    dot(ctx, s, 0.50, 0.46, 0.07, PAL.cyan);
    dot(ctx, s, 0.26, 0.66, 0.08, rgba(PAL.cyan, 0.6));
    dot(ctx, s, 0.74, 0.68, 0.07, rgba(PAL.cyan, 0.6));
    dot(ctx, s, 0.68, 0.26, 0.05, rgba(PAL.cyan, 0.5));
  },
  gloomberry(ctx, s) {
    dot(ctx, s, 0.40, 0.40, 0.16, PAL.bruise);
    dot(ctx, s, 0.64, 0.52, 0.14, PAL.bruise);
    dot(ctx, s, 0.46, 0.70, 0.12, rgba(PAL.bruise, 0.85));
    dot(ctx, s, 0.35, 0.35, 0.05, rgba(PAL.bone, 0.5));
    dot(ctx, s, 0.60, 0.47, 0.04, rgba(PAL.bone, 0.4));
    stroke(ctx, s, 0.52, 0.22, 0.66, 0.14, PAL.wood, 0.04);
  },
  rootvein(ctx, s) {
    stroke(ctx, s, 0.24, 0.86, 0.44, 0.56, PAL.wood, 0.08);
    stroke(ctx, s, 0.44, 0.56, 0.34, 0.34, PAL.wood, 0.07);
    stroke(ctx, s, 0.34, 0.34, 0.58, 0.18, PAL.wood, 0.06);
    stroke(ctx, s, 0.44, 0.56, 0.68, 0.48, PAL.wood, 0.05);
    stroke(ctx, s, 0.68, 0.48, 0.80, 0.62, PAL.wood, 0.04);
  },
  roasted_rootvein(ctx, s) {
    PAINTERS.rootvein(ctx, s);
    dot(ctx, s, 0.58, 0.19, 0.05, PAL.ember);
    dot(ctx, s, 0.79, 0.61, 0.04, rgba(PAL.ember, 0.8));
    stroke(ctx, s, 0.26, 0.83, 0.42, 0.60, rgba(PAL.ember, 0.5), 0.03);
  },
  ferrite_chunk(ctx, s) {
    rockChunk(ctx, s, PAL.ash, rgba(PAL.bone, 0.45), rgba(PAL.bone, 0.7));
  },
  cupral_chunk(ctx, s) {
    rockChunk(ctx, s, PAL.bruise, rgba(PAL.ember, 0.5), rgba(PAL.ember, 0.8));
  },
  lumen_dust(ctx, s) {
    poly(ctx, s, [[0.30, 0.78], [0.26, 0.44], [0.50, 0.30], [0.72, 0.44], [0.70, 0.78]], rgba(PAL.bruise, 0.75));
    stroke(ctx, s, 0.26, 0.44, 0.72, 0.44, rgba(PAL.bone, 0.4), 0.03);
    dot(ctx, s, 0.44, 0.58, 0.04, PAL.cyan);
    dot(ctx, s, 0.58, 0.66, 0.03, rgba(PAL.cyan, 0.8));
    dot(ctx, s, 0.54, 0.50, 0.03, rgba(PAL.cyan, 0.9));
    stroke(ctx, s, 0.50, 0.30, 0.50, 0.16, rgba(PAL.cyan, 0.7), 0.03);
  },
  crystal_shard(ctx, s) {
    poly(ctx, s, [[0.50, 0.08], [0.66, 0.42], [0.56, 0.86], [0.44, 0.86], [0.34, 0.42]], rgba(PAL.cyan, 0.8));
    poly(ctx, s, [[0.50, 0.08], [0.66, 0.42], [0.52, 0.50]], rgba(PAL.bone, 0.65));
    stroke(ctx, s, 0.50, 0.12, 0.50, 0.80, rgba(PAL.bone, 0.6), 0.03);
  },
  emberpaste(ctx, s) {
    poly(ctx, s, [[0.22, 0.74], [0.34, 0.46], [0.62, 0.40], [0.80, 0.60], [0.74, 0.80], [0.32, 0.84]], rgba(PAL.wood, 0.9));
    stroke(ctx, s, 0.36, 0.56, 0.62, 0.50, PAL.ember, 0.06);
    stroke(ctx, s, 0.42, 0.68, 0.66, 0.64, rgba(PAL.ember, 0.6), 0.04);
  },
  bowl(ctx, s) {
    poly(ctx, s, [[0.20, 0.44], [0.80, 0.44], [0.68, 0.80], [0.32, 0.80]], PAL.wood);
    stroke(ctx, s, 0.20, 0.44, 0.80, 0.44, rgba(PAL.bone, 0.5), 0.04);
    stroke(ctx, s, 0.30, 0.56, 0.70, 0.56, rgba(PAL.bone, 0.2), 0.03);
  },
  rootstew(ctx, s) {
    poly(ctx, s, [[0.20, 0.44], [0.80, 0.44], [0.68, 0.80], [0.32, 0.80]], PAL.wood);
    poly(ctx, s, [[0.24, 0.44], [0.76, 0.44], [0.72, 0.56], [0.28, 0.56]], rgba(PAL.ember, 0.75));
    dot(ctx, s, 0.40, 0.50, 0.04, PAL.bone);
    dot(ctx, s, 0.58, 0.51, 0.035, rgba(PAL.bone, 0.8));
    stroke(ctx, s, 0.42, 0.36, 0.40, 0.20, rgba(PAL.cyan, 0.45), 0.035);
    stroke(ctx, s, 0.56, 0.36, 0.58, 0.18, rgba(PAL.cyan, 0.35), 0.035);
  },
  gloomberry_tart(ctx, s) {
    poly(ctx, s, [[0.16, 0.78], [0.84, 0.78], [0.76, 0.50], [0.24, 0.50]], PAL.wood);
    poly(ctx, s, [[0.24, 0.50], [0.76, 0.50], [0.50, 0.24]], rgba(PAL.bruise, 0.95));
    dot(ctx, s, 0.44, 0.42, 0.05, rgba(PAL.bone, 0.55));
    dot(ctx, s, 0.58, 0.46, 0.04, rgba(PAL.bone, 0.4));
    stroke(ctx, s, 0.16, 0.78, 0.84, 0.78, rgba(PAL.bone, 0.4), 0.035);
  },
  bandage(ctx, s) {
    ctx.strokeStyle = PAL.bone;
    ctx.lineWidth = 0.11 * s;
    ctx.beginPath();
    ctx.arc(0.5 * s, 0.52 * s, 0.2 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(PAL.ash, 0.9);
    ctx.lineWidth = 0.03 * s;
    ctx.beginPath();
    ctx.arc(0.5 * s, 0.52 * s, 0.2 * s, -0.6, 1.8);
    ctx.stroke();
    stroke(ctx, s, 0.68, 0.40, 0.86, 0.28, PAL.bone, 0.1);
  },

  torchstake(ctx, s) {
    stroke(ctx, s, 0.50, 0.92, 0.50, 0.42, PAL.wood, 0.09);
    poly(ctx, s, [[0.50, 0.10], [0.64, 0.32], [0.50, 0.46], [0.36, 0.32]], PAL.ember);
    poly(ctx, s, [[0.50, 0.20], [0.57, 0.32], [0.50, 0.40], [0.43, 0.32]], rgba(PAL.bone, 0.85));
  },
  lantern(ctx, s) {
    poly(ctx, s, [[0.32, 0.20], [0.68, 0.20], [0.74, 0.50], [0.68, 0.84], [0.32, 0.84], [0.26, 0.50]], rgba(PAL.ash, 0.9));
    poly(ctx, s, [[0.42, 0.34], [0.58, 0.34], [0.60, 0.66], [0.40, 0.66]], rgba(PAL.cyan, 0.85));
    stroke(ctx, s, 0.32, 0.20, 0.68, 0.20, PAL.bone, 0.045);
    stroke(ctx, s, 0.50, 0.20, 0.50, 0.10, PAL.ash, 0.05);
    dot(ctx, s, 0.50, 0.50, 0.05, rgba(PAL.bone, 0.9));
  },
  heartplank(ctx, s) {
    poly(ctx, s, [[0.12, 0.30], [0.88, 0.24], [0.88, 0.74], [0.12, 0.78]], PAL.wood);
    stroke(ctx, s, 0.20, 0.42, 0.80, 0.38, rgba(PAL.bone, 0.3), 0.03);
    stroke(ctx, s, 0.18, 0.62, 0.82, 0.58, rgba(PAL.bone, 0.25), 0.03);
    stroke(ctx, s, 0.12, 0.30, 0.12, 0.78, rgba(PAL.bone, 0.4), 0.035);
  },
  stonebrick(ctx, s) {
    poly(ctx, s, [[0.12, 0.14], [0.88, 0.14], [0.88, 0.86], [0.12, 0.86]], PAL.ash);
    stroke(ctx, s, 0.12, 0.38, 0.88, 0.38, rgba(PAL.bone, 0.55), 0.04);
    stroke(ctx, s, 0.12, 0.62, 0.88, 0.62, rgba(PAL.bone, 0.55), 0.04);
    stroke(ctx, s, 0.50, 0.14, 0.50, 0.38, rgba(PAL.bone, 0.55), 0.04);
    stroke(ctx, s, 0.31, 0.38, 0.31, 0.62, rgba(PAL.bone, 0.55), 0.04);
    stroke(ctx, s, 0.69, 0.38, 0.69, 0.62, rgba(PAL.bone, 0.55), 0.04);
    stroke(ctx, s, 0.50, 0.62, 0.50, 0.86, rgba(PAL.bone, 0.55), 0.04);
  },
  workbench(ctx, s) {
    poly(ctx, s, [[0.10, 0.34], [0.90, 0.34], [0.86, 0.50], [0.14, 0.50]], PAL.wood);
    stroke(ctx, s, 0.24, 0.50, 0.24, 0.86, PAL.wood, 0.08);
    stroke(ctx, s, 0.76, 0.50, 0.76, 0.86, PAL.wood, 0.08);
    stroke(ctx, s, 0.30, 0.42, 0.52, 0.42, rgba(PAL.bone, 0.5), 0.03);
    poly(ctx, s, [[0.60, 0.14], [0.72, 0.30], [0.64, 0.30]], rgba(PAL.bone, 0.6));
    stroke(ctx, s, 0.40, 0.16, 0.40, 0.32, rgba(PAL.ash, 0.9), 0.05);
  },
  loam(ctx, s) {
    poly(ctx, s, [[0.14, 0.80], [0.18, 0.40], [0.50, 0.22], [0.82, 0.40], [0.86, 0.80]], PAL.wood);
    poly(ctx, s, [[0.18, 0.40], [0.50, 0.22], [0.54, 0.46], [0.26, 0.56]], rgba(PAL.bone, 0.18));
    dot(ctx, s, 0.38, 0.64, 0.035, rgba(PAL.bone, 0.3));
    dot(ctx, s, 0.62, 0.58, 0.03, rgba(PAL.bone, 0.25));
    dot(ctx, s, 0.52, 0.72, 0.03, rgba(PAL.bone, 0.2));
  },
  palestone(ctx, s) {
    rockChunk(ctx, s, rgba(PAL.bone, 0.92), rgba(PAL.bone, 0.55), rgba(PAL.ash, 0.6));
  },
  slatestone(ctx, s) {
    rockChunk(ctx, s, PAL.ash, rgba(PAL.bone, 0.22), rgba(PAL.bone, 0.4));
    stroke(ctx, s, 0.24, 0.62, 0.72, 0.58, rgba(PAL.bone, 0.25), 0.03);
    stroke(ctx, s, 0.30, 0.72, 0.66, 0.70, rgba(PAL.bone, 0.2), 0.03);
  },
  emberrock(ctx, s) {
    rockChunk(ctx, s, rgba(PAL.ash, 0.85), rgba(PAL.bone, 0.2), PAL.ember);
    stroke(ctx, s, 0.36, 0.52, 0.52, 0.66, PAL.ember, 0.045);
    dot(ctx, s, 0.60, 0.44, 0.03, rgba(PAL.ember, 0.9));
  },
  voidstone(ctx, s) {
    rockChunk(ctx, s, rgba(PAL.bruise, 0.6), rgba(PAL.bruise, 0.9), rgba(PAL.bone, 0.35));
    stroke(ctx, s, 0.30, 0.34, 0.44, 0.50, rgba(PAL.bone, 0.3), 0.025);
  },
  gloomleaf(ctx, s) {
    poly(ctx, s, [[0.50, 0.10], [0.82, 0.50], [0.50, 0.90], [0.18, 0.50]], rgba(PAL.bruise, 0.85));
    poly(ctx, s, [[0.50, 0.10], [0.82, 0.50], [0.50, 0.50]], rgba(PAL.bone, 0.12));
    stroke(ctx, s, 0.50, 0.16, 0.50, 0.84, rgba(PAL.bone, 0.4), 0.03);
    stroke(ctx, s, 0.50, 0.42, 0.68, 0.34, rgba(PAL.bone, 0.25), 0.025);
    stroke(ctx, s, 0.50, 0.58, 0.32, 0.66, rgba(PAL.bone, 0.25), 0.025);
  },
  glowcap(ctx, s) {
    stroke(ctx, s, 0.50, 0.52, 0.50, 0.88, PAL.bone, 0.07);
    poly(ctx, s, [[0.18, 0.52], [0.82, 0.52], [0.66, 0.24], [0.34, 0.24]], rgba(PAL.cyan, 0.8));
    stroke(ctx, s, 0.24, 0.52, 0.76, 0.52, rgba(PAL.bone, 0.7), 0.04);
    dot(ctx, s, 0.42, 0.38, 0.035, rgba(PAL.bone, 0.85));
    dot(ctx, s, 0.58, 0.42, 0.03, rgba(PAL.bone, 0.6));
  },
  peat(ctx, s) {
    poly(ctx, s, [[0.12, 0.82], [0.16, 0.56], [0.84, 0.52], [0.88, 0.82]], PAL.wood);
    poly(ctx, s, [[0.16, 0.56], [0.22, 0.34], [0.78, 0.30], [0.84, 0.52]], rgba(PAL.wood, 0.75));
    stroke(ctx, s, 0.16, 0.56, 0.84, 0.52, rgba(PAL.bone, 0.3), 0.03);
    dot(ctx, s, 0.40, 0.68, 0.03, rgba(PAL.bone, 0.25));
    dot(ctx, s, 0.64, 0.42, 0.025, rgba(PAL.bone, 0.2));
  },
  mosspale(ctx, s) {
    rockChunk(ctx, s, rgba(PAL.bone, 0.8), rgba(PAL.bone, 0.5), rgba(PAL.ash, 0.5));
    dot(ctx, s, 0.34, 0.30, 0.07, rgba(PAL.cyan, 0.55));
    dot(ctx, s, 0.56, 0.24, 0.05, rgba(PAL.cyan, 0.45));
    dot(ctx, s, 0.70, 0.36, 0.04, rgba(PAL.cyan, 0.4));
  },
  ashpile(ctx, s) {
    poly(ctx, s, [[0.12, 0.82], [0.34, 0.50], [0.62, 0.56], [0.88, 0.82]], PAL.ash);
    poly(ctx, s, [[0.34, 0.50], [0.50, 0.34], [0.68, 0.48], [0.62, 0.56]], rgba(PAL.bone, 0.4));
    dot(ctx, s, 0.46, 0.44, 0.03, rgba(PAL.bone, 0.6));
    dot(ctx, s, 0.60, 0.66, 0.03, rgba(PAL.bone, 0.4));
  },
  scree(ctx, s) {
    poly(ctx, s, [[0.14, 0.82], [0.30, 0.58], [0.46, 0.82]], rgba(PAL.bone, 0.75));
    poly(ctx, s, [[0.40, 0.82], [0.58, 0.50], [0.76, 0.82]], PAL.ash);
    poly(ctx, s, [[0.66, 0.82], [0.80, 0.62], [0.90, 0.82]], rgba(PAL.bone, 0.55));
    poly(ctx, s, [[0.44, 0.54], [0.58, 0.34], [0.68, 0.54]], rgba(PAL.ash, 0.8));
  },
  rootwood(ctx, s) {
    poly(ctx, s, [[0.26, 0.12], [0.74, 0.12], [0.74, 0.88], [0.26, 0.88]], PAL.wood);
    poly(ctx, s, [[0.74, 0.12], [0.86, 0.20], [0.86, 0.80], [0.74, 0.88]], rgba(PAL.wood, 0.7));
    stroke(ctx, s, 0.26, 0.30, 0.74, 0.30, rgba(PAL.bone, 0.25), 0.03);
    stroke(ctx, s, 0.26, 0.52, 0.74, 0.52, rgba(PAL.bone, 0.2), 0.03);
    stroke(ctx, s, 0.26, 0.72, 0.74, 0.72, rgba(PAL.bone, 0.25), 0.03);
  },
  crystalblock(ctx, s) {
    poly(ctx, s, [[0.34, 0.88], [0.28, 0.44], [0.44, 0.20], [0.52, 0.52], [0.46, 0.88]], rgba(PAL.cyan, 0.8));
    poly(ctx, s, [[0.52, 0.88], [0.54, 0.38], [0.68, 0.26], [0.72, 0.62], [0.66, 0.88]], rgba(PAL.cyan, 0.6));
    poly(ctx, s, [[0.22, 0.88], [0.22, 0.60], [0.32, 0.50], [0.34, 0.88]], rgba(PAL.bone, 0.5));
    stroke(ctx, s, 0.44, 0.24, 0.46, 0.60, rgba(PAL.bone, 0.55), 0.025);
  },

  chipped_pick(ctx, s) { paintPick(ctx, s, PAL.ash, rgba(PAL.bone, 0.5)); },
  chipped_axe(ctx, s) { paintAxe(ctx, s, PAL.ash, rgba(PAL.bone, 0.5)); },
  chipped_shovel(ctx, s) { paintShovel(ctx, s, PAL.ash, rgba(PAL.bone, 0.5)); },
  chipped_blade(ctx, s) { paintBlade(ctx, s, PAL.ash, rgba(PAL.bone, 0.6)); },
  ferrite_pick(ctx, s) { paintPick(ctx, s, PAL.bone, PAL.bruise); },
  ferrite_axe(ctx, s) { paintAxe(ctx, s, PAL.bone, PAL.bruise); },
  ferrite_shovel(ctx, s) { paintShovel(ctx, s, PAL.bone, PAL.bruise); },
  ferrite_blade(ctx, s) { paintBlade(ctx, s, PAL.bone, PAL.bruise); },
  emberforged_pick(ctx, s) { paintPick(ctx, s, PAL.ember, PAL.bone); },
  emberforged_axe(ctx, s) { paintAxe(ctx, s, PAL.ember, PAL.bone); },
  emberforged_shovel(ctx, s) { paintShovel(ctx, s, PAL.ember, PAL.bone); },
  emberforged_blade(ctx, s) { paintBlade(ctx, s, PAL.ember, PAL.bone); },
};

function fallbackPainter(ctx, s) {
  poly(ctx, s, [[0.50, 0.10], [0.84, 0.36], [0.72, 0.84], [0.28, 0.84], [0.16, 0.36]], rgba(PAL.ash, 0.9));
  poly(ctx, s, [[0.50, 0.10], [0.84, 0.36], [0.50, 0.48]], rgba(PAL.bone, 0.3));
  stroke(ctx, s, 0.16, 0.36, 0.84, 0.36, rgba(PAL.bone, 0.4), 0.03);
}

export function drawIcon(ctx2d, itemId, size) {
  const s = size;
  ctx2d.clearRect(0, 0, s, s);
  ctx2d.save();
  const p = PAINTERS[itemId];
  if (p) p(ctx2d, s);
  else fallbackPainter(ctx2d, s);
  ctx2d.restore();
}
