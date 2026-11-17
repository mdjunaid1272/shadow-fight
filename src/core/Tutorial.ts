/**
 * Interactive first-time tutorial for Training mode. It teaches by DOING: every step completes only when the game reports
 * the real action (a jump, a landed heavy attack, a blocked hit ...), not when text is dismissed. Pure logic (no DOM) so it
 * can be tested headlessly; Game feeds it events and HUD shows the current step.
 */
export type TutorialKey = 'moved' | 'jumped' | 'lightHit' | 'heavyHit' | 'blocked' | 'dodged' | 'combo' | 'special' | 'ultimate';
export type TutorialDummy = 'idle' | 'parry' | 'dodge';

export interface TutorialStep {
  id: string;
  title: string;
  /** What to do - desktop keys first, touch controls in brackets. */
  text: string;
  /** Needed amount of `key` (metres for 'moved', otherwise a count). */
  key: TutorialKey;
  need: number;
  /** How the training dummy behaves during this step. */
  dummy: TutorialDummy;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'move', title: 'MOVE', text: 'Walk toward and away from the dummy: A / D  (stick left-right). S and Shift step around it.', key: 'moved', need: 3, dummy: 'idle' },
  { id: 'jump', title: 'JUMP', text: 'Jump with W or Space  (JUMP button).', key: 'jumped', need: 1, dummy: 'idle' },
  { id: 'light', title: 'LIGHT ATTACK', text: 'Hit the dummy with a light attack: J  (LIGHT). Get close first.', key: 'lightHit', need: 1, dummy: 'idle' },
  { id: 'heavy', title: 'HEAVY ATTACK', text: 'Land a heavy attack: K  (HEAVY). Slower, but it knocks down.', key: 'heavyHit', need: 1, dummy: 'idle' },
  { id: 'block', title: 'BLOCK', text: 'The dummy will swing at you. Hold BACK (A or D away from it) to block - tap back just as it hits to PARRY.', key: 'blocked', need: 1, dummy: 'parry' },
  { id: 'dodge', title: 'DODGE', text: 'Sidestep the dummy\'s big attack with Q or E  (DODGE) just before it lands.', key: 'dodged', need: 1, dummy: 'dodge' },
  { id: 'combo', title: 'COMBO', text: 'Chain three hits: J, J, J  (tap LIGHT three times as each one connects).', key: 'combo', need: 1, dummy: 'idle' },
  { id: 'special', title: 'SPECIAL', text: 'Use your special with U  (SPECIAL). It costs shadow energy (free in training).', key: 'special', need: 1, dummy: 'idle' },
  { id: 'ultimate', title: 'ULTIMATE', text: 'Unleash your ultimate with I  (ULT).', key: 'ultimate', need: 1, dummy: 'idle' },
];

const STORAGE_KEY = 'shadowclash.tutorialDone';

export class Tutorial {
  active = false;
  index = 0;
  private total: Record<TutorialKey, number> = { moved: 0, jumped: 0, lightHit: 0, heavyHit: 0, blocked: 0, dodged: 0, combo: 0, special: 0, ultimate: 0 };
  private base: Record<TutorialKey, number> = { ...this.total };
  /** Called whenever the visible step changes (or the tutorial ends: step = null). */
  onChange: (step: TutorialStep | null, index: number, total: number) => void = () => {};
  /** Called once the final step completes. */
  onComplete: () => void = () => {};

  get step(): TutorialStep | null { return this.active ? TUTORIAL_STEPS[this.index] ?? null : null; }
  get count(): number { return TUTORIAL_STEPS.length; }

  start(): void {
    this.active = true; this.index = 0; this.rebase(); this.onChange(this.step, 0, this.count);
  }
  stop(): void { if (!this.active) return; this.active = false; this.onChange(null, this.index, this.count); }

  /** Report a real in-game action. */
  note(key: TutorialKey, amount = 1): void {
    this.total[key] += amount;
    if (!this.active) return;
    const s = this.step;
    if (s && this.total[s.key] - this.base[s.key] >= s.need) this.advance();
  }

  /** Progress (0..1) of the current step, e.g. for a distance bar. */
  get progress(): number { const s = this.step; return s ? Math.min(1, (this.total[s.key] - this.base[s.key]) / s.need) : 0; }

  private advance(): void {
    this.index++;
    if (this.index >= this.count) { this.active = false; markTutorialDone(); this.onChange(null, this.count, this.count); this.onComplete(); return; }
    this.rebase(); this.onChange(this.step, this.index, this.count);
  }
  private rebase(): void { this.base = { ...this.total }; }
}

export function tutorialDone(): boolean { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } }
export function markTutorialDone(): void { try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage unavailable */ } }
