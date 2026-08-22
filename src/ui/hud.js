import { HOTBAR_SLOTS } from '../config.js';
import { itemDef, drawIcon } from '../items/items.js';

const PHASES = ['dawn', 'noon', 'dusk', 'midnight'];

export class Hud {
  constructor(container, inventory) {
    this.inventory = inventory;
    this.iconCache = new Map();
    this.slotSigs = new Array(HOTBAR_SLOTS).fill('');
    this.lastLit = -1;
    this.lastReadout = '';
    this.toastTimers = [];

    this.root = document.createElement('div');
    this.root.className = 'sr-hud';

    this.vignette = document.createElement('div');
    this.vignette.className = 'sr-vignette';
    this.root.appendChild(this.vignette);

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'sr-crosshair';
    this.root.appendChild(this.crosshair);

    this.lightRing = document.createElement('canvas');
    this.lightRing.className = 'sr-light-ring';
    this.lightRing.width = 64;
    this.lightRing.height = 64;
    this.lightCtx = this.lightRing.getContext('2d');
    this.root.appendChild(this.lightRing);

    this.hotbar = document.createElement('div');
    this.hotbar.className = 'sr-hotbar';
    this.cells = [];
    this.cellCanvases = [];
    this.countBadges = [];
    this.durBars = [];
    this.durWraps = [];
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const cell = document.createElement('div');
      cell.className = 'sr-slot';
      const cv = document.createElement('canvas');
      cv.width = 48;
      cv.height = 48;
      cv.className = 'sr-slot-icon';
      const count = document.createElement('span');
      count.className = 'sr-count';
      const durWrap = document.createElement('div');
      durWrap.className = 'sr-dur';
      const durBar = document.createElement('i');
      durWrap.appendChild(durBar);
      cell.appendChild(cv);
      cell.appendChild(count);
      cell.appendChild(durWrap);
      this.hotbar.appendChild(cell);
      this.cells.push(cell);
      this.cellCanvases.push(cv);
      this.countBadges.push(count);
      this.durBars.push(durBar);
      this.durWraps.push(durWrap);
    }
    this.root.appendChild(this.hotbar);

    this.vitals = document.createElement('div');
    this.vitals.className = 'sr-vitals';
    this.pips = [];
    for (let i = 0; i < 10; i++) {
      const pip = document.createElement('div');
      pip.className = 'sr-pip';
      this.vitals.appendChild(pip);
      this.pips.push(pip);
    }
    this.root.appendChild(this.vitals);

    this.readout = document.createElement('div');
    this.readout.className = 'sr-readout';
    this.readDepth = document.createElement('div');
    this.readBiome = document.createElement('div');
    this.readTime = document.createElement('div');
    this.readout.appendChild(this.readDepth);
    this.readout.appendChild(this.readBiome);
    this.readout.appendChild(this.readTime);
    this.root.appendChild(this.readout);

    this.toasts = document.createElement('div');
    this.toasts.className = 'sr-toasts';
    this.root.appendChild(this.toasts);

    container.appendChild(this.root);
  }

  cachedIcon(id) {
    let cv = this.iconCache.get(id);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = 48;
      cv.height = 48;
      const ctx = cv.getContext('2d');
      drawIcon(ctx, id, 48);
      this.iconCache.set(id, cv);
    }
    return cv;
  }

  slotSig(slot) {
    if (!slot) return '';
    return slot.id + ':' + slot.count + ':' + (slot.dur == null ? '' : Math.round(slot.dur));
  }

  renderHotbar(selectedIdx) {
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const slot = this.inventory.slots[i];
      const sig = this.slotSig(slot);
      if (sig !== this.slotSigs[i]) {
        this.slotSigs[i] = sig;
        const ctx = this.cellCanvases[i].getContext('2d');
        ctx.clearRect(0, 0, 48, 48);
        if (slot) {
          ctx.drawImage(this.cachedIcon(slot.id), 0, 0);
          const def = itemDef(slot.id);
          if (def && def.tool && slot.dur != null) {
            const ratio = Math.max(0, Math.min(1, slot.dur / def.tool.durabilityMax));
            this.durWraps[i].classList.add('has-dur');
            this.durBars[i].style.width = (ratio * 100).toFixed(1) + '%';
            this.durBars[i].classList.toggle('is-warn', ratio < 0.3);
            this.durBars[i].classList.toggle('is-dead', ratio <= 0);
          } else {
            this.durWraps[i].classList.remove('has-dur');
            this.durBars[i].style.width = '0%';
          }
        } else {
          this.durWraps[i].classList.remove('has-dur');
          this.durBars[i].style.width = '0%';
        }
        this.countBadges[i].textContent = slot && slot.count > 1 ? String(slot.count) : '';
      }
      const selected = i === selectedIdx;
      if (selected !== this.cells[i].classList.contains('is-selected')) {
        this.cells[i].classList.toggle('is-selected', selected);
      }
    }
  }

  renderPips(hp, hpMax) {
    const max = hpMax > 0 ? hpMax : 10;
    const lit = Math.max(0, Math.min(10, Math.ceil((hp / max) * 10)));
    if (lit !== this.lastLit) {
      this.lastLit = lit;
      for (let i = 0; i < 10; i++) this.pips[i].classList.toggle('is-off', i >= lit);
      this.vitals.classList.toggle('is-low', lit > 0 && lit <= 3);
      this.vitals.classList.toggle('is-flat', lit <= 0);
    }
  }

  renderLight(lightLevel) {
    const ctx = this.lightCtx;
    const c = 32;
    const r = 24;
    ctx.clearRect(0, 0, 64, 64);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(107,101,112,0.45)';
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
    const v = Math.max(0, Math.min(1, lightLevel / 15));
    if (v > 0) {
      ctx.strokeStyle = '#46e0c8';
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2);
      ctx.stroke();
      if (v >= 0.75) {
        ctx.strokeStyle = 'rgba(70,224,200,0.25)';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  renderReadout(state) {
    const depth = Number.isFinite(state.depth) ? Math.round(state.depth) : 0;
    const phase = PHASES[Math.round(((state.timeOfDay % 1) + 1) % 1 * 4) % 4];
    const key = depth + '|' + state.biome + '|' + phase;
    if (key === this.lastReadout) return;
    this.lastReadout = key;
    this.readDepth.textContent = depth + 'm down';
    this.readBiome.textContent = String(state.biome || 'unknown').toUpperCase();
    this.readTime.textContent = phase;
  }

  update(state) {
    const sel = Number.isInteger(state.selectedSlot)
      ? Math.max(0, Math.min(HOTBAR_SLOTS - 1, state.selectedSlot))
      : this.inventory.selected;
    this.renderHotbar(sel);
    this.renderPips(state.hp != null ? state.hp : 10, state.hpMax != null ? state.hpMax : 10);
    this.renderLight(Number(state.lightLevel) || 0);
    this.renderReadout(state);
  }

  showToast(text) {
    while (this.toasts.children.length >= 4) {
      this.toasts.removeChild(this.toasts.firstChild);
    }
    const el = document.createElement('div');
    el.className = 'sr-toast';
    el.textContent = String(text);
    this.toasts.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const t1 = setTimeout(() => el.classList.add('is-out'), 2400);
    const t2 = setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2900);
    this.toastTimers.push(t1, t2);
  }

  damageFlash(strength = 1) {
    this.vignette.style.setProperty('--flash', String(Math.max(0.15, Math.min(1, strength))));
    this.vignette.classList.remove('is-flash');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('is-flash');
  }

  dispose() {
    for (const t of this.toastTimers) clearTimeout(t);
    this.toastTimers.length = 0;
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
  }
}
