import type { AttackData, Button, CharacterStats, FighterInput, FighterState } from './types';

export interface ArenaBounds { x: number; z: number }

const GRAVITY = 0.014;
const JUMP_VY = 0.2;
const BUFFER_FRAMES = 8;
const DODGE_FRAMES = 24;
const DODGE_COOLDOWN = 18;
const KO_LIE_FRAMES = 45;
const GETUP_FRAMES = 30;
export const BODY_RADIUS = 0.32;

/**
 * Pure combat-state simulation for one fighter. Advances exactly one fixed
 * 60 Hz frame per step() call and contains no rendering code.
 */
export class Fighter {
  x = 0; y = 0; z = 0; vy = 0;
  /** Unit facing vector on the XZ plane (toward opponent when in neutral). */
  fx = 1; fz = 0;
  state: FighterState = 'idle';
  stateFrame = 0;
  health: number;
  energy = 0;

  attack: AttackData | null = null;
  attackFrame = 0;
  hitDone = false;
  connected = false;

  /** Length of current hitstun / blockstun in frames. */
  stunFrames = 0;
  /** Number of hits taken in the current combo (for hitstun proration). */
  hitsTaken = 0;
  invulnerable = false;
  private kx = 0; private kz = 0;
  private jvx = 0; private jvz = 0;
  /** +1 / -1 sidestep direction of the current dodge (animation picks DODGE_LEFT / DODGE_RIGHT). */
  dodgeDir = 0;
  /** Sprinting after holding forward for ~0.7s (speed x1.35). */
  running = false;
  private walkFrames = 0;
  /** Visual-only landing recovery counter (drives the LAND clip). */
  landTimer = 0;
  /** Last hit came from behind (drives HIT_BACK). */
  hitFromBack = false;
  private dodgeCooldown = 0;
  private buffered: { button: Button; frames: number } | null = null;
  /** Set when a dodge made an attack whiff; consumed by the combat manager. */
  perfectDodge = false;

  constructor(public readonly stats: CharacterStats, public readonly bounds: ArenaBounds) {
    this.health = stats.maxHealth;
  }

  reset(x: number, z: number, fx: number): void {
    this.x = x; this.z = z; this.y = 0; this.vy = 0; this.fx = fx; this.fz = 0;
    this.health = this.stats.maxHealth;
    this.attack = null; this.attackFrame = 0; this.hitDone = false; this.connected = false;
    this.kx = this.kz = 0; this.hitsTaken = 0; this.buffered = null; this.dodgeCooldown = 0;
    this.invulnerable = false; this.perfectDodge = false;
    this.setState('idle');
  }

  get neutral(): boolean { return this.state === 'idle' || this.state === 'walk' || this.state === 'block'; }
  get grounded(): boolean { return this.y <= 0.0001; }
  /** True while the fighter can be hit and is in a state that counts as a combo victim. */
  get inCombo(): boolean { return this.state === 'hitstun' || (this.state === 'knockdown' && !this.grounded); }

  get attackPhase(): 'startup' | 'active' | 'recovery' | null {
    const a = this.attack;
    if (this.state !== 'attack' || !a) return null;
    if (this.attackFrame < a.startup) return 'startup';
    if (this.attackFrame < a.startup + a.active) return 'active';
    return 'recovery';
  }

  addEnergy(n: number): void { this.energy = Math.min(100, this.energy + n); }

  setState(s: FighterState): void {
    this.state = s;
    this.stateFrame = 0;
    if (s !== 'attack') { this.attack = null; }
    if (s !== 'walk') { this.walkFrames = 0; this.running = false; }
  }

  private faceToward(ox: number, oz: number): void {
    const dx = ox - this.x, dz = oz - this.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) { this.fx = dx / len; this.fz = dz / len; }
  }

  private startAttack(id: string): void {
    const a = this.stats.attacks[id];
    if (!a) return;
    this.setState('attack');
    this.attack = a;
    this.attackFrame = 0;
    this.hitDone = false;
    this.connected = false;
    this.buffered = null;
  }

  /** Active hitbox sphere, or null if the current attack is not in its active frames. */
  hitbox(): { x: number; y: number; z: number; r: number } | null {
    const a = this.attack;
    if (!a || this.attackPhase !== 'active') return null;
    return { x: this.x + this.fx * a.reach, y: this.y + a.height, z: this.z + this.fz * a.reach, r: a.radius };
  }

  /** Vertical-capsule hurtbox. */
  hurtbox(): { x: number; z: number; y0: number; y1: number; r: number } {
    return { x: this.x, z: this.z, y0: this.y + 0.35, y1: this.y + 1.55, r: BODY_RADIUS };
  }

  step(inp: FighterInput, opp: Fighter): void {
    this.stateFrame++;
    this.perfectDodge = false;
    if (this.buffered && --this.buffered.frames <= 0) this.buffered = null;
    if (inp.pressed.length) this.buffered = { button: inp.pressed[inp.pressed.length - 1], frames: BUFFER_FRAMES };
    if (this.dodgeCooldown > 0) this.dodgeCooldown--;
    if (this.landTimer > 0) this.landTimer--;
    this.invulnerable = false;

    switch (this.state) {
      case 'idle': case 'walk': case 'block': this.stepNeutral(inp, opp); break;
      case 'attack': this.stepAttack(opp); break;
      case 'jump': this.stepJump(); break;
      case 'dodge': this.stepDodge(); break;
      case 'hitstun': case 'blockstun': this.stepStun(); break;
      case 'knockdown': case 'defeat': this.stepDown(); break;
      case 'getup': this.invulnerable = true; if (this.stateFrame >= GETUP_FRAMES) this.setState('idle'); break;
      case 'victory': break;
    }
    this.clamp();
  }

  private stepNeutral(inp: FighterInput, opp: Fighter): void {
    this.faceToward(opp.x, opp.z);
    if (this.buffered) {
      const id = this.buffered.button === 'light' ? 'light1' : this.buffered.button;
      const a = this.stats.attacks[id];
      this.buffered = null;
      if (a && this.energy >= (a.cost ?? 0)) {
        this.energy -= a.cost ?? 0;
        this.startAttack(id);
        return;
      }
    }
    if (inp.dodge !== 0 && this.dodgeCooldown === 0) {
      this.dodgeDir = inp.dodge; this.setState('dodge'); this.dodgeCooldown = DODGE_FRAMES + DODGE_COOLDOWN; return;
    }
    if (inp.jump) {
      this.setState('jump'); this.vy = JUMP_VY;
      const s = inp.fwd * this.stats.walkSpeed * 0.9;
      this.jvx = this.fx * s; this.jvz = this.fz * s; return;
    }
    // Auto-block: holding BACK (away from the opponent) guards while retreating. (inp.block is only set by the AI.)
    const retreat = inp.fwd < -0.1;
    if (inp.block || retreat) {
      if (this.state !== 'block') this.setState('block');
      this.walkFrames = 0; this.running = false;
      if (retreat) { this.x += this.fx * inp.fwd * this.stats.backSpeed; this.z += this.fz * inp.fwd * this.stats.backSpeed; }
      return;
    }
    if (Math.abs(inp.fwd) > 0.1) {
      if (this.state !== 'walk') this.setState('walk');
      if (inp.fwd > 0) { this.walkFrames++; this.running = this.walkFrames > 42; } else { this.walkFrames = 0; this.running = false; }
      const sp = inp.fwd > 0 ? this.stats.walkSpeed * (this.running ? 1.35 : 1) : this.stats.backSpeed;
      this.x += this.fx * inp.fwd * sp; this.z += this.fz * inp.fwd * sp;
    } else if (this.state !== 'idle') this.setState('idle');
  }

  private stepAttack(opp: Fighter): void {
    const a = this.attack!;
    this.attackFrame++;
    const total = a.startup + a.active + a.recovery;
    if (a.air) {
      // Air attack: keep drifting, gravity applies, landing ends the attack.
      this.x += this.jvx * 0.5; this.z += this.jvz * 0.5;
      this.vy -= GRAVITY; this.y += this.vy;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.landTimer = 7; this.setState('idle'); return; }
      if (this.attackFrame >= total) this.setState('jump');
      return;
    }
    // Lunge forward over startup + active, never through the opponent.
    if (this.attackFrame <= a.startup + a.active) {
      const gap = Math.hypot(opp.x - this.x, opp.z - this.z);
      const step = Math.min(a.lunge / (a.startup + a.active), Math.max(0, gap - BODY_RADIUS * 2 - 0.05));
      this.x += this.fx * step; this.z += this.fz * step;
    }
    // Chain cancel: only after the attack connected, inside the cancel window.
    const recFrame = this.attackFrame - (a.startup + a.active);
    if (this.connected && recFrame >= 0 && recFrame < a.cancelWindow && this.buffered) {
      const next = a.chain[this.buffered.button];
      if (next) { this.startAttack(next); return; }
    }
    if (this.attackFrame >= total) this.setState('idle');
  }

  private stepJump(): void {
    const b = this.buffered?.button;
    if (b === 'light' || b === 'heavy' || b === 'kick') { this.startAttack('airlight'); return; }
    this.x += this.jvx; this.z += this.jvz;
    this.vy -= GRAVITY; this.y += this.vy;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.landTimer = 7; this.setState('idle'); }
  }

  private stepDodge(): void {
    const f = this.stateFrame;
    this.invulnerable = f >= 3 && f <= 16;
    if (f <= 14) this.z += this.dodgeDir * 0.13 * (1 - f / 18);
    if (f >= DODGE_FRAMES) this.setState('idle');
  }

  private stepStun(): void {
    this.applyKnockback();
    if (this.stateFrame >= this.stunFrames) { this.hitsTaken = 0; this.setState('idle'); }
  }

  private stepDown(): void {
    this.applyKnockback();
    if (!this.grounded || this.vy > 0) {
      this.vy -= GRAVITY; this.y += this.vy;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.stateFrame = 0; }
    } else {
      this.kx *= 0.7; this.kz *= 0.7;
      if (this.state === 'knockdown') {
        this.invulnerable = true;
        if (this.stateFrame >= KO_LIE_FRAMES) { this.hitsTaken = 0; this.setState('getup'); }
      }
    }
  }

  private applyKnockback(): void {
    this.x += this.kx; this.z += this.kz;
    this.kx *= 0.86; this.kz *= 0.86;
  }

  private clamp(): void {
    this.x = Math.max(-this.bounds.x, Math.min(this.bounds.x, this.x));
    this.z = Math.max(-this.bounds.z, Math.min(this.bounds.z, this.z));
  }

  /** Apply a validated hit. dir is the unit push direction. */
  takeHit(att: AttackData, damage: number, dirx: number, dirz: number): void {
    this.health = Math.max(0, this.health - damage);
    this.hitsTaken++;
    this.hitFromBack = dirx * this.fx + dirz * this.fz > 0.35;
    this.kx = dirx * att.knockback; this.kz = dirz * att.knockback;
    this.attack = null;
    if (this.health <= 0 || att.knockdown) {
      this.setState(this.health <= 0 ? 'defeat' : 'knockdown');
      this.vy = 0.16; this.y = Math.max(this.y, 0.001);
      this.kx = dirx * Math.max(att.knockback, 0.2); this.kz = dirz * Math.max(att.knockback, 0.2);
    } else {
      this.setState('hitstun');
      this.stunFrames = Math.max(10, Math.round(att.hitstun * Math.pow(0.92, this.hitsTaken - 1)));
    }
  }

  takeBlock(att: AttackData, chip: number, dirx: number, dirz: number): void {
    this.health = Math.max(1, this.health - chip);
    this.kx = dirx * att.knockback * 0.6; this.kz = dirz * att.knockback * 0.6;
    this.setState('blockstun');
    this.stunFrames = att.blockstun;
  }

  win(): void { if (this.state !== 'defeat') { this.attack = null; this.setState('victory'); } }
}

