import test from 'node:test';
import assert from 'assert/strict';
import { ITEMS, itemDef, drawIcon } from '../src/items/items.js';
import { RECIPES, canCraft, craft, listCraftable, recipesForStation } from '../src/items/crafting.js';
import { Inventory } from '../src/inventory/inventory.js';
import { BLOCK_DEFS } from '../src/blocks.js';

test('inventory add returns correct leftovers and splits stacks', () => {
  const inv = new Inventory();
  assert.equal(inv.add('splint', 100), 0);
  assert.equal(inv.count('splint'), 100);
  let filled = 0;
  for (const s of inv.slots) {
    if (s && s.id === 'splint') filled += s.count;
  }
  assert.equal(filled, 100);
  const full = new Inventory();
  for (let i = 0; i < 36; i++) full.add('ash', 64);
  assert.equal(full.count('ash'), 2304);
  assert.equal(full.add('ash', 10), 10);
});

test('inventory add of unknown item rejects', () => {
  const inv = new Inventory();
  assert.equal(inv.add('nonexistent_thing', 5), 5);
  assert.equal(inv.count('nonexistent_thing'), 0);
});

test('remove and count behave', () => {
  const inv = new Inventory();
  inv.add('scree', 10);
  assert.equal(inv.remove('scree', 4), true);
  assert.equal(inv.count('scree'), 6);
  assert.equal(inv.remove('scree', 7), false);
  assert.equal(inv.count('scree'), 6);
  assert.equal(inv.remove('scree', 6), true);
  assert.equal(inv.count('scree'), 0);
  assert.equal(inv.remove('scree', 1), false);
});

test('tools never stack and carry durability', () => {
  const inv = new Inventory();
  assert.equal(inv.add('chipped_pick', 3), 0);
  const picks = inv.slots.filter((s) => s && s.id === 'chipped_pick');
  assert.equal(picks.length, 3);
  for (const p of picks) {
    assert.equal(p.count, 1);
    assert.equal(p.dur, 60);
  }
  assert.equal(inv.count('chipped_pick'), 3);
});

test('serialize load round-trip equality', () => {
  const inv = new Inventory();
  inv.add('splint', 70);
  inv.add('ferrite_blade', 1);
  inv.add('gloomberry', 12);
  inv.setSelected(4);
  const data = inv.serialize();
  const restored = Inventory.load(data);
  assert.deepEqual(restored.serialize(), data);
});

test('load with garbage never throws and yields usable inventory', () => {
  const bad = [null, undefined, 42, 'nope', [], { slots: 'x' }, { slots: [{ id: 'ghost_item', count: 5 }] }, { slots: [{ id: 'splint', count: -3 }] }, { slots: [{ id: 'splint' }] }];
  for (const b of bad) {
    const inv = Inventory.load(b);
    assert.ok(inv instanceof Inventory);
    assert.equal(inv.slots.length, 36);
    assert.ok(inv.selected >= 0 && inv.selected < 9);
  }
  const weird = Inventory.load({ slots: [{ id: 'splint', count: 9999 }], selected: 99 });
  assert.equal(weird.slots[0].count, 64);
  assert.equal(weird.selected, 0);
});

test('moveStack swap merge move semantics', () => {
  const inv = new Inventory();
  inv.add('splint', 10);
  inv.add('ash', 5);
  const moved = inv.moveStack(0, 5);
  assert.equal(inv.slots[0], null);
  assert.equal(inv.slots[5].id, 'splint');
  assert.equal(moved.to.id, 'splint');
  inv.slots[7] = { id: 'ash', count: 62 };
  inv.slots[8] = { id: 'ash', count: 3 };
  inv.moveStack(8, 7);
  assert.equal(inv.slots[7].count, 64);
  assert.equal(inv.slots[8].count, 1);
  inv.moveStack(8, 9);
  assert.equal(inv.slots[8], null);
  assert.equal(inv.slots[9].id, 'ash');
  inv.slots[8] = { id: 'splint', count: 4 };
  inv.moveStack(8, 9);
  assert.equal(inv.slots[8].id, 'ash');
  assert.equal(inv.slots[9].id, 'splint');
  assert.equal(inv.moveStack(3, 3), null);
});

test('consumeSelected and damageSelected', () => {
  const inv = new Inventory();
  inv.add('rootstew', 2);
  inv.setSelected(0);
  assert.equal(inv.consumeSelected(2), true);
  assert.equal(inv.slots[0], null);
  assert.equal(inv.consumeSelected(1), false);
  inv.add('chipped_pick', 1);
  inv.setSelected(0);
  const r1 = inv.damageSelected(59);
  assert.deepEqual(r1, { broke: false, dur: 1 });
  const r2 = inv.damageSelected(5);
  assert.deepEqual(r2, { broke: true });
  assert.equal(inv.slots[0], null);
  const empty = inv.damageSelected(3);
  assert.deepEqual(empty, { broke: false });
});

test('canCraft respects counts and station gate', () => {
  const benchRecipe = RECIPES.find((r) => r.out.id === 'lantern');
  const handRecipe = RECIPES.find((r) => r.out.id === 'chipped_pick');
  const counts = { splint: 2, scree: 3 };
  assert.equal(canCraft(handRecipe, (id) => counts[id] || 0), true);
  assert.equal(canCraft(handRecipe, (id) => (counts[id] || 0), 'workbench'), true);
  assert.equal(canCraft(benchRecipe, () => 99, null), false);
  assert.equal(canCraft(benchRecipe, () => 99, 'workbench'), true);
  assert.equal(canCraft(null, () => 99), false);
});

test('craft consumes exactly and adds output', () => {
  const inv = new Inventory();
  inv.add('bowl', 1);
  inv.add('rootvein', 1);
  inv.add('gloomberry', 1);
  const recipe = RECIPES.find((r) => r.out.id === 'rootstew');
  assert.equal(craft(recipe, inv, 'workbench'), true);
  assert.equal(inv.count('bowl'), 0);
  assert.equal(inv.count('rootvein'), 0);
  assert.equal(inv.count('gloomberry'), 0);
  assert.equal(inv.count('rootstew'), 1);
});

test('failed craft mutates nothing', () => {
  const inv = new Inventory();
  inv.add('splint', 1);
  const before = JSON.stringify(inv.serialize());
  const recipe = RECIPES.find((r) => r.out.id === 'chipped_pick');
  assert.equal(craft(recipe, inv), false);
  assert.equal(JSON.stringify(inv.serialize()), before);
  const benchOnly = RECIPES.find((r) => r.out.id === 'stonebrick');
  inv.add('palestone', 2);
  const beforeBench = JSON.stringify(inv.serialize());
  assert.equal(craft(benchOnly, inv), false);
  assert.equal(JSON.stringify(inv.serialize()), beforeBench);
});

test('listCraftable filters by station and resources', () => {
  const inv = new Inventory();
  inv.add('rootwood', 2);
  const handIds = listCraftable(null, (id) => inv.count(id)).map((r) => r.out.id);
  assert.ok(handIds.includes('splint'));
  assert.ok(!handIds.includes('lantern'));
  const benchIds = listCraftable('workbench', () => 99).map((r) => r.out.id);
  assert.ok(benchIds.includes('lantern'));
  assert.equal(listCraftable('workbench', (id) => inv.count(id)).length, 0);
});

test('recipe book size at least twenty', () => {
  assert.ok(RECIPES.length >= 20, 'expected >= 20 recipes, got ' + RECIPES.length);
  assert.equal(recipesForStation(null).length + recipesForStation('workbench').length, RECIPES.length);
});

test('progression sanity chipped pick from starting kit', () => {
  const inv = new Inventory();
  inv.add('splint', 2);
  inv.add('scree', 3);
  const recipe = RECIPES.find((r) => r.out.id === 'chipped_pick');
  assert.equal(canCraft(recipe, (id) => inv.count(id)), true);
  assert.equal(craft(recipe, inv), true);
  assert.equal(inv.count('chipped_pick'), 1);
  assert.equal(inv.count('splint'), 0);
  assert.equal(inv.count('scree'), 0);
  const toolSlot = inv.slots.find((s) => s && s.id === 'chipped_pick');
  assert.equal(toolSlot.dur, 60);
});

test('every recipe id exists in ITEMS', () => {
  for (const r of RECIPES) {
    assert.ok(itemDef(r.out.id), 'missing output item ' + r.out.id);
    for (const [id] of r.inputs) {
      assert.ok(itemDef(id), 'missing input item ' + id);
    }
  }
});

test('every place item references valid block', () => {
  const blockIds = new Set(BLOCK_DEFS.map((d) => d.id));
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.place != null) {
      assert.ok(blockIds.has(def.place), 'item ' + id + ' places unknown block ' + def.place);
    }
  }
  assert.equal(itemDef('torchstake').place, 11);
  assert.equal(itemDef('lantern').place, 24);
  assert.equal(itemDef('workbench').place, 19);
});

test('registry has at least thirty four items', () => {
  assert.ok(Object.keys(ITEMS).length >= 34, 'expected >= 34 items, got ' + Object.keys(ITEMS).length);
});

test('required progression items exist with expected shapes', () => {
  for (const id of ['torchstake', 'lantern', 'heartplank', 'stonebrick', 'workbench', 'fiber', 'splint', 'ash', 'spore', 'gloomberry', 'rootvein', 'roasted_rootvein', 'ferrite_chunk', 'cupral_chunk', 'lumen_dust', 'crystal_shard', 'emberpaste', 'bowl', 'rootstew', 'gloomberry_tart', 'bandage', 'loam', 'palestone', 'slatestone', 'emberrock', 'voidstone', 'gloomleaf', 'glowcap', 'peat', 'mosspale', 'ashpile', 'scree', 'rootwood', 'crystalblock']) {
    assert.ok(itemDef(id), 'missing required item ' + id);
  }
  assert.deepEqual(itemDef('bandage').food, { heal: 5 });
  assert.deepEqual(itemDef('roasted_rootvein').food, { heal: 4 });
  assert.deepEqual(itemDef('rootstew').food, { heal: 9 });
  assert.equal(itemDef('chipped_pick').tool.speed, 2);
  assert.equal(itemDef('ferrite_blade').tool.tier, 2);
  assert.equal(itemDef('emberforged_blade').tool.damage, 9);
});

test('drawIcon is a callable function', () => {
  assert.equal(typeof drawIcon, 'function');
});
