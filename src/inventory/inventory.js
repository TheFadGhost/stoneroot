import { INVENTORY_SLOTS, HOTBAR_SLOTS } from '../config.js';
import { itemDef, maxStack } from '../items/items.js';

export class Inventory {
  constructor() {
    this.slots = new Array(INVENTORY_SLOTS).fill(null);
    this.selected = 0;
  }

  add(id, count, dur) {
    const def = itemDef(id);
    if (!def || !Number.isFinite(count) || count <= 0) return count || 0;
    let left = Math.floor(count);
    const cap = maxStack(id);
    if (def.tool) {
      while (left > 0) {
        const idx = this.slots.findIndex((s) => s === null);
        if (idx === -1) break;
        this.slots[idx] = { id, count: 1, dur: Number.isFinite(dur) ? Math.min(dur, def.tool.durabilityMax) : def.tool.durabilityMax };
        left -= 1;
      }
      return left;
    }
    for (let i = 0; i < INVENTORY_SLOTS && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < cap && s.dur == null) {
        const mv = Math.min(cap - s.count, left);
        s.count += mv;
        left -= mv;
      }
    }
    for (let i = 0; i < INVENTORY_SLOTS && left > 0; i++) {
      if (this.slots[i] === null) {
        const mv = Math.min(cap, left);
        this.slots[i] = { id, count: mv };
        left -= mv;
      }
    }
    return left;
  }

  remove(id, count) {
    if (this.count(id) < count) return false;
    let left = count;
    for (let i = INVENTORY_SLOTS - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, left);
        s.count -= take;
        left -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  removeAt(index, count) {
    if (index < 0 || index >= INVENTORY_SLOTS) return false;
    const s = this.slots[index];
    if (!s || s.count < count) return false;
    s.count -= count;
    if (s.count <= 0) this.slots[index] = null;
    return true;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  has(id, n = 1) {
    return this.count(id) >= n;
  }

  setSelected(i) {
    if (Number.isInteger(i)) this.selected = Math.max(0, Math.min(HOTBAR_SLOTS - 1, i));
    return this.selected;
  }

  hotbar() {
    return this.slots.slice(0, HOTBAR_SLOTS);
  }

  selectedItem() {
    return this.slots[this.selected] || null;
  }

  consumeSelected(n = 1) {
    const s = this.slots[this.selected];
    if (!s || s.count < n) return false;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    return true;
  }

  damageSelected(amount) {
    const s = this.slots[this.selected];
    if (!s || s.dur == null) return { broke: false };
    s.dur -= amount;
    if (s.dur <= 0) {
      this.slots[this.selected] = null;
      return { broke: true };
    }
    return { broke: false, dur: s.dur };
  }

  moveStack(fromIdx, toIdx) {
    const f = fromIdx | 0;
    const t = toIdx | 0;
    if (f === t || f < 0 || t < 0 || f >= INVENTORY_SLOTS || t >= INVENTORY_SLOTS) return null;
    const a = this.slots[f];
    if (!a) return null;
    const b = this.slots[t];
    if (!b) {
      this.slots[t] = a;
      this.slots[f] = null;
    } else if (b.id === a.id && b.dur == null && a.dur == null && b.count < maxStack(a.id)) {
      const room = maxStack(a.id) - b.count;
      const mv = Math.min(room, a.count);
      b.count += mv;
      a.count -= mv;
      if (a.count <= 0) this.slots[f] = null;
    } else {
      this.slots[f] = b;
      this.slots[t] = a;
    }
    return { from: cloneSlot(this.slots[f]), to: cloneSlot(this.slots[t]) };
  }

  serialize() {
    return {
      selected: this.selected,
      slots: this.slots.map((s) => (s ? { id: s.id, count: s.count, ...(s.dur != null ? { dur: s.dur } : {}) } : null)),
    };
  }

  static load(data) {
    try {
      const inv = new Inventory();
      if (!data || typeof data !== 'object') return inv;
      const arr = data.slots;
      if (Array.isArray(arr)) {
        for (let i = 0; i < Math.min(arr.length, INVENTORY_SLOTS); i++) {
          inv.slots[i] = sanitizeSlot(arr[i]);
        }
      }
      inv.selected = Number.isInteger(data.selected) && data.selected >= 0 && data.selected < HOTBAR_SLOTS
        ? data.selected
        : 0;
      return inv;
    } catch {
      return new Inventory();
    }
  }
}

function cloneSlot(s) {
  return s ? { ...s } : null;
}

function sanitizeSlot(raw) {
  try {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
    const def = itemDef(raw.id);
    if (!def) return null;
    const cap = maxStack(raw.id);
    let count = Number(raw.count);
    if (!Number.isFinite(count) || count < 1) return null;
    count = Math.min(Math.floor(count), cap);
    if (def.tool) {
      let dur = Number(raw.dur);
      if (!Number.isFinite(dur) || dur < 0) dur = def.tool.durabilityMax;
      return { id: raw.id, count: 1, dur: Math.min(Math.floor(dur), def.tool.durabilityMax) };
    }
    const slot = { id: raw.id, count };
    if (raw.dur != null && Number.isFinite(Number(raw.dur))) slot.dur = Number(raw.dur);
    return slot;
  } catch {
    return null;
  }
}
