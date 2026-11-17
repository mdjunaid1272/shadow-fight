import type { Fighter } from '../combat/Fighter';
import { emptyInput, type AttackData, type Button, type FighterInput } from '../combat/types';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';
export type Behavior = 'AGGRESSIVE' | 'DEFENSIVE' | 'BALANCED' | 'TECHNICAL' | 'BOSS';

interface DifficultyCfg {
  /** Frames the AI needs to react to a visible attack. */
  reaction: number; blockSkill: number; punish: number; comboSkill: number; dodgeSkill: number; decisionEvery: number;
  /** Chance to try a parry instead of a plain block, and the timing error in frames (human-like, never perfect). */
  parrySkill: number; parryError: number;
  /** Chance to duck high attacks / crouch-guard low ones / tech throws / use the counter after a parry. */
  duckSkill: number; techSkill: number; counterSkill: number;
}
/** Difficulty only changes reaction/decision quality - never damage, health or energy. */
const DIFFICULTY: Record<Difficulty, DifficultyCfg> = {
  // Light startup is 5f, kick 9f, heavy 14f: EASY only reacts to heavies, NORMAL to kicks too, HARD can block lights.
  EASY: { reaction: 11, blockSkill: 0.35, punish: 0.2, comboSkill: 0.2, dodgeSkill: 0.0, decisionEvery: 18, parrySkill: 0, parryError: 4, duckSkill: 0.0, techSkill: 0.1, counterSkill: 0.25 },
  NORMAL: { reaction: 7, blockSkill: 0.55, punish: 0.5, comboSkill: 0.5, dodgeSkill: 0.15, decisionEvery: 12, parrySkill: 0.1, parryError: 3, duckSkill: 0.25, techSkill: 0.35, counterSkill: 0.6 },
  HARD: { reaction: 3, blockSkill: 0.75, punish: 0.8, comboSkill: 0.85, dodgeSkill: 0.3, decisionEvery: 8, parrySkill: 0.22, parryError: 2, duckSkill: 0.5, techSkill: 0.6, counterSkill: 0.9 },
};

interface BehaviorCfg {
  aggression: number; defense: number; spacing: number;
  /** Tendencies (0..1+): throwing blockers, parrying, mixing in low attacks, circling the opponent, ducking. */
  grab: number; parry: number; lows: number; strafe: number; duck: number;
}
const BEHAVIOR: Record<Behavior, BehaviorCfg> = {
  // constant pressure: close spacing, many attacks, throws turtles, rarely circles
  AGGRESSIVE: { aggression: 0.85, defense: 0.6, spacing: 1.5, grab: 0.55, parry: 0.4, lows: 0.25, strafe: 0.1, duck: 0.3 },
  // keeps range, blocks and parries, counters; circles to stay out of reach
  DEFENSIVE: { aggression: 0.35, defense: 1.3, spacing: 2.0, grab: 0.25, parry: 1.5, lows: 0.1, strafe: 0.5, duck: 0.7 },
  BALANCED: { aggression: 0.6, defense: 1.0, spacing: 1.75, grab: 0.3, parry: 1.0, lows: 0.2, strafe: 0.3, duck: 0.5 },
  // reads recovery windows, punishes with launchers, mixes highs and lows, uses spacing and counters
  TECHNICAL: { aggression: 0.55, defense: 1.0, spacing: 1.7, grab: 0.4, parry: 1.3, lows: 0.4, strafe: 0.35, duck: 0.8 },
  BOSS: { aggression: 0.8, defense: 1.1, spacing: 1.7, grab: 0.4, parry: 1.1, lows: 0.3, strafe: 0.25, duck: 0.6 },
};

/** Per-character fighting style: preferred range and move weights, so the AI plays each weapon the way it is meant to be played. */
interface StyleCfg { range: number; light: number; kick: number; heavy: number; grab: number; low: number; retreatAfterAttack: boolean }
const STYLE: Record<string, StyleCfg> = {
  ronin: { range: 1.0, light: 1, kick: 1, heavy: 1, grab: 1, low: 1, retreatAfterAttack: false },
  shinobi: { range: 0.78, light: 1.35, kick: 1.0, heavy: 0.6, grab: 0.8, low: 1.1, retreatAfterAttack: false },  // rushes in, chains lights
  titan: { range: 0.82, light: 0.8, kick: 0.7, heavy: 1.5, grab: 1.7, low: 0.8, retreatAfterAttack: false },     // walks you down, throws and heavies
  akira: { range: 1.28, light: 1.25, kick: 0.9, heavy: 0.85, grab: 0.5, low: 1.0, retreatAfterAttack: true },    // fights at the spear tip, backs off after thrusting
};
const DEFAULT_STYLE: StyleCfg = STYLE.ronin;

type Mode = 'approach' | 'attack' | 'block' | 'retreat' | 'wait' | 'strafe' | 'parry';
/** An input the AI wants to perform: a button, optionally with crouch held (low attacks, launcher). */
interface Act { id: string; btn: Button; crouch?: boolean }

const MAX_BLOCK_FRAMES = 40;
const BLOCK_COOLDOWN = 45;
/** The AI's own torso/feet checks must never use information a human could not see. */
const HISTORY = 6;

/** mulberry32: tiny seeded PRNG, so a fight (and every AI test) can be replayed exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** How far an attack can reach a standing opponent (body centre to body centre), including its forward lunge. */
export function attackRange(a: AttackData): number {
  return a.reach + a.radius + 0.32 + (a.grab ? -0.25 : Math.min(Math.max(a.lunge, 0), 1.0) * 0.6);
}

/**
 * Finite-state machine with utility-scored decisions. Produces the same FighterInput a human controller does, so it can
 * only do what the player can: it has no hidden damage, health or energy, reacts with a human-like delay, cannot act while
 * stunned, and every random choice comes from a seeded generator (pass a seed to replay a fight exactly).
 */
export class EnemyAI {
  private mode: Mode = 'wait';
  private modeFrames = 0;
  private tick = 0;
  private cooldown = 30;
  private blockCooldown = 0;
  private reactTimer = -1;
  private reactAttackId = '';
  private chainPlanned: boolean | null = null;
  private plannedChainButton: Button | null = null;
  private queued: Act | null = null;
  private cfg: DifficultyCfg;
  private beh: BehaviorCfg;
  private baseCfg: DifficultyCfg;
  private style: StyleCfg;
  private rng: () => number;
  private blockCrouch = false;
  private parryDelay = 0; private parryHold = 0;
  private strafeDir = 1;
  private oppGuardFrames = 0;
  private history: string[] = [];
  private tell = 0; private tellAct: Act | null = null;
  private techPending = false; private techDelay = 0; private willTech = false;
  /** Boss phase 1-3 (always 1 for non-bosses). */
  phase = 1;
  onPhase: ((phase: number) => void) | null = null;
  /** True while the boss is visibly winding up a major attack (the game may add a warning glow). */
  telegraphing = false;
  /** Name of the move being telegraphed ('special' | 'ultimate' | 'grab'), for VFX / UI. */
  telegraphMove = '';
  /** Moves chosen so far (for tests and balance runs). */
  readonly stats: Record<string, number> = {};
  /** Number of attacks started (every move except defensive choices). */
  attackCount = 0;

  constructor(public difficulty: Difficulty = 'NORMAL', public behavior: Behavior = 'BALANCED', seed?: number, characterId?: string) {
    this.cfg = DIFFICULTY[difficulty]; this.beh = BEHAVIOR[behavior]; this.baseCfg = this.cfg;
    this.style = STYLE[characterId ?? ''] ?? DEFAULT_STYLE;
    this.rng = mulberry32(seed ?? Math.floor(Math.random() * 0x7fffffff));
  }

  reset(): void {
    this.mode = 'wait'; this.modeFrames = 0; this.cooldown = 40; this.blockCooldown = 0;
    if (this.behavior === 'BOSS') { this.phase = 1; this.applyPhase(); }
    this.reactTimer = -1; this.chainPlanned = null; this.queued = null; this.tell = 0; this.tellAct = null; this.telegraphing = false; this.telegraphMove = '';
    this.parryDelay = 0; this.parryHold = 0; this.oppGuardFrames = 0; this.techPending = false;
  }

  private set(mode: Mode): void { this.mode = mode; this.modeFrames = 0; }

  /**
   * Boss phases by remaining health, each with its own strategy (damage is never boosted):
   *  1 (>66%)  measured: spaced attacks, blocks and parries, occasional special
   *  2 (33-66%) pressures: mixes lows and throws, specials more often, faster decisions
   *  3 (<33%)  enraged: fastest reactions, constant pressure, ultimate whenever the meter allows - all telegraphed
   */
  private applyPhase(): void {
    const b = BEHAVIOR.BOSS;
    this.beh = this.phase === 1 ? { ...b, aggression: 0.7, lows: 0.2, grab: 0.25 }
      : this.phase === 2 ? { ...b, aggression: 0.9, spacing: 1.6, lows: 0.4, grab: 0.5, strafe: 0.35 }
      : { ...b, aggression: 1.1, spacing: 1.5, defense: 0.8, lows: 0.35, grab: 0.45, strafe: 0.15 };
    this.cfg = { ...this.baseCfg, reaction: Math.max(2, Math.round(this.baseCfg.reaction * (this.phase === 3 ? 0.6 : this.phase === 2 ? 0.85 : 1))), comboSkill: Math.min(1, this.baseCfg.comboSkill + 0.15 * (this.phase - 1)), decisionEvery: Math.max(5, this.baseCfg.decisionEvery - (this.phase - 1) * 2) };
  }

  private count(id: string): void { this.stats[id] = (this.stats[id] ?? 0) + 1; }

  /** Pick the response to an incoming attack: parry, duck, crouch-guard, stand-guard or sidestep. */
  private react(me: Fighter, opp: Fighter, inp: FighterInput): void {
    const atk = opp.attack;
    if (!atk) return;
    const remaining = atk.startup - opp.attackFrame;
    const level = atk.level ?? 'mid';
    if (atk.grab) { // throws: sidestep or hit first; otherwise tech it later
      if (this.rng() < this.cfg.dodgeSkill + 0.25 * this.cfg.techSkill) inp.dodge = this.rng() < 0.5 ? 1 : -1;
      return;
    }
    if (this.rng() >= this.cfg.blockSkill * this.beh.defense) return; // missed the read: takes the hit
    if (this.rng() < this.cfg.dodgeSkill) { inp.dodge = this.rng() < 0.5 ? 1 : -1; this.count('dodge'); return; }
    if (remaining >= 3 && me.canParry && this.rng() < this.cfg.parrySkill * this.beh.parry && !me.crouching) {
      // pull back so the hit lands inside the parry window: aim 3 frames before impact, with human timing error
      this.parryDelay = Math.max(0, remaining - 3 + Math.round((this.rng() * 2 - 1) * this.cfg.parryError));
      this.parryHold = 14; this.set('parry'); this.count('parryTry'); return;
    }
    // height reads: duck high attacks, crouch-guard low ones, stand-guard the rest
    this.blockCrouch = level === 'low' || (level === 'high' && this.rng() < this.cfg.duckSkill * this.beh.duck);
    this.set('block'); this.count(this.blockCrouch ? 'crouchGuard' : 'standGuard');
  }

  think(me: Fighter, opp: Fighter): FighterInput {
    if (this.behavior === 'BOSS') {
      const frac = me.health / me.stats.maxHealth, ph = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
      if (ph !== this.phase) { this.phase = ph; this.applyPhase(); this.onPhase?.(ph); }
    }
    const inp = emptyInput();
    this.tick++; this.modeFrames++;
    if (this.cooldown > 0) this.cooldown--;
    if (this.blockCooldown > 0) this.blockCooldown--;

    const dist = Math.hypot(opp.x - me.x, opp.z - me.z);
    const oppAttacking = opp.state === 'attack' && opp.attack;
    const oppAtkRange = oppAttacking ? opp.attack!.reach + opp.attack!.radius + 0.32 + 0.3 + opp.attack!.lunge : 0;
    const oppThreat = !!oppAttacking && dist < oppAtkRange && opp.attackPhase !== 'recovery';
    this.oppGuardFrames = opp.state === 'block' || opp.state === 'crouch' ? this.oppGuardFrames + 1 : 0;

    // --- escaping a throw: press grab inside the tech window (some of the time, like a person would)
    if (me.state === 'grabbed') {
      if (!this.techPending) { this.techPending = true; this.techDelay = Math.round(2 + this.rng() * 8); this.willTech = this.rng() < Math.min(1, this.cfg.techSkill + 0.2); }
      if (this.willTech && this.techDelay-- === 0) { inp.pressed.push('grab'); this.count('tech'); }
      return inp;
    }
    this.techPending = false;

    // --- boss telegraph: a visible wind-up before a major attack (the boss stands still and is just as vulnerable)
    if (this.tell > 0) {
      this.tell--; this.telegraphing = true;
      if (this.tell === 0 && this.tellAct) { this.telegraphing = false; this.telegraphMove = ''; this.perform(this.tellAct, inp); this.tellAct = null; }
      return inp;
    }
    this.telegraphing = false;

    // --- chain follow-ups: decided once per attack, executed inside the cancel window
    if (me.state === 'attack' && me.attack) {
      if (this.chainPlanned === null) {
        const options = Object.keys(me.attack.chain) as Button[];
        this.chainPlanned = options.length > 0 && this.rng() < this.cfg.comboSkill;
        this.plannedChainButton = options.length ? options[Math.floor(this.rng() * options.length)] : null;
      }
      if (this.chainPlanned && me.connected && this.plannedChainButton && me.attackPhase !== 'startup') {
        inp.pressed.push(this.plannedChainButton);
        this.plannedChainButton = null; this.chainPlanned = false;
      }
      return inp;
    }
    this.chainPlanned = null;

    // Nothing to decide while stunned / down / airborne.
    if (!me.neutral) { this.set('wait'); this.reactTimer = -1; return inp; }

    // --- counter attack right after a successful parry (the window is short: act on it at once)
    if (me.counterWindow > 0 && me.stats.attacks.counter && dist < attackRange(me.stats.attacks.counter) && this.rng() < this.cfg.counterSkill) {
      inp.pressed.push(this.rng() < 0.8 ? 'light' : 'heavy'); this.count('counter'); this.set('wait'); this.cooldown = 20; return inp;
    }

    // --- reaction to a player attack (human-like delay, then parry / duck / block / sidestep)
    if (oppThreat && opp.attackPhase === 'startup' && this.reactTimer < 0 && this.blockCooldown === 0 && this.mode !== 'block' && this.mode !== 'parry') {
      this.reactTimer = this.cfg.reaction; this.reactAttackId = opp.attack!.id;
    }
    if (this.reactTimer >= 0) {
      this.reactTimer--;
      if (this.reactTimer === 0) {
        if (oppThreat || (opp.state === 'attack' && opp.attackPhase === 'active' && dist < oppAtkRange)) this.react(me, opp, inp);
        this.reactTimer = -1;
      }
    }

    if (this.mode === 'parry') {
      if (this.parryDelay > 0) this.parryDelay--;
      else { inp.fwd = -1; if (--this.parryHold <= 0) { this.blockCooldown = BLOCK_COOLDOWN; this.set('wait'); } }
      return inp;
    }

    if (this.mode === 'block') {
      if (this.blockCrouch) inp.crouch = true; else inp.block = true;
      const attackOver = !oppAttacking && opp.state !== 'blockstun';
      if (this.modeFrames > MAX_BLOCK_FRAMES || (attackOver && this.modeFrames > 10)) {
        this.blockCooldown = BLOCK_COOLDOWN; // prevents infinite blocking
        if (me.state === 'blockstun' || this.rng() < 0.5) this.cooldown = 0;  // counter-attack right after blocking
        this.set('wait');
      }
      return inp;
    }

    // --- punish: defenceless opponents (guard broken / parried), whiffed recoveries, airborne opponents
    this.punish(me, opp, dist, oppAttacking ? opp : null);

    // --- periodic utility decision
    if (this.tick % this.cfg.decisionEvery === 0 || this.queued) this.decide(me, opp, dist);

    if (this.queued) {
      const act = this.queued; this.queued = null;
      // a boss recovers its composure faster in later phases (phase 3 acts about 30% more often)
      this.cooldown = (25 + this.rng() * 35 / this.beh.aggression) * (this.behavior === 'BOSS' ? [1, 0.88, 0.7][this.phase - 1] : 1);
      const major = act.id === 'special' || act.id === 'ultimate' || (act.id === 'grab' && this.behavior === 'BOSS');
      if (this.behavior === 'BOSS' && major) { // telegraph first
        this.tell = (this.phase === 3 ? 12 : this.phase === 2 ? 16 : 22) + (act.id === 'ultimate' ? 10 : 0);
        this.tellAct = act; this.telegraphMove = act.id; this.telegraphing = true;
        this.set('wait'); return inp;
      }
      this.perform(act, inp);
      this.set(this.style.retreatAfterAttack && act.id !== 'grab' && this.rng() < 0.5 ? 'retreat' : 'wait');
      return inp;
    }

    // --- movement
    const want = this.beh.spacing * this.style.range;
    switch (this.mode) {
      case 'approach': inp.fwd = 1; if (dist <= want) this.set('wait'); break;
      case 'retreat': inp.fwd = -1; if (this.modeFrames > 20 || dist > want + 0.6) this.set('wait'); break;
      case 'strafe': inp.side = this.strafeDir; if (dist > want + 0.5) inp.fwd = 0.6; if (this.modeFrames > 16) this.set('wait'); break;
      default: // 'wait' (and any stale mode): always resolve to a purposeful movement
        // Stall guard: waiting too long out of range forces an approach.
        if (dist > want + 0.4 || (this.modeFrames > 90 && dist > want + 0.1)) this.set('approach');
        else if (dist < Math.max(0.95, want * 0.62)) this.set('retreat'); // too close for this fighter's preferred range
        else if (this.mode !== 'wait') this.set('wait');
        else if (this.modeFrames > 24 && this.rng() < 0.0015 + 0.005 * this.beh.strafe) { this.strafeDir = this.rng() < 0.5 ? 1 : -1; this.set('strafe'); this.count('strafe'); }
        break;
    }
    // Cornered: sidestep out instead of getting stuck against the wall.
    const edge = me.bounds.x - 0.6;
    if (Math.abs(me.x) > edge && dist < 1.6 && me.neutral && this.rng() < 0.02) inp.dodge = this.rng() < 0.5 ? 1 : -1;
    return inp;
  }

  /** Turn a chosen move into the input a controller would send. */
  private perform(act: Act, inp: FighterInput): void {
    inp.pressed.push(act.btn); if (act.crouch) inp.crouch = true;
    this.history.push(act.id); if (this.history.length > HISTORY) this.history.shift();
    this.count(act.id); this.attackCount++;
  }

  private act(id: string): Act {
    switch (id) {
      case 'lowkick': return { id, btn: 'kick', crouch: true };
      case 'sweep': return { id, btn: 'heavy', crouch: true };
      case 'launcher': return { id, btn: 'light', crouch: true };
      case 'light1': return { id, btn: 'light' };
      default: return { id, btn: id as Button };
    }
  }

  private punish(me: Fighter, opp: Fighter, dist: number, attacker: Fighter | null): void {
    if (this.queued || this.cooldown > 0) return;
    const A = me.stats.attacks;
    // defenceless: guard broken or parried - a long window, so use the strongest tool in range (launcher for the juggle)
    if ((opp.guardBroken || opp.stagger) && this.rng() < 0.4 + this.cfg.punish * 0.5) {
      const options = ['launcher', 'heavy', 'light1'].filter((id) => A[id] && dist < attackRange(A[id]));
      if (options.length) { const id = this.behavior === 'TECHNICAL' || this.rng() < 0.5 ? options[0] : options[Math.floor(this.rng() * options.length)]; this.queued = this.act(id); this.count('punish'); return; }
    }
    // whiff punish: pick the move whose startup fits inside the opponent's remaining recovery
    if (attacker && attacker.attackPhase === 'recovery' && !attacker.connected && dist < 2.1 && this.rng() < this.cfg.punish * 0.15) {
      const rem = attacker.attackRemaining;
      const fits = ['heavy', 'kick', 'light1'].filter((id) => A[id] && A[id].startup + 2 <= rem && dist < attackRange(A[id]));
      if (fits.length) { this.queued = this.act(fits[0]); this.count('whiffPunish'); return; }
    }
    // anti-air
    if (opp.y > 0.35 && dist < 1.9 && opp.vy <= 0.05 && this.rng() < this.cfg.punish * 0.35) { this.queued = this.act(A.light1 && dist < attackRange(A.light1) ? 'light1' : 'kick'); this.count('antiAir'); }
  }

  private decide(me: Fighter, opp: Fighter, dist: number): void {
    if (this.cooldown > 0 || this.queued || !me.neutral) return;
    const A = me.stats.attacks, S = this.style;
    const oppVulnerable = opp.state === 'hitstun' || opp.state === 'blockstun' || opp.state === 'getup';
    const oppGuarding = opp.state === 'block' || opp.state === 'crouch';
    const oppCrouch = opp.state === 'crouch';
    const ag = this.beh.aggression;
    const usable = (id: string): boolean => !!A[id] && me.energy >= (A[id].cost ?? 0) && dist < attackRange(A[id]);

    // utility score per candidate; each is only a candidate if it can actually reach the opponent
    const scores: Array<[string, number]> = [['none', 0.25 * (1.2 - ag)]];
    if (usable('light1')) scores.push(['light1', (1.0 * ag + (oppVulnerable ? 0.5 : 0)) * S.light * (oppCrouch ? 0.3 : 1)]);
    if (usable('kick')) scores.push(['kick', (0.6 * ag + (oppGuarding ? 0.5 : 0)) * S.kick]);
    if (usable('heavy')) scores.push(['heavy', (0.4 * ag + (oppVulnerable ? 0.4 : 0) - (oppGuarding ? 0.2 : 0)) * S.heavy]);
    // mix-ups: lows beat standing guards, highs/lows keep a crouching defender honest, throws beat turtles
    if (usable('lowkick')) scores.push(['lowkick', (0.3 + this.beh.lows * 0.9 + (oppGuarding && !oppCrouch ? 0.5 : 0)) * S.low * ag]);
    if (usable('sweep')) scores.push(['sweep', (0.12 + this.beh.lows * 0.5 + (oppGuarding && !oppCrouch ? 0.3 : 0)) * S.low * ag]);
    if (usable('launcher')) scores.push(['launcher', (0.1 + (this.behavior === 'TECHNICAL' ? 0.35 : 0.1) + (oppCrouch ? 0.3 : 0)) * ag]);
    if (usable('grab')) scores.push(['grab', (0.1 + this.beh.grab * 0.5 + (this.oppGuardFrames > 24 ? 0.9 : 0)) * S.grab]);
    // shadow abilities: only when the meter allows (no free energy), at their own useful range
    if (me.energy >= (A.ultimate?.cost ?? 100) && dist > 1.2 && dist < 3.6) scores.push(['ultimate', 1.4 * ag]);
    else if (me.energy >= (A.special?.cost ?? 40) && dist > 1.7 && dist < 3.3) scores.push(['special', (0.55 + (this.behavior === 'BOSS' ? 0.2 * (this.phase - 1) : 0)) * ag]);
    // variety: the same move over and over gets less attractive
    const reps = (id: string) => this.history.slice(-3).filter((h) => h === id).length;
    const weighted = scores.map(([id, v]): [string, number] => [id, id === 'none' ? v : v * Math.pow(0.55, reps(id))]);
    const total = weighted.reduce((s, [, v]) => s + Math.max(0, v), 0);
    let r = this.rng() * total;
    for (const [id, v] of weighted) { r -= Math.max(0, v); if (r <= 0) { if (id !== 'none') this.queued = this.act(id); return; } }
  }
}
