import type { Fighter } from '../combat/Fighter';
import { emptyInput, type Button, type FighterInput } from '../combat/types';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';
export type Behavior = 'AGGRESSIVE' | 'DEFENSIVE' | 'BALANCED' | 'TECHNICAL' | 'BOSS';

interface DifficultyCfg {
  /** Frames the AI needs to react to a visible attack. */
  reaction: number; blockSkill: number; punish: number; comboSkill: number; dodgeSkill: number; decisionEvery: number;
}
/** Difficulty only changes reaction/decision quality - never damage or health. */
const DIFFICULTY: Record<Difficulty, DifficultyCfg> = {
  // Light startup is 5f, kick 9f, heavy 14f: EASY only reacts to heavies, NORMAL to kicks too, HARD can block lights.
  EASY: { reaction: 11, blockSkill: 0.35, punish: 0.2, comboSkill: 0.2, dodgeSkill: 0.0, decisionEvery: 18 },
  NORMAL: { reaction: 7, blockSkill: 0.55, punish: 0.5, comboSkill: 0.5, dodgeSkill: 0.15, decisionEvery: 12 },
  HARD: { reaction: 3, blockSkill: 0.75, punish: 0.8, comboSkill: 0.85, dodgeSkill: 0.3, decisionEvery: 8 },
};

interface BehaviorCfg { aggression: number; defense: number; spacing: number }
const BEHAVIOR: Record<Behavior, BehaviorCfg> = {
  AGGRESSIVE: { aggression: 0.85, defense: 0.6, spacing: 1.5 },
  DEFENSIVE: { aggression: 0.35, defense: 1.3, spacing: 2.0 },
  BALANCED: { aggression: 0.6, defense: 1.0, spacing: 1.75 },
  TECHNICAL: { aggression: 0.55, defense: 1.0, spacing: 1.7 },
  BOSS: { aggression: 0.8, defense: 1.1, spacing: 1.7 },
};

type Mode = 'approach' | 'attack' | 'block' | 'retreat' | 'wait';

const MAX_BLOCK_FRAMES = 40;
const BLOCK_COOLDOWN = 45;

/**
 * Finite-state machine with utility-scored decisions. Produces the same
 * FighterInput a human controller does, so it can only do what the player can.
 */
export class EnemyAI {
  private mode: Mode = 'wait';
  private modeFrames = 0;
  private tick = 0;
  private cooldown = 30;
  private blockCooldown = 0;
  private reactTimer = -1;
  private chainPlanned: boolean | null = null;
  private plannedChainButton: Button | null = null;
  private queued: Button | null = null;
  private dodgeDir = 0;
  private cfg: DifficultyCfg;
  private beh: BehaviorCfg;
  private baseCfg: DifficultyCfg;
  /** Boss phase 1-3 (always 1 for non-bosses). */
  phase = 1;
  onPhase: ((phase: number) => void) | null = null;

  constructor(public difficulty: Difficulty = 'NORMAL', public behavior: Behavior = 'BALANCED') {
    this.cfg = DIFFICULTY[difficulty]; this.beh = BEHAVIOR[behavior]; this.baseCfg = this.cfg;
  }

  reset(): void {
    this.mode = 'wait'; this.modeFrames = 0; this.cooldown = 40; this.blockCooldown = 0;
    if (this.behavior === 'BOSS') { this.phase = 1; this.applyPhase(); }
    this.reactTimer = -1; this.chainPlanned = null; this.queued = null;
  }

  private set(mode: Mode): void { this.mode = mode; this.modeFrames = 0; }

  /**
   * Boss phases by remaining health: 1 (>66%) measured, 2 (33-66%) pressures and mixes in specials more,
   * 3 (<33%) enraged: faster reactions and constant pressure. Damage is never boosted.
   */
  private applyPhase(): void {
    const b = BEHAVIOR.BOSS;
    this.beh = this.phase === 1 ? { ...b, aggression: 0.7 } : this.phase === 2 ? { ...b, aggression: 0.9, spacing: 1.6 } : { ...b, aggression: 1.1, spacing: 1.5, defense: 0.8 };
    this.cfg = { ...this.baseCfg, reaction: Math.max(2, Math.round(this.baseCfg.reaction * (this.phase === 3 ? 0.6 : this.phase === 2 ? 0.85 : 1))), comboSkill: Math.min(1, this.baseCfg.comboSkill + 0.15 * (this.phase - 1)), decisionEvery: Math.max(5, this.baseCfg.decisionEvery - (this.phase - 1) * 2) };
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

    // --- chain follow-ups: decided once per attack, executed inside the cancel window
    if (me.state === 'attack' && me.attack) {
      if (this.chainPlanned === null) {
        const options = Object.keys(me.attack.chain) as Button[];
        this.chainPlanned = options.length > 0 && Math.random() < this.cfg.comboSkill;
        this.plannedChainButton = options.length ? options[Math.floor(Math.random() * options.length)] : null;
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

    // --- reaction to player attack (human-like delay, then block or sidestep)
    if (oppThreat && opp.attackPhase === 'startup' && this.reactTimer < 0 && this.blockCooldown === 0) {
      this.reactTimer = this.cfg.reaction;
    }
    if (this.reactTimer >= 0) {
      this.reactTimer--;
      if (this.reactTimer === 0) {
        if (oppThreat && Math.random() < this.cfg.blockSkill * this.beh.defense) {
          if (Math.random() < this.cfg.dodgeSkill) { inp.dodge = Math.random() < 0.5 ? 1 : -1; }
          else this.set('block');
        }
        this.reactTimer = -1;
      }
    }

    if (this.mode === 'block') {
      inp.block = true;
      const attackOver = !oppAttacking && opp.state !== 'blockstun';
      if (this.modeFrames > MAX_BLOCK_FRAMES || (attackOver && this.modeFrames > 10)) {
        this.blockCooldown = BLOCK_COOLDOWN; // prevents infinite blocking
        // counter-attack right after a successful block
        if (me.state === 'blockstun' || Math.random() < 0.5) this.cooldown = 0;
        this.set('wait');
      }
      return inp;
    }

    // --- punish whiffed / recovering player attacks
    if (oppAttacking && opp.attackPhase === 'recovery' && !opp.connected && dist < 2.0 && me.neutral && Math.random() < this.cfg.punish * 0.15) {
      this.queued = dist < 1.6 ? 'heavy' : 'light';
    }

    // --- periodic utility decision
    if (this.tick % this.cfg.decisionEvery === 0 || this.queued) this.decide(me, opp, dist);

    if (this.queued) { inp.pressed.push(this.queued); this.queued = null; this.cooldown = 25 + Math.random() * 35 / this.beh.aggression; this.set('wait'); return inp; }

    // --- movement
    const want = this.beh.spacing;
    switch (this.mode) {
      case 'approach': inp.fwd = 1; if (dist <= want) this.set('wait'); break;
      case 'retreat': inp.fwd = -1; if (this.modeFrames > 20 || dist > want + 0.6) this.set('wait'); break;
      default: // 'wait' (and any stale mode): always resolve to a purposeful movement
        // Stall guard: waiting too long out of range forces an approach.
        if (dist > want + 0.4 || (this.modeFrames > 90 && dist > want + 0.1)) this.set('approach');
        else if (dist < 0.95) this.set('retreat');
        else if (this.mode !== 'wait') this.set('wait');
        break;
    }
    // Cornered: sidestep out instead of getting stuck against the wall.
    const edge = me.bounds.x - 0.6;
    if (Math.abs(me.x) > edge && dist < 1.6 && me.neutral && Math.random() < 0.02) inp.dodge = Math.random() < 0.5 ? 1 : -1;
    if (inp.dodge === 0 && this.dodgeDir !== 0) { this.dodgeDir = 0; }
    return inp;
  }

  private decide(me: Fighter, opp: Fighter, dist: number): void {
    if (this.cooldown > 0 || this.queued || !me.neutral) return;
    const oppVulnerable = opp.state === 'hitstun' || opp.state === 'blockstun' || opp.state === 'getup';
    const oppBlocking = opp.state === 'block';
    // utility scores per candidate action
    const scores: Array<[Button | 'none', number]> = [['none', 0.25 * (1.2 - this.beh.aggression)]];
    const inLight = dist < 1.75, inKick = dist < 1.75, inHeavy = dist < 2.05;
    if (inLight) scores.push(['light', 1.0 * this.beh.aggression + (oppVulnerable ? 0.5 : 0)]);
    if (inKick) scores.push(['kick', 0.6 * this.beh.aggression + (oppBlocking ? 0.5 : 0)]); // kick-mix vs blockers
    if (inHeavy) scores.push(['heavy', 0.4 * this.beh.aggression + (oppVulnerable ? 0.4 : 0) - (oppBlocking ? 0.2 : 0)]);
    // Shadow abilities: closer-range pressure tools, only when energy allows. Both are blockable / sidesteppable.
    if (me.energy >= 100 && dist > 1.2 && dist < 3.6) scores.push(['ultimate', 1.4 * this.beh.aggression]);
    else if (me.energy >= 40 && dist > 1.7 && dist < 3.3) scores.push(['special', 0.55 * this.beh.aggression]);
    const total = scores.reduce((s, [, v]) => s + Math.max(0, v), 0);
    let r = Math.random() * total;
    for (const [b, v] of scores) { r -= Math.max(0, v); if (r <= 0) { if (b !== 'none') this.queued = b; return; } }
  }
}

