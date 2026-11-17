import type { AttackData, Button, CharacterStats, FighterInput, FighterState, HitSample } from './types';

export interface ArenaBounds { x: number; z: number }

const GRAVITY = 0.014;
const JUMP_VY = 0.2;
const BUFFER_FRAMES = 8;
const DODGE_FRAMES = 24;
const DODGE_COOLDOWN = 18;
const KO_LIE_FRAMES = 45;
const GETUP_FRAMES = 30;
export const BODY_RADIUS = 0.32;
/** Lateral walking speed relative to forward walking. */
const LATERAL_SPEED = 0.75;
/** Fraction of the gap between current and requested air velocity closed each frame while jumping. */
const AIR_CONTROL = 0.06;
/** Guard meter: 0..GUARD_MAX; reaching GUARD_MAX breaks the guard. */
export const GUARD_MAX = 100;
const GUARD_REGEN = 0.3;          // per frame once the regen delay has passed
const GUARD_REGEN_DELAY = 50;     // frames after the last blocked hit before the meter starts to recover
const GUARD_BREAK_STUN = 62;      // frames the guard-broken fighter is helpless (a real punish window)
const GUARD_AFTER_BREAK = 35;     // meter value after a break
/** Parry: pulling back at the moment of impact (within PARRY_FRAMES of starting the guard) reflects the attack. */
export const PARRY_FRAMES = 7;
const PARRY_COOLDOWN = 32;        // after starting a guard, a new parry window cannot open for this long (no tap-spam)
const COUNTER_WINDOW = 40;        // frames after a successful parry in which light/heavy performs the counter attack
const PARRIED_STUN = 30;          // the attacker is staggered this long (the counter's opening)
/** Juggle limit: after this many hits taken while airborne the victim cannot be hit again until they land. */
export const MAX_JUGGLE = 3;
/** Throws: the victim can tech (press grab) for this many frames; otherwise the throw lands. */
export const TECH_FRAMES = 15;
const CROUCH_TOP = 1.0;           // hurtbox height while crouching (m)

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
  /** Lateral walking input this frame (+1 toward camera, -1 away, 0 none); lets animation tell strafing from idling. */
  moveSide = 0;
  /** Last hit came from behind (drives HIT_BACK). */
  hitFromBack = false;
  /** Guard meter (0..GUARD_MAX). Blocking fills it; at GUARD_MAX the guard breaks. */
  guard = 0;
  private guardDelay = 0;
  /** True while stunned by a guard break (drives the stagger animation + HUD). */
  guardBroken = false;
  /** True while staggered by a parry (defenceless, drives the stagger animation). */
  stagger = false;
  /** Frames left in which a block counts as a PARRY. */
  parryWindow = 0;
  private parryCooldown = 0;
  /** Frames left in which light/heavy performs the counter attack (after a successful parry). */
  counterWindow = 0;
  /** Hits taken while airborne in the current juggle. */
  juggle = 0;
  /** Landing lag after a whiffed air attack (the fighter cannot act). */
  landLag = 0;
  /** The fighter holding this one in a throw, and whether this one pressed grab in time. */
  grabbedBy: Fighter | null = null;
  grabData: AttackData | null = null;
  teched = false;
  /** The block that put this fighter in blockstun was a crouching guard (decides whether LOW attacks are blocked). */
  blockCrouched = false;
  /** Crouch input held this frame. */
  private crouchHeld = false;
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
    this.guard = 0; this.guardDelay = 0; this.guardBroken = false; this.stagger = false; this.parryWindow = 0; this.parryCooldown = 0; this.counterWindow = 0;
    this.juggle = 0; this.landLag = 0; this.grabbedBy = null; this.grabData = null; this.teched = false; this.blockCrouched = false; this.crouchHeld = false;
    this.setState('idle');
  }

  get neutral(): boolean { return this.state === 'idle' || this.state === 'walk' || this.state === 'block' || this.state === 'crouch'; }
  get crouching(): boolean { return this.state === 'crouch'; }
  /** A fresh guard would open a parry window right now (the controller - human or AI - may read its own fighter's state). */
  get canParry(): boolean { return this.parryCooldown === 0 && this.parryWindow === 0; }
  /** Frames until the current attack has fully finished (0 when not attacking). */
  get attackRemaining(): number { const a = this.attack; return this.state === 'attack' && a ? Math.max(0, a.startup + a.active + a.recovery - this.attackFrame) : 0; }
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

  /** Active hitbox sphere (the attack's primary sample), or null if the current attack is not in its active frames. */
  hitbox(): HitSample | null {
    const a = this.attack;
    if (!a || this.attackPhase !== 'active') return null;
    return { x: this.x + this.fx * a.reach, y: this.y + a.height, z: this.z + this.fz * a.reach, r: a.radius };
  }

  /**
   * The attack's collision shape this frame as a set of balls (world space), or null outside the active frames.
   * Shapes follow the weapon: a sword sweeps an arc, a spear is a growing line, fists/daggers/kicks a single ball.
   * Each sample set also covers the path travelled since the previous frame, so fast attacks cannot tunnel.
   */
  hitSamples(): HitSample[] | null {
    const a = this.attack;
    if (!a || this.attackPhase !== 'active') return null;
    const k = this.attackFrame - a.startup, n = Math.max(1, a.active);
    const t0 = k / n, t1 = Math.min(1, (k + 1) / n);
    const y = this.y + a.height, r = a.radius;
    const out: HitSample[] = [];
    const at = (dist: number, ang: number): void => {
      const c = Math.cos(ang), s = Math.sin(ang);
      out.push({ x: this.x + (this.fx * c - this.fz * s) * dist, y, z: this.z + (this.fx * s + this.fz * c) * dist, r });
    };
    switch (a.shape ?? 'sphere') {
      case 'thrust': { // shaft from the hands to a tip that keeps extending while the attack is active
        const r0 = a.reachStart ?? 0.35;
        const tip = r0 + (a.reach - r0) * (0.6 + 0.4 * t1);
        for (let i = 0; i < 4; i++) at(r0 + ((tip - r0) * i) / 3, 0);
        break;
      }
      case 'swing': { // blade sweeping across an arc: outer edge and inner blade, previous / middle / current angle
        const arc = ((a.arc ?? 80) * Math.PI) / 180;
        for (const t of [t0, (t0 + t1) / 2, t1]) { const ang = (t - 0.5) * arc; at(a.reach, ang); at(a.reach * 0.62, ang); }
        break;
      }
      default: at(a.reach, 0);
    }
    return out;
  }

  /** Vertical-capsule hurtbox. */
  hurtbox(): { x: number; z: number; y0: number; y1: number; r: number } {
    return { x: this.x, z: this.z, y0: this.y + 0.35, y1: this.y + (this.state === 'crouch' ? CROUCH_TOP : 1.55), r: BODY_RADIUS };
  }

  step(inp: FighterInput, opp: Fighter): void {
    this.stateFrame++;
    this.perfectDodge = false; this.moveSide = 0;
    if (this.buffered && --this.buffered.frames <= 0) this.buffered = null;
    if (inp.pressed.length) this.buffered = { button: inp.pressed[inp.pressed.length - 1], frames: BUFFER_FRAMES };
    if (this.dodgeCooldown > 0) this.dodgeCooldown--;
    if (this.landTimer > 0) this.landTimer--;
    this.invulnerable = false;
    this.crouchHeld = !!inp.crouch;
    if (this.parryWindow > 0) this.parryWindow--;
    if (this.parryCooldown > 0) this.parryCooldown--;
    if (this.counterWindow > 0) this.counterWindow--;
    if (this.landLag > 0) this.landLag--;
    if (this.guardDelay > 0) this.guardDelay--; else if (this.guard > 0) this.guard = Math.max(0, this.guard - GUARD_REGEN);

    switch (this.state) {
      case 'idle': case 'walk': case 'block': case 'crouch': this.stepNeutral(inp, opp); break;
      case 'grabbed': this.invulnerable = true; if (inp.pressed.includes('grab')) this.teched = true; break;
      case 'attack': this.stepAttack(opp); break;
      case 'jump': this.stepJump(inp); break;
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
    if (this.landLag > 0) return; // landing recovery after a whiffed air attack
    if (this.buffered) {
      const id = this.attackFor(this.buffered.button);
      const a = this.stats.attacks[id];
      this.buffered = null;
      if (a && this.energy >= (a.cost ?? 0)) {
        this.energy -= a.cost ?? 0;
        if (id === 'counter') this.counterWindow = 0;
        this.startAttack(id);
        return;
      }
    }
    if (inp.dodge !== 0 && this.dodgeCooldown === 0) {
      this.dodgeDir = inp.dodge; this.setState('dodge'); this.dodgeCooldown = DODGE_FRAMES + DODGE_COOLDOWN; return;
    }
    const side = Math.max(-1, Math.min(1, inp.side ?? 0));
    if (inp.jump) {
      this.setState('jump'); this.vy = JUMP_VY * (this.stats.jump ?? 1);
      const t = this.airTarget(inp.fwd, side);
      this.jvx = t.x; this.jvz = t.z; return;
    }
    // Auto-block: holding BACK (away from the opponent) guards while retreating. (inp.block is only set by the AI.)
    const retreat = inp.fwd < -0.1;
    const lateral = Math.abs(side) > 0.1;
    this.moveSide = lateral ? side : 0;
    if (this.crouchHeld) { // crouching: ducks high attacks, guards low and mid ones, does not move
      if (this.state !== 'crouch') this.setState('crouch');
      return;
    }
    if (inp.block || retreat) {
      if (this.state !== 'block') {
        this.setState('block');
        if (this.parryCooldown === 0) { this.parryWindow = PARRY_FRAMES; this.parryCooldown = PARRY_COOLDOWN; } // a fresh guard can parry
      }
      this.walkFrames = 0; this.running = false;
      if (retreat || lateral) this.moveLocal(retreat ? inp.fwd : 0, side, opp, false);
      return;
    }
    if (inp.fwd > 0.1 || lateral) {
      if (this.state !== 'walk') this.setState('walk');
      if (inp.fwd > 0.1 && !lateral) { this.walkFrames++; this.running = this.walkFrames > 42; } else { this.walkFrames = 0; this.running = false; }
      this.moveLocal(inp.fwd > 0.1 ? inp.fwd : 0, side, opp, this.running);
    } else if (this.state !== 'idle') this.setState('idle');
  }

  /** Which move a button press performs in the current context (crouching, counter window). */
  private attackFor(btn: Button): string {
    const crouch = this.crouchHeld || this.state === 'crouch';
    const counter = this.counterWindow > 0 && !!this.stats.attacks.counter;
    switch (btn) {
      case 'light': return counter ? 'counter' : crouch ? 'launcher' : 'light1';
      case 'heavy': return counter ? 'counter' : crouch ? 'sweep' : 'heavy';
      case 'kick': return crouch ? 'lowkick' : 'kick';
      default: return btn; // special, ultimate, grab
    }
  }

  /** Unit vector along arena depth that means "toward the camera", perpendicular to the facing direction. */
  private lateralDir(): { x: number; z: number } {
    const s = this.fx >= 0 ? 1 : -1;
    return { x: -this.fz * s, z: this.fx * s };
  }

  /**
   * Local movement vector: fwd along the facing direction, side along the perpendicular (arena depth).
   * Speed is capped so diagonals are never faster, and pure lateral input orbits the opponent at constant distance.
   */
  private moveLocal(fwd: number, side: number, opp: Fighter, run: boolean): void {
    const st = this.stats;
    const sf = fwd > 0 ? st.walkSpeed * (run ? 1.35 : 1) : st.backSpeed;
    const sl = (fwd < 0 ? st.backSpeed : st.walkSpeed) * LATERAL_SPEED;
    const l = this.lateralDir();
    let vx = this.fx * fwd * sf + l.x * side * sl, vz = this.fz * fwd * sf + l.z * side * sl;
    const cap = Math.max(Math.abs(fwd) * sf, Math.abs(side) * sl), len = Math.hypot(vx, vz);
    if (len > cap && len > 0) { vx *= cap / len; vz *= cap / len; }
    const d0 = Math.hypot(this.x - opp.x, this.z - opp.z);
    this.x += vx; this.z += vz;
    if (Math.abs(fwd) < 0.1 && d0 > 0.01) { // circling: keep the same distance instead of drifting away along the tangent
      const dx = this.x - opp.x, dz = this.z - opp.z, d1 = Math.hypot(dx, dz) || 1;
      this.x = opp.x + (dx / d1) * d0; this.z = opp.z + (dz / d1) * d0;
    }
  }

  /** Horizontal air velocity (m/frame) a held direction asks for. */
  private airTarget(fwd: number, side: number): { x: number; z: number } {
    const s = this.stats.walkSpeed * 0.9, l = this.lateralDir();
    return { x: this.fx * fwd * s + l.x * side * s * 0.7, z: this.fz * fwd * s + l.z * side * s * 0.7 };
  }

  private stepAttack(opp: Fighter): void {
    const a = this.attack!;
    this.attackFrame++;
    const total = a.startup + a.active + a.recovery;
    if (a.air) {
      // Air attack: keep drifting, gravity applies, landing ends the attack.
      this.x += this.jvx * 0.5; this.z += this.jvz * 0.5;
      this.vy -= GRAVITY; this.y += this.vy;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.landTimer = 7; this.landLag = Math.round((a.landLag ?? 8) * (this.connected ? 0.5 : 1)); this.setState('idle'); return; }
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

  private stepJump(inp: FighterInput): void {
    const b = this.buffered?.button;
    if (b === 'light' || b === 'heavy' || b === 'kick') { this.startAttack(b === 'light' ? 'airlight' : b === 'heavy' ? 'airheavy' : 'airkick'); return; }
    // limited air control: the held direction steers the jump (6% of the gap per frame), it never overrides it outright
    const t = this.airTarget(inp.fwd, Math.max(-1, Math.min(1, inp.side ?? 0)));
    this.jvx += (t.x - this.jvx) * AIR_CONTROL; this.jvz += (t.z - this.jvz) * AIR_CONTROL;
    this.x += this.jvx; this.z += this.jvz;
    this.vy -= GRAVITY; this.y += this.vy;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.landTimer = 7; this.setState('idle'); }
  }

  private stepDodge(): void {
    const f = this.stateFrame;
    this.invulnerable = f >= 3 && f <= 16;
    if (f <= 14) this.z += this.dodgeDir * 0.13 * (this.stats.dodgeSpeed ?? 1) * (1 - f / 18);
    if (f >= DODGE_FRAMES) this.setState('idle');
  }

  private stepStun(): void {
    this.applyKnockback();
    if (this.y > 0) { this.vy -= GRAVITY; this.y += this.vy; if (this.y <= 0) { this.y = 0; this.vy = 0; } } // never hang in the air while stunned
    if (this.stateFrame >= this.stunFrames && this.grounded) { this.hitsTaken = 0; this.guardBroken = false; this.stagger = false; this.setState('idle'); }
  }

  private stepDown(): void {
    this.applyKnockback();
    if (!this.grounded || this.vy > 0) {
      if (this.juggle >= MAX_JUGGLE) this.invulnerable = true; // juggle limit reached: safe until landing, so air combos always end
      this.vy -= GRAVITY; this.y += this.vy;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.stateFrame = 0; this.juggle = 0; }
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

  /**
   * Apply a validated hit. dir is the unit push direction.
   * A fighter hit while airborne is JUGGLED: it keeps falling in the knockdown state, each further hit pops it up a little
   * less, and after MAX_JUGGLE air hits it cannot be hit again until it lands (so no infinite air combos).
   */
  takeHit(att: AttackData, damage: number, dirx: number, dirz: number): void {
    const airborne = this.y > 0.05;
    this.health = Math.max(0, this.health - damage);
    this.hitsTaken++;
    this.guardBroken = false; this.stagger = false; this.parryWindow = 0;
    this.hitFromBack = dirx * this.fx + dirz * this.fz > 0.35;
    this.kx = dirx * att.knockback; this.kz = dirz * att.knockback;
    this.attack = null;
    if (airborne) this.juggle++; else this.juggle = 0;
    if (this.health <= 0 || att.knockdown || att.launch || airborne) {
      this.setState(this.health <= 0 ? 'defeat' : 'knockdown');
      const pop = airborne ? 0.125 * Math.pow(0.8, this.juggle) : (att.launch ?? 0.16);
      this.vy = airborne ? Math.max(this.vy, 0) + pop : pop;
      this.y = Math.max(this.y, 0.001);
      const kb = att.launch && !att.knockdown ? att.knockback : Math.max(att.knockback, 0.2);
      this.kx = dirx * kb; this.kz = dirz * kb;
    } else {
      this.setState('hitstun');
      this.stunFrames = Math.max(10, Math.round(att.hitstun * Math.pow(0.92, this.hitsTaken - 1)));
    }
  }

  /**
   * A blocked hit: chip damage, blockstun and guard-meter damage. Returns true if the guard BROKE
   * (the fighter is then helpless for GUARD_BREAK_STUN frames and the meter resets to GUARD_AFTER_BREAK).
   */
  takeBlock(att: AttackData, chip: number, dirx: number, dirz: number): boolean {
    this.health = Math.max(1, this.health - chip);
    this.guard += att.guardDamage ?? att.damage * 0.15;
    this.guardDelay = GUARD_REGEN_DELAY;
    this.parryWindow = 0;
    this.kx = dirx * att.knockback * 0.6; this.kz = dirz * att.knockback * 0.6;
    if (this.guard >= GUARD_MAX) {
      this.guard = GUARD_AFTER_BREAK; this.guardBroken = true; this.hitsTaken = 0;
      this.setState('hitstun'); this.stunFrames = GUARD_BREAK_STUN;
      return true;
    }
    this.setState('blockstun');
    this.stunFrames = att.blockstun;
    return false;
  }

  /** The defender parried: no damage, free to act at once, and light/heavy now performs the counter attack for a short time. */
  parrySuccess(): void {
    this.parryWindow = 0; this.counterWindow = COUNTER_WINDOW; this.guardDelay = 0;
    this.guard = Math.max(0, this.guard - 15);
  }

  /** The attacker was parried: staggered, wide open to the counter. dir points away from the defender. */
  takeParried(dirx: number, dirz: number): void {
    this.attack = null; this.kx = dirx * 0.07; this.kz = dirz * 0.07;
    this.hitsTaken = 0; this.setState('hitstun'); this.stunFrames = PARRIED_STUN; this.stagger = true; // defenceless: the counter lands as a real hit
  }

  /** Held in a throw. The combat manager resolves the tech / throw after TECH_FRAMES. */
  getGrabbed(by: Fighter, data: AttackData): void {
    this.setState('grabbed'); this.grabbedBy = by; this.grabData = data; this.teched = false;
  }
  releaseGrab(): void { this.grabbedBy = null; this.grabData = null; this.teched = false; }
  /** Add knockback velocity (used when a throw is teched). */
  shove(dx: number, dz: number, amount: number): void { this.kx = dx * amount; this.kz = dz * amount; }
  win(): void { if (this.state !== 'defeat') { this.attack = null; this.setState('victory'); } }
}

