import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SaveSystem,
  memoryAdapter,
  makeIdbAdapter,
  shouldAutosave,
  validateMeta,
  validateDiffs,
} from '../src/save/save.js';

function goodMeta(overrides = {}) {
  return {
    seed: 1337,
    timeOfDay: 0.25,
    playSeconds: 1234.5,
    player: { x: 1.5, y: 140.25, z: -3.75, yaw: 0.7, pitch: -0.2, hp: 17 },
    inventory: [null, { id: 'torchstake', count: 12 }, { id: 'chipped_pick', count: 1, durability: 41 }],
    ...overrides,
  };
}

function canonicalMeta(meta) {
  return {
    seed: meta.seed,
    timeOfDay: meta.timeOfDay,
    playSeconds: meta.playSeconds,
    player: { ...meta.player },
    inventory: meta.inventory.map((s) => (s === null ? null : { ...s })),
  };
}

function bigDiffs(n = 10000) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [i * 4, i % 256];
  return out;
}

test('meta round-trip is lossless on canonical projection', async () => {
  const sys = new SaveSystem(memoryAdapter());
  const meta = goodMeta({ junkKey: 'strip-me', nested: { also: 'stripped' } });
  await sys.saveMeta(meta);
  const loaded = await sys.loadMeta();
  assert.deepEqual(loaded, canonicalMeta(goodMeta()));
});

test('chunk diffs round-trip for multiple chunks incl 10k entries preserving order and pairs', async () => {
  const sys = new SaveSystem(memoryAdapter());
  const large = bigDiffs(10000);
  await sys.saveChunkDiffs(0, 0, large);
  await sys.saveChunkDiffs(3, -7, [[0, 255], [49151, 1]]);
  await sys.saveChunkDiffs(-2, 9, []);
  assert.deepEqual(await sys.loadChunkDiffs(0, 0), large);
  assert.deepEqual(await sys.loadChunkDiffs(3, -7), [[0, 255], [49151, 1]]);
  assert.deepEqual(await sys.loadChunkDiffs(-2, 9), []);
  assert.deepEqual(await sys.listSavedChunks(), ['-2,9', '0,0', '3,-7']);
  const loadedLarge = await sys.loadChunkDiffs(0, 0);
  assert.equal(loadedLarge.length, 10000);
  for (let i = 0; i < loadedLarge.length; i += 977) {
    assert.deepEqual(loadedLarge[i], [i * 4, i % 256]);
  }
  await sys.deleteChunkDiffs(3, -7);
  assert.equal(await sys.loadChunkDiffs(3, -7), null);
  assert.deepEqual(await sys.listSavedChunks(), ['-2,9', '0,0']);
});

test('validateMeta rejects bad shapes and accepts minimal good meta', () => {
  assert.equal(validateMeta({ ...goodMeta(), seed: undefined }), null);
  assert.equal(validateMeta({ ...goodMeta({ seed: 1337 }), seed: '1337' }), null);
  assert.equal(validateMeta(goodMeta({ player: { ...goodMeta().player, hp: NaN } })), null);
  assert.equal(validateMeta(goodMeta({ timeOfDay: -0.01 })), null);
  assert.equal(validateMeta(goodMeta({ timeOfDay: 1.01 })), null);
  assert.equal(
    validateMeta(goodMeta({ inventory: [{ id: 'splint', count: -3 }] })),
    null
  );
  assert.equal(validateMeta(goodMeta({ inventory: ['junk'] })), null);
  assert.equal(validateMeta(goodMeta({ playSeconds: -1 })), null);
  assert.equal(validateMeta('nope'), null);
  assert.equal(validateMeta(null), null);
  assert.equal(validateMeta([goodMeta()]), null);
  assert.notEqual(validateMeta(goodMeta()), null);
  const minimal = validateMeta({
    seed: 42,
    timeOfDay: 0,
    playSeconds: 0,
    player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 20 },
    inventory: [],
  });
  assert.deepEqual(minimal, {
    seed: 42,
    timeOfDay: 0,
    playSeconds: 0,
    player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 20 },
    inventory: [],
  });
});

test('loadMeta returns null without throwing on corrupted stored values', async () => {
  const sys = new SaveSystem(memoryAdapter());
  const corrupted = [
    'total garbage {{{',
    JSON.stringify({ seed: 1 }),
    42,
    true,
    null,
    [goodMeta()],
    goodMeta({ player: { x: 1, y: 'high' } }),
    goodMeta({ inventory: [{ id: 'ash', count: 2 }, [1, 2]] }),
  ];
  for (const bad of corrupted) {
    await sys.adapter.put('meta', bad);
    assert.equal(await sys.loadMeta(), null, `expected null for ${JSON.stringify(bad)}`);
  }
  assert.equal(await new SaveSystem(memoryAdapter()).loadMeta(), null);
});

test('wipe clears meta and chunks', async () => {
  const sys = new SaveSystem(memoryAdapter());
  await sys.saveMeta(goodMeta());
  await sys.saveChunkDiffs(1, 1, [[5, 6]]);
  assert.equal((await sys.adapter.keys()).length > 0, true);
  await sys.wipe();
  assert.deepEqual(await sys.adapter.keys(), []);
  assert.equal(await sys.loadMeta(), null);
  assert.deepEqual(await sys.listSavedChunks(), []);
});

test('exportSnapshot/importSnapshot round-trip equality and atomic rejection of bad snapshots', async () => {
  const a = new SaveSystem(memoryAdapter());
  await a.saveMeta(goodMeta());
  await a.saveChunkDiffs(-4, 2, [[10, 3], [999, 200]]);
  await a.saveChunkDiffs(8, 8, bigDiffs(500));
  const snap = await a.exportSnapshot();

  const b = new SaveSystem(memoryAdapter());
  assert.equal(await b.importSnapshot(snap), true);
  assert.deepEqual(await b.exportSnapshot(), snap);

  const before = await b.exportSnapshot();
  const badSnaps = [
    null,
    'snapshot',
    123,
    {},
    { chunks: {} },
    { meta: goodMeta(), chunks: { '0,0': [[1]] } },
    { meta: goodMeta(), chunks: { notAChunkKey: [] } },
    { meta: goodMeta({ seed: NaN }), chunks: {} },
  ];
  for (const bad of badSnaps) {
    assert.equal(await b.importSnapshot(bad), false, `expected false for ${JSON.stringify(bad)}`);
    assert.deepEqual(await b.exportSnapshot(), before);
  }
});

test('shouldAutosave boundary behavior', () => {
  assert.equal(shouldAutosave(30, 0), true);
  assert.equal(shouldAutosave(29.999, 0), false);
  assert.equal(shouldAutosave(60, 30), true);
  assert.equal(shouldAutosave(59.99, 30), false);
  assert.equal(shouldAutosave(100, 70), true);
  assert.equal(shouldAutosave(100, 70.5), false);
  assert.equal(shouldAutosave(10, 15), false);
  assert.equal(shouldAutosave(NaN, 0), false);
  assert.equal(shouldAutosave(50, Infinity), false);
  assert.equal(shouldAutosave(45, 15, 30), true);
  assert.equal(shouldAutosave(44.9, 15, 30), false);
  assert.equal(shouldAutosave(16, 15, 1), true);
});

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
  }

  fire(ok) {
    queueMicrotask(() => {
      const cb = ok ? this.onsuccess : this.onerror;
      if (cb) cb.call(this, { target: this });
    });
  }
}

class FakeDB {
  constructor() {
    this.stores = new Map([
      ['kv', new Map()],
      ['chunks', new Map()],
    ]);
  }

  get objectStoreNames() {
    return { contains: (n) => this.stores.has(n) };
  }

  createObjectStore(n) {
    this.stores.set(n, new Map());
  }

  transaction(name) {
    const store = this.stores.get(name) || new Map();
    return {
      objectStore() {
        return {
          get(k) {
            const r = new FakeRequest();
            queueMicrotask(() => {
              r.result = store.has(k) ? structuredClone(store.get(k)) : undefined;
            });
            r.fire(true);
            return r;
          },
          put(v, k) {
            const r = new FakeRequest();
            queueMicrotask(() => {
              store.set(k, structuredClone(v));
            });
            r.fire(true);
            return r;
          },
          delete(k) {
            const r = new FakeRequest();
            queueMicrotask(() => {
              store.delete(k);
            });
            r.fire(true);
            return r;
          },
          getAllKeys() {
            const r = new FakeRequest();
            queueMicrotask(() => {
              r.result = [...store.keys()];
            });
            r.fire(true);
            return r;
          },
        };
      },
    };
  }
}

function installFakeIdb() {
  const dbs = new Map();
  globalThis.indexedDB = {
    open(name) {
      const request = new FakeRequest();
      let db = dbs.get(name);
      queueMicrotask(() => {
        if (!db) {
          db = new FakeDB();
          dbs.set(name, db);
          request.result = db;
          if (request.onupgradeneeded) request.onupgradeneeded.call(request, { target: request });
        }
        request.result = db;
        request.fire(true);
      });
      return request;
    },
  };
  return () => {
    delete globalThis.indexedDB;
  };
}

test('makeIdbAdapter happy path against inline FakeIDB', async () => {
  const restore = installFakeIdb();
  try {
    const sys = new SaveSystem(makeIdbAdapter('stoneroot-fake-test'));
    await sys.saveMeta(goodMeta());
    assert.deepEqual(await sys.loadMeta(), canonicalMeta(goodMeta()));
    await sys.saveChunkDiffs(-1, 4, [[3, 9], [777, 44]]);
    assert.deepEqual(await sys.loadChunkDiffs(-1, 4), [[3, 9], [777, 44]]);
    assert.deepEqual(await sys.listSavedChunks(), ['-1,4']);
    await sys.wipe();
    assert.deepEqual(await sys.adapter.keys(), []);
  } finally {
    restore();
  }
});

test('makeIdbAdapter throws clear error only on use when indexedDB unavailable', async () => {
  assert.equal(globalThis.indexedDB, undefined);
  const adapter = makeIdbAdapter('stoneroot-missing');
  await assert.rejects(() => adapter.get('meta'), /indexedDB is not available/);
});
