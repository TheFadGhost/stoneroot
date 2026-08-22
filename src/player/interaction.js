import { raycastVoxel } from '../physics/raycast.js';
import { BLOCK, blockDef } from '../blocks.js';
import { ITEMS, itemDef } from '../items/items.js';

const BASE_BREAK_RATE = 1.7;

export class Interaction {
  constructor(world, controller, inventory, hooks = {}) {
    this.world = world;
    this.player = controller;
    this.inv = inventory;
    this.audio = hooks.audio || null;
    this.particles = hooks.particles || null;
    this.onOpenWorkbench = hooks.onOpenWorkbench || (() => {});
    this.onBlockBroken = hooks.onBlockBroken || (() => {});
    this.onDrops = hooks.onDrops || (() => {});
    this.pushNoise = hooks.pushNoise || (() => {});
    this.toast = hooks.toast || (() => {});
    this.tileAvg = hooks.tileAvg || null;
    this.mobs = null;

    this.mining = false;
    this.target = null;
    this.progress = 0;
    this.digTimer = 0;
    this.attackCd = 0;
    this.lastStage = -1;
  }

  setMining(v) {
    if (v && !this.mining) {
      this.progress = 0;
      this.target = null;
      this.lastStage = -1;
    }
    this.mining = v;
  }

  eyePos() {
    const p = this.player.pos;
    const h = this.player.getEyeHeight();
    return [p.x, p.y + h, p.z];
  }

  lookDir() {
    const y = this.player.yaw;
    const p = this.player.pitch;
    const cp = Math.cos(p);
    return [-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp];
  }

  currentHit(maxDist) {
    const [ox, oy, oz] = this.eyePos();
    const [dx, dy, dz] = this.lookDir();
    return raycastVoxel(this.world, ox, oy, oz, dx, dy, dz, maxDist);
  }

  toolFor() {
    const sel = this.inv.selectedItem ? this.inv.selectedItem() : null;
    if (!sel) return null;
    const d = itemDef(sel.id);
    return d && d.tool ? d.tool : null;
  }

  update(dt) {
    this.attackCd = Math.max(0, this.attackCd - dt);

    if (!this.mining) {
      this.progress = 0;
      this.target = null;
      this.lastStage = -1;
      return;
    }

    const hit = this.currentHit();
    if (!hit) {
      this.progress = 0;
      this.target = null;
      return;
    }
    const def = blockDef(hit.id);
    if (def.hardness === Infinity) {
      this.progress = 0;
      this.target = null;
      return;
    }
    const tk = `${hit.x},${hit.y},${hit.z}`;
    if (this.target !== tk) {
      this.target = tk;
      this.progress = 0;
      this.lastStage = -1;
    }

    const tool = this.toolFor();
    let mult = 0.28;
    if (tool && def.tool !== 'none' && tool.kind === def.tool) mult = tool.speed;
    else if (tool && def.tool === 'none') mult = Math.max(0.6, tool.speed * 0.5);

    this.progress += (dt * BASE_BREAK_RATE * mult) / Math.max(0.05, def.hardness);

    this.digTimer -= dt;
    if (this.digTimer <= 0) {
      this.digTimer = 0.22;
      if (this.audio) this.audio.dig(def.soundMat);
      if (this.particles) {
        this.particles.spawnBurst(
          hit.x + 0.5 + hit.nx * 0.55,
          hit.y + 0.5 + hit.ny * 0.55,
          hit.z + 0.5 + hit.nz * 0.55,
          this.tileColorOf(def), 2, 0.12, 1.4
        );
      }
      this.pushNoise(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 9, 'dig');
    }

    if (this.progress >= 1) {
      this.completeBreak(hit, def);
    }
  }

  stage() {
    if (!this.mining || this.progress <= 0.02) return -1;
    return Math.min(3, Math.floor(this.progress * 4));
  }

  targetInfo() {
    const hit = this.currentHit();
    if (!hit) return null;
    return { x: hit.x, y: hit.y, z: hit.z, id: hit.id };
  }

  tileColorOf(def) {
    if (this.tileAvg) {
      const t = def.tiles || {};
      const name = t.all || t.side || 'loam';
      const c = this.tileAvg(name);
      if (c) return c;
    }
    return '#8a8492';
  }

  completeBreak(hit, def) {
    this.progress = 0;
    this.target = null;
    this.world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
    if (this.audio) this.audio.breakBlock(def.soundMat);
    if (this.particles) {
      this.particles.spawnBurst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, this.tileColorOf(def), 16, 0.45, 3.2);
    }
    this.pushNoise(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 13, 'break');

    const drops = [];
    for (const dr of def.drops || []) {
      const chance = dr.chance === undefined ? 1 : dr.chance;
      if (Math.random() > chance) continue;
      let idv = null;
      if (dr.item) idv = dr.item;
      else if (dr.block != null) idv = this.blockItemId(dr.block);
      if (idv) drops.push({ id: idv, count: dr.count || 1 });
    }
    for (const d of drops) {
      const left = this.inv.add(d.id, d.count);
      if (left > 0) this.toast('pack is full');
    }
    if ((def.drops || []).length) this.onDrops();

    const tool = this.toolFor();
    if (tool) {
      const r = this.inv.damageSelected(1);
      if (r.broke && this.audio) this.audio.craft();
    }
    this.onBlockBroken(hit, def);
  }

  blockItemId(blockId) {
    for (const [iid, d] of Object.entries(ITEMS)) {
      if (d.place === blockId) return iid;
    }
    return null;
  }

  tryUse() {
    const hit = this.currentHit();
    if (hit && hit.id === BLOCK.WORKBENCH) {
      this.onOpenWorkbench();
      return true;
    }
    const sel = this.inv.selectedItem ? this.inv.selectedItem() : null;
    if (!sel) return false;
    const d = itemDef(sel.id);
    if (!d || d.place == null) return false;
    if (!hit) return false;

    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    const cur = this.world.getBlock(px, py, pz);
    if (cur !== BLOCK.AIR && blockDef(cur).renderType === 0 && cur !== BLOCK.MAGMA) return false;
    if (!blockDef(cur).solid && cur !== BLOCK.AIR && cur !== BLOCK.MAGMA) {
      this.world.setBlock(px, py, pz, BLOCK.AIR);
    }

    const bdef = blockDef(d.place);
    if (bdef.renderType === 1) {
      let supported = false;
      for (let f = 0; f < 6; f++) {
        const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][f];
        if (blockDef(this.world.getBlock(px + n[0], py + n[1], pz + n[2])).solid) {
          supported = true;
          break;
        }
      }
      if (!supported) return false;
    }
    if (bdef.solid && this.boxIntersectsPlayer(px, py, pz)) return false;

    if (!this.world.setBlock(px, py, pz, d.place)) return false;

    const left = this.inv.consumeSelected(1);
    void left;
    if (this.audio) this.audio.place(bdef.soundMat);
    if (this.particles) {
      this.particles.spawnBurst(px + 0.5, py + 0.5, pz + 0.5, this.tileColorOf(bdef), 6, 0.3, 1.6);
    }
    this.pushNoise(px + 0.5, py + 0.5, pz + 0.5, 7, 'place');
    return true;
  }

  boxIntersectsPlayer(bx, by, bz) {
    const p = this.player.pos;
    const hw = 0.31;
    const overlap =
      bx + 1 > p.x - hw && bx < p.x + hw &&
      bz + 1 > p.z - hw && bz < p.z + hw &&
      by + 1 > p.y && by < p.y + 1.82;
    return overlap;
  }

  tryAttack(mobManager) {
    if (this.attackCd > 0 || !mobManager) return false;
    const [ox, oy, oz] = this.eyePos();
    const [dx, dy, dz] = this.lookDir();
    let best = null;
    let bestT = Infinity;
    for (const mob of mobManager.mobs) {
      const t = this.rayAabb(ox, oy, oz, dx, dy, dz, mob);
      if (t != null && t < bestT && t < 3.8) {
        best = mob;
        bestT = t;
      }
    }
    this.attackCd = 0.38;
    if (!best) return false;
    const tool = this.toolFor();
    const dmg = tool ? Math.max(1, Math.round((tool.damage || 2))) : 1;
    const kb = { x: dx * 7.5, y: 3.4, z: dz * 7.5 };
    mobManager.damageMob(best, dmg, kb);
    if (this.audio) this.audio.attackHit();
    if (this.particles) {
      this.particles.spawnBurst(best.pos.x, best.pos.y + best.aabbH * 0.6, best.pos.z, '#7a4a58', 10, 0.3, 2.6);
    }
    if (tool && tool.kind === 'blade') this.inv.damageSelected(1);
    return true;
  }

  rayAabb(ox, oy, oz, dx, dy, dz, mob) {
    const w = (mob.aabbW || 0.5) / 2;
    const h = mob.aabbH || 0.6;
    const minx = mob.pos.x - w, maxx = mob.pos.x + w;
    const miny = mob.pos.y, maxy = mob.pos.y + h;
    const minz = mob.pos.z - w, maxz = mob.pos.z + w;
    let tmin = 0;
    let tmax = Infinity;
    const ax = [[ox, dx, minx, maxx], [oy, dy, miny, maxy], [oz, dz, minz, maxz]];
    for (const [o, d, lo, hi] of ax) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) return null;
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }
}
