import { Emitter } from './Events';
import type { CombatManager } from '../combat/CombatManager';
import { SIM_FPS } from '../combat/types';

export type Phase = 'menu' | 'intro' | 'fight' | 'roundEnd' | 'matchEnd';

export interface MatchEvents {
  roundIntro: { round: number };
  fightStart: Record<string, never>;
  /** winner: 0 player, 1 enemy, -1 draw */
  roundEnd: { winner: number; reason: 'ko' | 'time'; wins: [number, number] };
  matchEnd: { winner: number; wins: [number, number] };
}

export const ROUND_SECONDS = 60;
export const ROUNDS_TO_WIN = 2;
const INTRO_FRAMES = 130;
const FIGHT_CALL_FRAME = 70;
const ROUND_END_FRAMES = 190;
const MAX_ROUNDS = 5;

/** Best-of-3 round state machine. Runs on the fixed simulation clock. */
export class Match {
  readonly events = new Emitter<MatchEvents>();
  phase: Phase = 'menu';
  wins: [number, number] = [0, 0];
  round = 0;
  timerFrames = ROUND_SECONDS * SIM_FPS;
  durationFrames = 0;
  private phaseFrames = 0;
  /** Per-mode rules (set before startMatch). */
  roundsToWin = ROUNDS_TO_WIN;
  /** Practice (Training): no timer, KOs do not end the round. */
  practice = false;
  private koLoser = -2;
  private fightCalled = false;

  constructor(private combat: CombatManager) {
    combat.events.on('ko', ({ loser }) => { this.koLoser = this.koLoser === -2 || this.koLoser === loser ? loser : -1; });
  }

  get timerSeconds(): number { return this.timerFrames / SIM_FPS; }
  get fighting(): boolean { return this.phase === 'fight'; }

  configure(o: { roundsToWin?: number; practice?: boolean }): void {
    this.roundsToWin = o.roundsToWin ?? ROUNDS_TO_WIN; this.practice = !!o.practice;
  }

  /** Stop the fight immediately (quit to menu). */
  abort(): void { this.phase = 'menu'; this.combat.active = false; }

  startMatch(): void {
    this.wins = [0, 0]; this.round = 0; this.durationFrames = 0;
    this.combat.resetStats();
    this.startRound();
  }

  private startRound(): void {
    this.round++;
    this.phase = 'intro'; this.phaseFrames = 0; this.fightCalled = false;
    this.timerFrames = ROUND_SECONDS * SIM_FPS; this.koLoser = -2;
    this.combat.active = false;
    this.events.emit('roundIntro', { round: this.round });
  }

  step(): void {
    this.phaseFrames++;
    switch (this.phase) {
      case 'intro':
        if (!this.fightCalled && this.phaseFrames >= FIGHT_CALL_FRAME) { this.fightCalled = true; this.events.emit('fightStart', {}); }
        if (this.phaseFrames >= INTRO_FRAMES) { this.phase = 'fight'; this.phaseFrames = 0; this.combat.active = true; }
        break;
      case 'fight': {
        this.durationFrames++;
        if (this.practice) { this.koLoser = -2; break; }
        if (!this.combat.frozen) this.timerFrames--;
        if (this.koLoser !== -2) this.endRound(this.koLoser === -1 ? -1 : 1 - this.koLoser, 'ko');
        else if (this.timerFrames <= 0) {
          const [p, e] = this.combat.fighters;
          this.endRound(p.health === e.health ? -1 : p.health > e.health ? 0 : 1, 'time');
        }
        break;
      }
      case 'roundEnd':
        if (this.phaseFrames >= ROUND_END_FRAMES) {
          if (this.wins[0] >= this.roundsToWin || this.wins[1] >= this.roundsToWin || this.round >= MAX_ROUNDS + this.roundsToWin) {
            this.phase = 'matchEnd';
            const w = this.wins[0] === this.wins[1] ? -1 : this.wins[0] > this.wins[1] ? 0 : 1;
            this.events.emit('matchEnd', { winner: w, wins: [...this.wins] as [number, number] });
          } else this.startRound();
        }
        break;
      default: break;
    }
  }

  private endRound(winner: number, reason: 'ko' | 'time'): void {
    this.phase = 'roundEnd'; this.phaseFrames = 0; this.combat.active = false;
    if (winner >= 0) this.wins[winner]++;
    const [p, e] = this.combat.fighters;
    if (winner === 0) { p.win(); if (e.state !== 'defeat') e.setState('defeat'); }
    else if (winner === 1) { e.win(); if (p.state !== 'defeat') p.setState('defeat'); }
    this.events.emit('roundEnd', { winner, reason, wins: [...this.wins] as [number, number] });
  }
}
