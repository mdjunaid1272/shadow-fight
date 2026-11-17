import { Emitter } from '../core/Events';
import { BODY_RADIUS, Fighter } from './Fighter';
import type { FighterInput } from './types';

export interface CombatEvents {
  hit: { attackId: string; attacker: number; defender: number; damage: number; x: number; y: number; z: number; blocked: boolean; knockdown: boolean; hitstop: number };
  combo: { owner: number; count: number };
  comboEnd: { owner: number; count: number };
  ko: { loser: number };
  perfectDodge: { who: number };
  attackStart: { who: number; id: string; startup: number };
  state: { who: number; from: string; to: string };
  /** A special / ultimate attack has just started (energy already spent). */
  special: { who: number; id: string; cinematic: boolean; x: number; y: number; z: number };
}

const MAX_COMBO_SCALING_FLOOR = 0.4;
const CHIP_RATIO = 0.08;

/**
 * Runs the fixed-timestep fight between fighters[0] (player) and fighters[1].
 * Owns hit validation, damage scaling, combo tracking and hitstop.
 */
export class CombatManager {
  readonly events = new Emitter<CombatEvents>();
  readonly combo = [0, 0];
  readonly maxCombo = [0, 0];
  readonly damageDealt = [0, 0];
  private hitstop = 0;
  private prevState: string[] = ['idle', 'idle'];
  active = true;

  constructor(public fighters: [Fighter, Fighter]) {}

  /** Swap the fighters (new match / character change). */
  setFighters(f: [Fighter, Fighter]): void { this.fighters = f; this.prevState = ['idle', 'idle']; this.resetStats(); }

  resetStats(): void {
    this.combo[0] = this.combo[1] = 0;
    this.maxCombo[0] = this.maxCombo[1] = 0;
    this.damageDealt[0] = this.damageDealt[1] = 0;
    this.hitstop = 0;
  }

  get frozen(): boolean { return this.hitstop > 0; }

  step(inputs: [FighterInput, FighterInput]): void {
    if (this.hitstop > 0) { this.hitstop--; return; }
    const [a, b] = this.fighters;
    a.step(inputs[0], b);
    b.step(inputs[1], a);
    this.fighters.forEach((f, who) => {
      if (f.state !== this.prevState[who]) { this.events.emit('state', { who, from: this.prevState[who], to: f.state }); this.prevState[who] = f.state; }
      if (f.state === 'attack' && f.attackFrame === 0 && f.stateFrame === 0 && f.attack) this.events.emit('attackStart', { who, id: f.attack.id, startup: f.attack.startup });
      if (f.state === 'attack' && f.attackFrame === 0 && f.stateFrame === 0 && f.attack?.cost) {
        this.events.emit('special', { who, id: f.attack.id, cinematic: !!f.attack.cinematic, x: f.x, y: f.y + 1, z: f.z });
      }
    });
    if (this.active) {
      this.resolve(0);
      this.resolve(1);
    }
    this.separate();
    this.updateCombos();
  }

  private resolve(ai: number): void {
    const att = this.fighters[ai], def = this.fighters[1 - ai];
    const hb = att.hitbox();
    const data = att.attack;
    if (!hb || !data || att.hitDone) return;
    if (def.state === 'victory' || def.state === 'defeat') return;

    const h = def.hurtbox();
    const py = Math.max(h.y0, Math.min(h.y1, hb.y));
    const d = Math.hypot(hb.x - h.x, py - hb.y, hb.z - h.z);
    if (d > hb.r + h.r) return;

    att.hitDone = true;
    if (def.invulnerable) {
      if (def.state === 'dodge') { def.addEnergy(12); this.events.emit('perfectDodge', { who: 1 - ai }); }
      return;
    }

    let dx = def.x - att.x, dz = def.z - att.z;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const blocking = (def.state === 'block' || def.state === 'blockstun') && def.fx * -dx + def.fz * -dz > 0.2;
    const cx = (hb.x + h.x) / 2, cy = hb.y, cz = (hb.z + h.z) / 2;

    if (blocking) {
      const chip = Math.round(data.damage * CHIP_RATIO);
      def.takeBlock(data, chip, dx, dz);
      att.connected = true;
      att.addEnergy(data.energyGain * 0.4); def.addEnergy(3);
      this.damageDealt[ai] += chip;
      this.hitstop = 2;
      this.events.emit('hit', { attackId: data.id, attacker: ai, defender: 1 - ai, damage: chip, x: cx, y: cy, z: cz, blocked: true, knockdown: false, hitstop: 2 });
      return;
    }

    const count = def.inCombo ? this.combo[ai] + 1 : 1;
    const scale = Math.max(MAX_COMBO_SCALING_FLOOR, 1 - 0.1 * (count - 1));
    const damage = Math.round(data.damage * scale);
    const dealt = Math.min(damage, def.health);
    const wasHealth = def.health;
    def.takeHit(data, damage, dx, dz);
    att.connected = true;
    att.addEnergy(data.energyGain); def.addEnergy(dealt * 0.02);
    this.damageDealt[ai] += wasHealth - def.health;
    this.combo[ai] = count;
    this.maxCombo[ai] = Math.max(this.maxCombo[ai], count);
    this.hitstop = data.hitstop;
    this.events.emit('hit', { attackId: data.id, attacker: ai, defender: 1 - ai, damage: dealt, x: cx, y: cy, z: cz, blocked: false, knockdown: data.knockdown || def.health <= 0, hitstop: data.hitstop });
    if (count > 1) this.events.emit('combo', { owner: ai, count });
    if (def.health <= 0) this.events.emit('ko', { loser: 1 - ai });
  }

  private separate(): void {
    const [a, b] = this.fighters;
    if (a.y > 0.6 || b.y > 0.6) return;
    if (a.state === 'knockdown' || b.state === 'knockdown' || a.state === 'defeat' || b.state === 'defeat') return;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    const min = BODY_RADIUS * 2 + 0.1;
    if (d >= min) return;
    const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
    const push = (min - d) / 2;
    a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    for (const f of this.fighters) {
      f.x = Math.max(-f.bounds.x, Math.min(f.bounds.x, f.x));
      f.z = Math.max(-f.bounds.z, Math.min(f.bounds.z, f.z));
    }
  }

  private updateCombos(): void {
    for (let i = 0; i < 2; i++) {
      if (this.combo[i] > 0) {
        const victim = this.fighters[1 - i];
        if (!victim.inCombo && victim.state !== 'blockstun') {
          if (this.combo[i] > 1) this.events.emit('comboEnd', { owner: i, count: this.combo[i] });
          this.combo[i] = 0;
        }
      }
    }
  }
}

