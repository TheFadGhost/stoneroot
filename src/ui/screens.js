import { INVENTORY_SLOTS, HOTBAR_SLOTS } from '../config.js';
import { itemDef, drawIcon } from '../items/items.js';
import { canCraft, craft, recipesForStation } from '../items/crafting.js';

const CONTROLS = [
  ['WASD', 'move'],
  ['SPACE', 'jump'],
  ['SHIFT', 'sprint'],
  ['CTRL', 'crouch'],
  ['LMB', 'dig / strike'],
  ['RMB', 'place / consume'],
  ['1 - 9', 'hotbar slot'],
  ['WHEEL', 'cycle hotbar'],
  ['E', 'inventory'],
  ['ESC', 'pause'],
];

export class Screens {
  constructor(container, inventory, hooks = {}) {
    this.container = container;
    this.inventory = inventory;
    this.hooks = hooks;
    this.station = null;
    this.activeTab = 'hand';
    this.cursorItem = null;
    this.iconCache = new Map();
    this.invOpen = false;
    this.pauseOpen = false;
    this.deathOpen = false;
    this.titleOpen = false;

    this.root = document.createElement('div');
    this.root.className = 'sr-screens';
    container.appendChild(this.root);

    this.buildTitle();
    this.buildInventory();
    this.buildPause();
    this.buildDeath();

    this.onKeyDown = (e) => this.handleKey(e);
    this.onMouseMove = (e) => this.trackCursor(e.clientX, e.clientY);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  cachedIcon(id) {
    let cv = this.iconCache.get(id);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = 48;
      cv.height = 48;
      drawIcon(cv.getContext('2d'), id, 48);
      this.iconCache.set(id, cv);
    }
    return cv;
  }

  buildTitle() {
    const wrap = document.createElement('div');
    wrap.className = 'sr-screen sr-title';
    const mark = document.createElement('div');
    mark.className = 'sr-wordmark';
    'STONEROOT'.split('').forEach((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch;
      if (i === 6 || i === 7) span.classList.add('is-ember');
      mark.appendChild(span);
    });
    const sub = document.createElement('div');
    sub.className = 'sr-title-sub';
    sub.textContent = 'light is a resource. the dark keeps count.';
    const btn = document.createElement('button');
    btn.className = 'sr-btn sr-btn-primary';
    btn.textContent = 'DESCEND';
    btn.addEventListener('click', () => {
      this.hideTitle();
      if (typeof this.hooks.onStart === 'function') this.hooks.onStart();
      else if (typeof this.hooks.onResume === 'function') this.hooks.onResume();
    });
    wrap.appendChild(mark);
    wrap.appendChild(sub);
    wrap.appendChild(btn);
    this.titleEl = wrap;
    this.root.appendChild(wrap);
  }

  buildInventory() {
    const wrap = document.createElement('div');
    wrap.className = 'sr-screen sr-inv';
    const panel = document.createElement('div');
    panel.className = 'sr-panel sr-inv-panel';

    const head = document.createElement('div');
    head.className = 'sr-panel-head';
    const h = document.createElement('span');
    h.textContent = 'PACK';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sr-btn sr-btn-small';
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', () => this.toggleInventory(false));
    head.appendChild(h);
    head.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'sr-inv-body';

    const bagCol = document.createElement('div');
    bagCol.className = 'sr-inv-bag';
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'sr-grid';
    this.gridCells = [];
    for (let i = HOTBAR_SLOTS; i < INVENTORY_SLOTS; i++) {
      this.gridCells.push(this.makeCell(i));
    }
    this.gridCells.forEach((c) => this.gridEl.appendChild(c.el));
    const divider = document.createElement('div');
    divider.className = 'sr-divider';
    this.mirrorEl = document.createElement('div');
    this.mirrorEl.className = 'sr-grid sr-grid-hotbar';
    this.mirrorCells = [];
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      this.mirrorCells.push(this.makeCell(i));
    }
    this.mirrorCells.forEach((c) => this.mirrorEl.appendChild(c.el));
    bagCol.appendChild(this.gridEl);
    bagCol.appendChild(divider);
    bagCol.appendChild(this.mirrorEl);

    const craftCol = document.createElement('div');
    craftCol.className = 'sr-inv-craft';
    const tabs = document.createElement('div');
    tabs.className = 'sr-tabs';
    this.tabHand = document.createElement('button');
    this.tabHand.className = 'sr-tab';
    this.tabHand.textContent = 'HAND';
    this.tabHand.addEventListener('click', () => this.setTab('hand'));
    this.tabBench = document.createElement('button');
    this.tabBench.className = 'sr-tab';
    this.tabBench.textContent = 'WORKBENCH';
    this.tabBench.addEventListener('click', () => this.setTab('workbench'));
    tabs.appendChild(this.tabHand);
    tabs.appendChild(this.tabBench);
    this.recipeList = document.createElement('div');
    this.recipeList.className = 'sr-recipes';
    craftCol.appendChild(tabs);
    craftCol.appendChild(this.recipeList);

    body.appendChild(bagCol);
    body.appendChild(craftCol);
    panel.appendChild(head);
    panel.appendChild(body);
    wrap.appendChild(panel);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'sr-tooltip';
    this.ghost = document.createElement('div');
    this.ghost.className = 'sr-cursor-ghost';
    const gc = document.createElement('canvas');
    gc.width = 48;
    gc.height = 48;
    this.ghostCanvas = gc;
    const gcount = document.createElement('span');
    gcount.className = 'sr-count';
    this.ghostCount = gcount;
    this.ghost.appendChild(gc);
    this.ghost.appendChild(gcount);

    this.root.appendChild(this.tooltip);
    this.root.appendChild(this.ghost);
    this.invEl = wrap;
    this.root.appendChild(wrap);
  }

  makeCell(index) {
    const el = document.createElement('div');
    el.className = 'sr-cell';
    const cv = document.createElement('canvas');
    cv.width = 48;
    cv.height = 48;
    const count = document.createElement('span');
    count.className = 'sr-count';
    el.appendChild(cv);
    el.appendChild(count);
    const cell = { el, cv, count, index };
    el.addEventListener('click', (e) => {
      if (e.shiftKey) this.quickMove(index);
      else this.clickCell(index, e.button === 2);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.rightClick(index);
    });
    el.addEventListener('mouseenter', () => this.showTooltip(cell));
    el.addEventListener('mouseleave', () => this.hideTooltip());
    return cell;
  }

  buildPause() {
    const wrap = document.createElement('div');
    wrap.className = 'sr-screen sr-pause';
    const panel = document.createElement('div');
    panel.className = 'sr-panel sr-menu-panel';

    const h = document.createElement('div');
    h.className = 'sr-panel-title';
    h.textContent = 'HELD BREATH';

    const col = document.createElement('div');
    col.className = 'sr-menu-col';
    const mkBtn = (label, fn, primary = false) => {
      const b = document.createElement('button');
      b.className = 'sr-btn' + (primary ? ' sr-btn-primary' : '');
      b.textContent = label;
      b.addEventListener('click', fn);
      col.appendChild(b);
      return b;
    };
    mkBtn('RESUME', () => this.togglePause(false), true);
    mkBtn('SAVE', () => this.hooks.onSave && this.hooks.onSave());
    mkBtn('LOAD', () => this.hooks.onLoad && this.hooks.onLoad());

    const nwRow = document.createElement('div');
    nwRow.className = 'sr-row';
    this.seedInput = document.createElement('input');
    this.seedInput.type = 'text';
    this.seedInput.className = 'sr-input';
    this.seedInput.placeholder = 'seed';
    this.seedInput.maxLength = 32;
    const nwBtn = document.createElement('button');
    nwBtn.className = 'sr-btn';
    nwBtn.textContent = 'NEW WORLD';
    nwBtn.addEventListener('click', () => {
      if (this.hooks.onNewWorld) this.hooks.onNewWorld(this.seedInput.value.trim());
    });
    nwRow.appendChild(this.seedInput);
    nwRow.appendChild(nwBtn);
    col.appendChild(nwRow);

    this.settings = { master: 0.7, ambient: 0.7, sens: 1 };
    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'sr-sliders';
    this.mkSlider = (label, key) => {
      const row = document.createElement('label');
      row.className = 'sr-slider-row';
      const name = document.createElement('span');
      name.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(this.settings[key] * 100));
      input.addEventListener('input', () => {
        this.settings[key] = Number(input.value) / 100;
        this.container.dispatchEvent(new CustomEvent('stoneroot-settings', { detail: { ...this.settings } }));
      });
      row.appendChild(name);
      row.appendChild(input);
      sliderWrap.appendChild(row);
    };
    this.mkSlider('MASTER', 'master');
    this.mkSlider('AMBIENT', 'ambient');
    this.mkSlider('SENSITIVITY', 'sens');
    col.appendChild(sliderWrap);

    const controls = document.createElement('dl');
    controls.className = 'sr-controls';
    for (const [key, act] of CONTROLS) {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = act;
      controls.appendChild(dt);
      controls.appendChild(dd);
    }
    col.appendChild(controls);

    panel.appendChild(h);
    panel.appendChild(col);
    wrap.appendChild(panel);
    this.pauseEl = wrap;
    this.root.appendChild(wrap);
  }

  buildDeath() {
    const wrap = document.createElement('div');
    wrap.className = 'sr-screen sr-death';
    const inner = document.createElement('div');
    inner.className = 'sr-death-inner';
    const line = document.createElement('div');
    line.className = 'sr-death-line';
    line.textContent = 'the dark takes you';
    const note = document.createElement('div');
    note.className = 'sr-death-note';
    note.textContent = 'what you carried stays where it fell';
    const btn = document.createElement('button');
    btn.className = 'sr-btn sr-btn-primary';
    btn.textContent = 'RISE AGAIN';
    btn.addEventListener('click', () => {
      if (this.hooks.onRespawn) this.hooks.onRespawn();
    });
    inner.appendChild(line);
    inner.appendChild(note);
    inner.appendChild(btn);
    wrap.appendChild(inner);
    this.deathEl = wrap;
    this.root.appendChild(wrap);
  }

  handleKey(e) {
    const tag = e.target && e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (typing) {
      if (e.code === 'Escape') e.target.blur();
      return;
    }
    if (this.deathOpen || this.titleOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.invOpen) this.toggleInventory(false);
      else this.togglePause();
      return;
    }
    if (this.pauseOpen) return;
    if (e.code === 'KeyE' || e.code === 'KeyI') {
      e.preventDefault();
      this.toggleInventory();
      return;
    }
    if (/^Digit[1-9]$/.test(e.code)) {
      const idx = Number(e.code.slice(5)) - 1;
      this.inventory.setSelected(idx);
      if (this.hooks.onSelectSlot) this.hooks.onSelectSlot(idx);
      this.refreshAll();
    }
  }

  setTab(tab) {
    if (tab === 'workbench' && this.station !== 'workbench') return;
    this.activeTab = tab;
    this.renderCrafting();
  }

  setStation(station) {
    this.station = station === 'workbench' ? 'workbench' : null;
    if (this.station !== 'workbench' && this.activeTab === 'workbench') this.activeTab = 'hand';
    this.renderCrafting();
  }

  toggleInventory(force) {
    const want = force !== undefined ? force : !this.invOpen;
    if (want && (this.pauseOpen || this.deathOpen || this.titleOpen)) return;
    if (want === this.invOpen && force === undefined) return;
    this.invOpen = want;
    this.invEl.classList.toggle('is-open', want);
    if (!want && this.cursorItem) {
      const c = this.cursorItem;
      this.cursorItem = null;
      this.inventory.add(c.id, c.count, c.dur);
      this.renderCursor();
    }
    if (want) this.refreshAll();
  }

  togglePause(force) {
    const want = force !== undefined ? force : !this.pauseOpen;
    if (want && (this.deathOpen || this.titleOpen)) return;
    if (want && this.invOpen) this.toggleInventory(false);
    this.pauseOpen = want;
    this.pauseEl.classList.toggle('is-open', want);
    if (!want && typeof this.hooks.onResume === 'function') this.hooks.onResume();
  }

  showDeath() {
    this.deathOpen = true;
    this.toggleInventory(false);
    this.togglePause(false);
    this.deathEl.classList.add('is-open');
  }

  hideDeath() {
    this.deathOpen = false;
    this.deathEl.classList.remove('is-open');
  }

  showTitle() {
    this.titleOpen = true;
    this.titleEl.classList.add('is-open');
  }

  hideTitle() {
    this.titleOpen = false;
    this.titleEl.classList.remove('is-open');
  }

  clickCell(index, _rightButton) {
    const slots = this.inventory.slots;
    const slot = slots[index];
    if (!this.cursorItem && slot) {
      this.cursorItem = { ...slot };
      slots[index] = null;
    } else if (this.cursorItem && !slot) {
      slots[index] = { ...this.cursorItem };
      this.cursorItem = null;
    } else if (this.cursorItem && slot) {
      const cap = itemDef(slot.id) ? itemDef(slot.id).stack || 64 : 64;
      if (slot.id === this.cursorItem.id && slot.dur == null && this.cursorItem.dur == null && slot.count < cap) {
        const mv = Math.min(cap - slot.count, this.cursorItem.count);
        slot.count += mv;
        this.cursorItem.count -= mv;
        if (this.cursorItem.count <= 0) this.cursorItem = null;
      } else {
        slots[index] = { ...this.cursorItem };
        this.cursorItem = slot;
      }
    }
    this.refreshAll();
  }

  rightClick(index) {
    const slots = this.inventory.slots;
    const slot = slots[index];
    if (!this.cursorItem && slot) {
      const def = itemDef(slot.id);
      if (def && def.tool) {
        this.cursorItem = { ...slot };
        slots[index] = null;
      } else {
        const half = Math.ceil(slot.count / 2);
        this.cursorItem = { id: slot.id, count: half, ...(slot.dur != null ? { dur: slot.dur } : {}) };
        slot.count -= half;
        if (slot.count <= 0) slots[index] = null;
      }
    } else if (this.cursorItem) {
      if (!slot) {
        slots[index] = { id: this.cursorItem.id, count: 1, ...(this.cursorItem.dur != null ? { dur: this.cursorItem.dur } : {}) };
        this.cursorItem.count -= 1;
      } else if (slot.id === this.cursorItem.id && slot.dur == null && this.cursorItem.dur == null && slot.count < (itemDef(slot.id)?.stack || 64)) {
        slot.count += 1;
        this.cursorItem.count -= 1;
      }
      if (this.cursorItem && this.cursorItem.count <= 0) this.cursorItem = null;
    }
    this.refreshAll();
  }

  quickMove(index) {
    const slots = this.inventory.slots;
    const slot = slots[index];
    if (!slot) return;
    const targetStart = index < HOTBAR_SLOTS ? HOTBAR_SLOTS : 0;
    const targetEnd = index < HOTBAR_SLOTS ? INVENTORY_SLOTS : HOTBAR_SLOTS;
    const cap = itemDef(slot.id)?.stack || 64;
    if (slot.dur == null) {
      for (let i = targetStart; i < targetEnd && slot.count > 0; i++) {
        const t = slots[i];
        if (t && t.id === slot.id && t.dur == null && t.count < cap) {
          const mv = Math.min(cap - t.count, slot.count);
          t.count += mv;
          slot.count -= mv;
        }
      }
    }
    if (slot.count > 0) {
      for (let i = targetStart; i < targetEnd; i++) {
        if (!slots[i]) {
          slots[i] = slot;
          slots[index] = null;
          break;
        }
      }
    }
    if (slots[index] && slots[index].count <= 0) slots[index] = null;
    this.refreshAll();
  }

  trackCursor(x, y) {
    if (this.invOpen) {
      this.ghost.style.left = x + 10 + 'px';
      this.ghost.style.top = y + 10 + 'px';
      if (this.tooltip.classList.contains('is-show')) {
        this.tooltip.style.left = Math.min(x + 16, window.innerWidth - 240) + 'px';
        this.tooltip.style.top = Math.min(y + 16, window.innerHeight - 120) + 'px';
      }
    }
  }

  showTooltip(cell) {
    if (!this.invOpen) return;
    const slot = this.inventory.slots[cell.index];
    if (!slot) {
      this.hideTooltip();
      return;
    }
    const def = itemDef(slot.id);
    if (!def) return;
    const lines = [def.name];
    if (def.tool) {
      lines.push(def.tool.kind.toUpperCase() + '  tier ' + def.tool.tier);
      lines.push('damage ' + def.tool.damage + '  speed x' + def.tool.speed);
      lines.push('durability ' + Math.round(slot.dur == null ? def.tool.durabilityMax : slot.dur) + '/' + def.tool.durabilityMax);
    }
    if (def.food) lines.push('restores ' + def.food.heal);
    if (def.place != null) lines.push('placeable');
    this.tooltip.textContent = '';
    lines.forEach((t, i) => {
      const d = document.createElement('div');
      d.textContent = t;
      if (i === 0) d.className = 'sr-tooltip-name';
      this.tooltip.appendChild(d);
    });
    this.tooltip.classList.add('is-show');
  }

  hideTooltip() {
    this.tooltip.classList.remove('is-show');
  }

  renderCell(cell) {
    const slot = this.inventory.slots[cell.index];
    const ctx = cell.cv.getContext('2d');
    ctx.clearRect(0, 0, 48, 48);
    if (slot) {
      ctx.drawImage(this.cachedIcon(slot.id), 0, 0);
      cell.count.textContent = slot.count > 1 ? String(slot.count) : '';
      const def = itemDef(slot.id);
      cell.el.classList.toggle('has-dur', !!(def && def.tool && slot.dur != null));
      cell.el.style.setProperty('--dur-ratio', def && def.tool && slot.dur != null
        ? String(Math.max(0, Math.min(1, slot.dur / def.tool.durabilityMax)))
        : '0');
    } else {
      cell.count.textContent = '';
      cell.el.classList.remove('has-dur');
    }
    cell.el.classList.toggle('is-hot', cell.index === this.inventory.selected);
  }

  renderCursor() {
    if (this.cursorItem) {
      this.ghost.classList.add('is-show');
      const ctx = this.ghostCanvas.getContext('2d');
      ctx.clearRect(0, 0, 48, 48);
      ctx.drawImage(this.cachedIcon(this.cursorItem.id), 0, 0);
      this.ghostCount.textContent = this.cursorItem.count > 1 ? String(this.cursorItem.count) : '';
    } else {
      this.ghost.classList.remove('is-show');
    }
  }

  renderGrid() {
    for (const c of this.gridCells) this.renderCell(c);
    for (const c of this.mirrorCells) this.renderCell(c);
  }

  countFn() {
    return (id) => this.inventory.count(id);
  }

  recipeGate(recipe) {
    const at = this.activeTab === 'workbench' ? 'workbench' : null;
    if (typeof this.hooks.canCraftFn === 'function') return this.hooks.canCraftFn(recipe, this.countFn(), at);
    return canCraft(recipe, this.countFn(), at);
  }

  renderCrafting() {
    this.tabHand.classList.toggle('is-active', this.activeTab === 'hand');
    this.tabBench.classList.toggle('is-active', this.activeTab === 'workbench');
    this.tabBench.classList.toggle('is-locked', this.station !== 'workbench');
    const at = this.activeTab === 'workbench' ? 'workbench' : null;
    const recipes = recipesForStation(at);
    this.recipeList.textContent = '';
    for (const recipe of recipes) {
      const row = document.createElement('div');
      row.className = 'sr-recipe';
      const ok = this.recipeGate(recipe);
      row.classList.toggle('is-disabled', !ok);
      const icon = document.createElement('canvas');
      icon.width = 40;
      icon.height = 40;
      icon.className = 'sr-recipe-icon';
      drawIcon(icon.getContext('2d'), recipe.out.id, 40);
      const mid = document.createElement('div');
      mid.className = 'sr-recipe-mid';
      const name = document.createElement('div');
      name.className = 'sr-recipe-name';
      name.textContent = (itemDef(recipe.out.id)?.name || recipe.out.id) + (recipe.out.count > 1 ? ' x' + recipe.out.count : '');
      const chips = document.createElement('div');
      chips.className = 'sr-chips';
      for (const [id, n] of recipe.inputs) {
        const chip = document.createElement('span');
        chip.className = 'sr-chip ' + (this.inventory.count(id) >= n ? 'is-ok' : 'is-missing');
        chip.textContent = (itemDef(id)?.name || id) + ' ' + this.inventory.count(id) + '/' + n;
        chips.appendChild(chip);
      }
      mid.appendChild(name);
      mid.appendChild(chips);
      row.appendChild(icon);
      row.appendChild(mid);
      row.addEventListener('click', () => {
        if (!this.recipeGate(recipe)) return;
        if (typeof this.hooks.craftFn === 'function') this.hooks.craftFn(recipe, at);
        else craft(recipe, this.inventory, at);
        this.refreshAll();
      });
      this.recipeList.appendChild(row);
    }
  }

  refreshAll() {
    if (this.invOpen) {
      this.renderGrid();
      this.renderCursor();
      this.renderCrafting();
      this.hideTooltip();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }
}
