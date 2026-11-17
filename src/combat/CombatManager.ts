import { Emitter } from '../core/Events';
import { BODY_RADIUS, Fighter } from './Fighter';
import type { AttackData, FighterInput, HitSample } from './types';

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

/** What one attacker's active hitbox does to the opponent this frame (computed from a snapshot, applied afterwards). */
interface Resolution {
  kind: 'hit' | 'block' | 'dodged';
  ai: number; data: AttackData; dx: number; dz: number; cx: number; cy: number; cz: number;
  damage: number; hitstop: number; count: number;
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
      this.resolveAll();
    }
    this.separate();
    this.updateCombos();
  }

  /**
   * Simultaneous hit resolution. Both attacks are evaluated against the SAME pre-resolution snapshot (positions, states,
   * block/invulnerability, combo counters, health) and only then applied, so neither fighter has priority: if both
   * attacks connect on one frame it is a genuine trade, and a double KO is a draw.
   */
  private resolveAll(): void {
    const results: Resolution[] = [];
    for (const ai of [0, 1]) { const r = this.evaluate(ai); if (r) results.push(r); }
    for (const r of results) this.apply(r);
    for (const r of results) {
      if (r.kind !== 'hit') continue;
      const def = this.fighters[1 - r.ai];
      if (def.health <= 0) this.events.emit('ko', { loser: 1 - r.ai });
    }
    for (const r of results) if (r.kind === 'hit' || r.kind === 'block') this.hitstop = Math.max(this.hitstop, r.hitstop);
  }

  /** Read-only: decides what attacker `ai` does to the opponent this frame. Does not mutate either fighter. */
  private evaluate(ai: number): Resolution | null {
    const att = this.fighters[ai], def = this.fighters[1 - ai];
    const samples = att.hitSamples();
    const data = att.attack;
    if (!samples || !data || att.hitDone) return null;
    if (def.state === 'victory' || def.state === 'defeat') return null;

    const h = def.hurtbox();
    let contact: HitSample | null = null;
    for (const s of samples) { // any ball of the attack's shape touching the defender's capsule is a hit
      const py = Math.max(h.y0, Math.min(h.y1, s.y));
      if (Math.hypot(s.x - h.x, py - s.y, s.z - h.z) <= s.r + h.r) { contact = s; break; }
    }
    if (!contact) return null;

    let dx = def.x - att.x, dz = def.z - att.z;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const cx = (contact.x + h.x) / 2, cy = contact.y, cz = (contact.z + h.z) / 2;
    if (def.invulnerable) return { kind: 'dodged', ai, data, dx, dz, cx, cy, cz, damage: 0, hitstop: 0, count: 0 };

    const blocking = (def.state === 'block' || def.state === 'blockstun') && def.fx * -dx + def.fz * -dz > 0.2;
    if (blocking) return { kind: 'block', ai, data, dx, dz, cx, cy, cz, damage: Math.round(data.damage * CHIP_RATIO), hitstop: 2, count: 0 };

    const count = def.inCombo ? this.combo[ai] + 1 : 1;
    const scale = Math.max(MAX_COMBO_SCALING_FLOOR, 1 - 0.1 * (count - 1));
    return { kind: 'hit', ai, data, dx, dz, cx, cy, cz, damage: Math.round(data.damage * scale), hitstop: data.hitstop, count };
  }

  private apply(r: Resolution): void {
    const { ai, data } = r;
    const att = this.fighters[ai], def = this.fighters[1 - ai];
    att.hitDone = true;
    if (r.kind === 'dodged') {
      if (def.state === 'dodge') { def.addEnergy(12); this.events.emit('perfectDodge', { who: 1 - ai }); }
      return;
    }
    if (r.kind === 'block') {
      def.takeBlock(data, r.damage, r.dx, r.dz);
      att.connected = true;
      att.addEnergy(data.energyGain * 0.4); def.addEnergy(3);
      this.damageDealt[ai] += r.damage;
      this.events.emit('hit', { attackId: data.id, attacker: ai, defender: 1 - ai, damage: r.damage, x: r.cx, y: r.cy, z: r.cz, blocked: true, knockdown: false, hitstop: 2 });
      return;
    }
    const dealt = Math.min(r.damage, def.health), wasHealth = def.health;
    def.takeHit(data, r.damage, r.dx, r.dz);
    att.connected = true;
    att.addEnergy(data.energyGain); def.addEnergy(dealt * 0.02);
    this.damageDealt[ai] += wasHealth - def.health;
    this.combo[ai] = r.count;
    this.maxCombo[ai] = Math.max(this.maxCombo[ai], r.count);
    this.events.emit('hit', { attackId: data.id, attacker: ai, defender: 1 - ai, damage: dealt, x: r.cx, y: r.cy, z: r.cz, blocked: false, knockdown: data.knockdown || def.health <= 0, hitstop: data.hitstop });
    if (r.count > 1) this.events.emit('combo', { owner: ai, count: r.count });
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

