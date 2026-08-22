export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 192;

export const SURFACE_MIN = 138;
export const SURFACE_MAX = 162;

export const BIOME_BANDS = [
  { name: 'thornwood', min: 138, max: 191 },
  { name: 'loamhollows', min: 96, max: 137 },
  { name: 'fungaldrifts', min: 48, max: 95 },
  { name: 'emberdeep', min: 18, max: 47 },
  { name: 'stillcore', min: 0, max: 17 },
];

export function biomeAt(y) {
  for (const b of BIOME_BANDS) if (y >= b.min && y <= b.max) return b.name;
  return 'stillcore';
}

export const DAY_LENGTH_SECONDS = 600;

export const RENDER_DISTANCE_CHUNKS = 7;
export const UNLOAD_DISTANCE_CHUNKS = 10;
export const MAX_GEN_JOBS_INFLIGHT = 6;
export const MAX_MESH_JOBS_INFLIGHT = 4;
export const CHUNK_BUDGET_MS_PER_FRAME = 6;

export const LIGHT_MAX = 15;

export const GRAVITY = 26;
export const TERMINAL_VELOCITY = 55;
export const PLAYER_WIDTH = 0.62;
export const PLAYER_HEIGHT = 1.82;
export const PLAYER_EYE_HEIGHT = 1.64;
export const WALK_SPEED = 4.4;
export const SPRINT_SPEED = 6.8;
export const JUMP_SPEED = 8.6;
export const REACH = 5.5;
export const FIXED_DT = 1 / 60;

export const HOTBAR_SLOTS = 9;
export const INVENTORY_SLOTS = 36;
export const STACK_DEFAULT = 64;
export const TOOL_STACK = 1;

export const TOOL_TIERS = ['bare', 'chipped', 'ferrite', 'emberforged'];

export const TILES = [
  'soil_top',
  'soil_side',
  'loam',
  'palestone',
  'slatestone',
  'emberrock',
  'voidstone',
  'corestone',
  'log_side',
  'log_top',
  'plank',
  'leaf',
  'torch',
  'glowcap',
  'magma',
  'ash',
  'peat',
  'mossstone',
  'crystal',
  'stonebrick',
  'bench_top',
  'bench_side',
  'sprig',
  'embergrass',
  'berrybush',
  'rootsprout',
  'lantern',
  'scree',
  'ore_ferrite',
  'ore_cupral',
  'ore_lumen',
  'crack_0',
  'crack_1',
  'crack_2',
  'crack_3',
];

export const TILE = Object.fromEntries(TILES.map((name, i) => [name, i]));

export const ATLAS_TILES_PER_ROW = 8;
export const ATLAS_TILE_PX = 48;

export const MAX_DYNAMIC_POINT_LIGHTS = 12;

export const SAVE_KEY_META = 'meta';
export const SAVE_STORE_CHUNKS = 'chunks';
