export const RECIPES = [
  { out: { id: 'splint', count: 1 }, inputs: [['rootwood', 1]], station: null },
  { out: { id: 'heartplank', count: 4 }, inputs: [['rootwood', 1]], station: null },
  { out: { id: 'workbench', count: 1 }, inputs: [['heartplank', 4]], station: null },
  { out: { id: 'emberpaste', count: 2 }, inputs: [['ash', 2], ['spore', 1]], station: null },
  { out: { id: 'torchstake', count: 2 }, inputs: [['splint', 1], ['emberpaste', 1]], station: null },
  { out: { id: 'bowl', count: 1 }, inputs: [['splint', 2]], station: null },
  { out: { id: 'bandage', count: 1 }, inputs: [['fiber', 3]], station: null },
  { out: { id: 'roasted_rootvein', count: 1 }, inputs: [['rootvein', 1], ['ash', 1]], station: null },
  { out: { id: 'gloomberry_tart', count: 1 }, inputs: [['gloomberry', 2], ['splint', 1]], station: null },
  { out: { id: 'chipped_pick', count: 1 }, inputs: [['splint', 2], ['scree', 3]], station: null },
  { out: { id: 'chipped_axe', count: 1 }, inputs: [['splint', 2], ['scree', 3]], station: null },
  { out: { id: 'chipped_shovel', count: 1 }, inputs: [['splint', 1], ['scree', 2]], station: null },
  { out: { id: 'chipped_blade', count: 1 }, inputs: [['splint', 2], ['scree', 2]], station: null },

  { out: { id: 'stonebrick', count: 2 }, inputs: [['palestone', 2]], station: 'workbench' },
  { out: { id: 'rootstew', count: 1 }, inputs: [['bowl', 1], ['rootvein', 1], ['gloomberry', 1]], station: 'workbench' },
  { out: { id: 'lantern', count: 1 }, inputs: [['ferrite_chunk', 4], ['crystal_shard', 1], ['torchstake', 1]], station: 'workbench' },
  { out: { id: 'ferrite_pick', count: 1 }, inputs: [['splint', 2], ['ferrite_chunk', 3]], station: 'workbench' },
  { out: { id: 'ferrite_axe', count: 1 }, inputs: [['splint', 2], ['ferrite_chunk', 3]], station: 'workbench' },
  { out: { id: 'ferrite_shovel', count: 1 }, inputs: [['splint', 1], ['ferrite_chunk', 3]], station: 'workbench' },
  { out: { id: 'ferrite_blade', count: 1 }, inputs: [['splint', 1], ['ferrite_chunk', 2]], station: 'workbench' },
  { out: { id: 'emberforged_pick', count: 1 }, inputs: [['splint', 1], ['cupral_chunk', 2], ['lumen_dust', 1]], station: 'workbench' },
  { out: { id: 'emberforged_axe', count: 1 }, inputs: [['splint', 1], ['cupral_chunk', 2], ['lumen_dust', 1]], station: 'workbench' },
  { out: { id: 'emberforged_shovel', count: 1 }, inputs: [['splint', 1], ['cupral_chunk', 2], ['lumen_dust', 1]], station: 'workbench' },
  { out: { id: 'emberforged_blade', count: 1 }, inputs: [['splint', 1], ['cupral_chunk', 2], ['lumen_dust', 1]], station: 'workbench' },
];

export function canCraft(recipe, countFn, atStation = null) {
  if (!recipe || !recipe.out || !Array.isArray(recipe.inputs)) return false;
  const need = recipe.station || null;
  const at = atStation || null;
  if (need !== null && at !== need) return false;
  if (typeof countFn !== 'function') return false;
  for (const input of recipe.inputs) {
    const [id, n] = input;
    if ((countFn(id) | 0) < n) return false;
  }
  return true;
}

export function consumeInputs(recipe, inventory) {
  for (const [id, n] of recipe.inputs) inventory.remove(id, n);
}

export function craft(recipe, inventory, atStation = null) {
  if (!inventory) return false;
  if (!canCraft(recipe, (id) => inventory.count(id), atStation)) return false;
  consumeInputs(recipe, inventory);
  inventory.add(recipe.out.id, recipe.out.count);
  return true;
}

export function listCraftable(station = null, countFn = null) {
  const at = station || null;
  return RECIPES.filter(
    (r) => (r.station || null) === at && canCraft(r, countFn, at),
  );
}

export function recipesForStation(station = null) {
  const at = station || null;
  return RECIPES.filter((r) => (r.station || null) === at);
}

export const craftableList = listCraftable;
