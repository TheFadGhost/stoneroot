import { CHUNK_SIZE, WORLD_HEIGHT, SAVE_KEY_META, SAVE_STORE_CHUNKS } from '../config.js';

const CHUNK_VOXEL_COUNT = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
const CHUNK_KEY_RE = /^(-?\d+),(-?\d+)$/;
const KV_STORE = 'kv';

export function memoryAdapter() {
  const map = new Map();
  return {
    async get(key) {
      if (!map.has(key)) return undefined;
      return structuredClone(map.get(key));
    },
    async put(key, val) {
      map.set(key, structuredClone(val));
    },
    async del(key) {
      map.delete(key);
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexedDB request failed'));
  });
}

export function makeIdbAdapter(dbName = 'stoneroot') {
  let dbPromise = null;
  function openDb() {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      return Promise.reject(new Error(`makeIdbAdapter('${dbName}'): indexedDB is not available in this environment`));
    }
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
          if (!db.objectStoreNames.contains(SAVE_STORE_CHUNKS)) db.createObjectStore(SAVE_STORE_CHUNKS);
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error || new Error(`makeIdbAdapter('${dbName}'): failed to open database`));
        request.onblocked = () => reject(new Error(`makeIdbAdapter('${dbName}'): open blocked by another connection`));
      });
    }
    return dbPromise;
  }
  async function runOnStore(key, mode, action) {
    const k = String(key);
    const db = await openDb();
    const storeName = CHUNK_KEY_RE.test(k) ? SAVE_STORE_CHUNKS : KV_STORE;
    const tx = db.transaction(storeName, mode);
    return requestToPromise(action(tx.objectStore(storeName), k));
  }
  return {
    get(key) {
      return runOnStore(key, 'readonly', (store, k) => store.get(k));
    },
    put(key, val) {
      return runOnStore(key, 'readwrite', (store, k) => store.put(structuredClone(val), k));
    },
    del(key) {
      return runOnStore(key, 'readwrite', (store, k) => store.delete(k));
    },
    async keys() {
      const db = await openDb();
      const kvKeys = await requestToPromise(db.transaction(KV_STORE, 'readonly').objectStore(KV_STORE).getAllKeys());
      const chunkKeys = await requestToPromise(
        db.transaction(SAVE_STORE_CHUNKS, 'readonly').objectStore(SAVE_STORE_CHUNKS).getAllKeys()
      );
      return [...kvKeys, ...chunkKeys].map((k) => String(k));
    },
  };
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function cleanSlot(slot) {
  if (slot === null) return null;
  if (!isPlainObject(slot)) return null;
  if (typeof slot.id !== 'string' || slot.id.length === 0) return null;
  if (!Number.isInteger(slot.count) || slot.count < 1) return null;
  const out = { id: slot.id, count: slot.count };
  for (const [k, v] of Object.entries(slot)) {
    if (k === 'id' || k === 'count') continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export function validateMeta(meta) {
  if (!isPlainObject(meta)) return null;
  if (!finiteNum(meta.seed)) return null;
  if (!finiteNum(meta.timeOfDay) || meta.timeOfDay < 0 || meta.timeOfDay > 1) return null;
  if (!finiteNum(meta.playSeconds) || meta.playSeconds < 0) return null;
  if (!isPlainObject(meta.player)) return null;
  const p = meta.player;
  for (const key of ['x', 'y', 'z', 'yaw', 'pitch']) {
    if (!finiteNum(p[key])) return null;
  }
  if (!finiteNum(p.hp) || p.hp < 0) return null;
  if (!Array.isArray(meta.inventory)) return null;
  const inventory = [];
  for (const slot of meta.inventory) {
    const clean = cleanSlot(slot);
    if (clean === null && slot !== null) return null;
    inventory.push(clean);
  }
  return {
    seed: meta.seed,
    timeOfDay: meta.timeOfDay,
    playSeconds: meta.playSeconds,
    player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp },
    inventory,
  };
}

export function validateDiffs(diffArray) {
  if (!Array.isArray(diffArray)) return null;
  const out = [];
  let prevIdx = -1;
  for (const entry of diffArray) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const idx = entry[0];
    const id = entry[1];
    if (!Number.isInteger(idx) || idx < 0 || idx >= CHUNK_VOXEL_COUNT) return null;
    if (!Number.isInteger(id) || id < 0 || id > 255) return null;
    if (idx <= prevIdx) return null;
    prevIdx = idx;
    out.push([idx, id]);
  }
  return out;
}

function parseChunkKey(key) {
  const m = CHUNK_KEY_RE.exec(String(key));
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export function shouldAutosave(nowSec, lastSec, interval = 30) {
  if (!Number.isFinite(nowSec) || !Number.isFinite(lastSec) || !Number.isFinite(interval)) return false;
  return nowSec - lastSec >= interval;
}

export class SaveSystem {
  constructor(adapter) {
    if (
      !adapter ||
      typeof adapter.get !== 'function' ||
      typeof adapter.put !== 'function' ||
      typeof adapter.del !== 'function' ||
      typeof adapter.keys !== 'function'
    ) {
      throw new TypeError('SaveSystem: adapter must implement async get/put/del/keys');
    }
    this.adapter = adapter;
  }

  async saveMeta(meta) {
    const clean = validateMeta(meta);
    if (!clean) throw new TypeError('SaveSystem.saveMeta: invalid meta rejected');
    await this.adapter.put(SAVE_KEY_META, clean);
    return clean;
  }

  async loadMeta() {
    let raw;
    try {
      raw = await this.adapter.get(SAVE_KEY_META);
    } catch {
      return null;
    }
    if (raw === undefined || raw === null) return null;
    let value = raw;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return null;
      }
    }
    return validateMeta(value);
  }

  async saveChunkDiffs(cx, cz, diffArray) {
    if (!Number.isInteger(cx) || !Number.isInteger(cz)) {
      throw new TypeError('SaveSystem.saveChunkDiffs: cx/cz must be integers');
    }
    const clean = validateDiffs(diffArray);
    if (!clean) throw new TypeError('SaveSystem.saveChunkDiffs: invalid diffs rejected');
    await this.adapter.put(chunkKey(cx, cz), clean);
  }

  async loadChunkDiffs(cx, cz) {
    if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null;
    let raw;
    try {
      raw = await this.adapter.get(chunkKey(cx, cz));
    } catch {
      return null;
    }
    return validateDiffs(raw);
  }

  async deleteChunkDiffs(cx, cz) {
    if (!Number.isInteger(cx) || !Number.isInteger(cz)) {
      throw new TypeError('SaveSystem.deleteChunkDiffs: cx/cz must be integers');
    }
    await this.adapter.del(chunkKey(cx, cz));
  }

  async listSavedChunks() {
    let keys;
    try {
      keys = await this.adapter.keys();
    } catch {
      return [];
    }
    const parsed = [];
    for (const k of keys) {
      const cc = parseChunkKey(k);
      if (cc) parsed.push(cc);
    }
    parsed.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return parsed.map(([cx, cz]) => `${cx},${cz}`);
  }

  async wipe() {
    const keys = await this.adapter.keys();
    for (const k of keys) await this.adapter.del(k);
  }

  async saveAll(meta, chunksByKey) {
    await this.saveMeta(meta);
    if (!isPlainObject(chunksByKey)) return;
    for (const [key, diffs] of Object.entries(chunksByKey)) {
      const cc = parseChunkKey(key);
      if (!cc) throw new TypeError(`SaveSystem.saveAll: bad chunk key '${key}'`);
      await this.saveChunkDiffs(cc[0], cc[1], diffs);
    }
  }

  async loadDiffs() {
    const out = {};
    for (const key of await this.listSavedChunks()) {
      const cc = parseChunkKey(key);
      const diffs = await this.loadChunkDiffs(cc[0], cc[1]);
      if (diffs !== null) out[key] = diffs;
    }
    return out;
  }

  async exportSnapshot() {
    return { meta: await this.loadMeta(), chunks: await this.loadDiffs() };
  }

  async importSnapshot(obj) {
    if (!isPlainObject(obj)) return false;
    const meta = validateMeta(obj.meta);
    if (!meta) return false;
    if (!isPlainObject(obj.chunks)) return false;
    const chunks = {};
    for (const [key, diffs] of Object.entries(obj.chunks)) {
      if (!parseChunkKey(key)) return false;
      const clean = validateDiffs(diffs);
      if (!clean) return false;
      chunks[key] = clean;
    }
    await this.wipe();
    await this.adapter.put(SAVE_KEY_META, meta);
    for (const [key, diffs] of Object.entries(chunks)) {
      await this.adapter.put(key, diffs);
    }
    return true;
  }
}
