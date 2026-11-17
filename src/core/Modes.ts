import type { Behavior, Difficulty } from '../ai/EnemyAI';
import type { Palette } from '../characters/CharacterData';
import { CHARACTERS } from '../characters/CharacterData';
import { grantReward, type StoreItem } from '../progression/StoreData';
import type { Profile } from '../progression/Profile';

export type ModeId = 'duel' | 'story' | 'tournament' | 'survival' | 'training';

export interface Encounter {
  id: string;
  title: string;
  subtitle?: string;
  /** Roster id, or 'any' to pick a random opponent different from the player. */
  enemyId: string;
  difficulty: Difficulty;
  behavior: Behavior;
  arena: string;
  boss?: boolean;
  /** Boss health multiplier. Difficulty never boosts enemy damage - only decisions and (for bosses) health. */
  healthMult: number;
  displayName?: string;
  palette?: Partial<Palette>;
  roundsToWin: number;
  rewardMult: number;
  /** Training: no timer, no round end, unlimited resources. */
  practice?: boolean;
  /** Fraction (0-1) of max health the player starts with (Survival's limited recovery). */
  startHealthFrac?: number;
  /** Story reward key granted on first clear (bosses). */
  rewardKey?: string;
  /** Story index (0-14) when part of the story. */
  storyIndex?: number;
}

export interface Outcome {
  /** What the result screen offers next. */
  kind: 'continue' | 'retry' | 'end';
  next?: Encounter;
  title: string;
  lines: string[];
  rewardItems: StoreItem[];
  bonusGold: number;
}

const D: Difficulty[] = ['EASY', 'NORMAL', 'HARD'];
const bump = (d: Difficulty, n: number): Difficulty => D[Math.min(2, D.indexOf(d) + n)];

// ---------------------------------------------------------------- story (5 chapters x 3 encounters, bosses at 6, 12, 15)
export interface Chapter { title: string; blurb: string; arena: string }
export const CHAPTERS: Chapter[] = [
  { title: 'Temple of Beginnings', blurb: 'Prove yourself in the old courtyard.', arena: 'temple' },
  { title: 'Whispers in the Dojo', blurb: 'The shadow clans are watching.', arena: 'dojo' },
  { title: 'Night Training', blurb: 'Rivals gather after dark.', arena: 'dojo' },
  { title: 'Ashes of the Fortress', blurb: 'Cross the lava to reach the keep.', arena: 'volcano' },
  { title: 'The Shadow Throne', blurb: 'End the clash. Face the Emperor.', arena: 'volcano' },
];

type S = Omit<Encounter, 'id' | 'arena' | 'storyIndex' | 'roundsToWin' | 'rewardMult' | 'healthMult'> & { healthMult?: number };
const enc = (chapter: number, n: number, s: S): Encounter => ({
  id: `story-${chapter + 1}-${n + 1}`, arena: CHAPTERS[chapter].arena, storyIndex: chapter * 3 + n,
  roundsToWin: 2, rewardMult: 1 + chapter * 0.2 + (s.boss ? 0.5 : 0), healthMult: 1, ...s,
});

export const STORY: Encounter[] = [
  enc(0, 0, { title: 'First Steps', subtitle: 'Chapter 1 - 1', enemyId: 'shinobi', difficulty: 'EASY', behavior: 'BALANCED' }),
  enc(0, 1, { title: 'The Gatekeeper', subtitle: 'Chapter 1 - 2', enemyId: 'akira', difficulty: 'EASY', behavior: 'DEFENSIVE' }),
  enc(0, 2, { title: 'Courtyard Duel', subtitle: 'Chapter 1 - 3', enemyId: 'titan', difficulty: 'EASY', behavior: 'AGGRESSIVE' }),
  enc(1, 0, { title: 'Silent Steps', subtitle: 'Chapter 2 - 1', enemyId: 'shinobi', difficulty: 'EASY', behavior: 'AGGRESSIVE' }),
  enc(1, 1, { title: 'A Familiar Blade', subtitle: 'Chapter 2 - 2', enemyId: 'ronin', difficulty: 'NORMAL', behavior: 'TECHNICAL' }),
  enc(1, 2, { title: 'Abbot Ryu', subtitle: 'BOSS - Chapter 2', enemyId: 'titan', difficulty: 'NORMAL', behavior: 'BOSS', boss: true, healthMult: 1.3, displayName: 'ABBOT RYU', rewardKey: 'story_boss_1', palette: { cloth: 0x3a2a14, clothDark: 0x1c1408, accent: 0xffd700, glow: 0xffd700 } }),
  enc(2, 0, { title: 'Spear in the Dark', subtitle: 'Chapter 3 - 1', enemyId: 'akira', difficulty: 'NORMAL', behavior: 'TECHNICAL' }),
  enc(2, 1, { title: 'Iron Wall', subtitle: 'Chapter 3 - 2', enemyId: 'titan', difficulty: 'NORMAL', behavior: 'DEFENSIVE' }),
  enc(2, 2, { title: 'Night Raiders', subtitle: 'Chapter 3 - 3', enemyId: 'shinobi', difficulty: 'NORMAL', behavior: 'AGGRESSIVE' }),
  enc(3, 0, { title: 'Ember Road', subtitle: 'Chapter 4 - 1', enemyId: 'ronin', difficulty: 'NORMAL', behavior: 'BALANCED' }),
  enc(3, 1, { title: 'Dragon Guard', subtitle: 'Chapter 4 - 2', enemyId: 'akira', difficulty: 'HARD', behavior: 'TECHNICAL' }),
  enc(3, 2, { title: 'Warden Kuro', subtitle: 'BOSS - Chapter 4', enemyId: 'shinobi', difficulty: 'HARD', behavior: 'BOSS', boss: true, healthMult: 1.35, displayName: 'WARDEN KURO', rewardKey: 'story_boss_2', palette: { cloth: 0x401018, clothDark: 0x1c060a, accent: 0xff4a1a, glow: 0xff4a1a } }),
  enc(4, 0, { title: 'Throne Guard', subtitle: 'Chapter 5 - 1', enemyId: 'titan', difficulty: 'HARD', behavior: 'AGGRESSIVE' }),
  enc(4, 1, { title: 'Last Shadow', subtitle: 'Chapter 5 - 2', enemyId: 'shinobi', difficulty: 'HARD', behavior: 'TECHNICAL' }),
  enc(4, 2, { title: 'The Shadow Emperor', subtitle: 'FINAL BOSS', enemyId: 'ronin', difficulty: 'HARD', behavior: 'BOSS', boss: true, healthMult: 1.5, displayName: 'SHADOW EMPEROR', rewardKey: 'story_clear', palette: { cloth: 0x14121c, clothDark: 0x0a0810, accent: 0x8a4bff, glow: 0xb06bff, skin: 0x8a7a90 } }),
];

const ARENA_ORDER = ['temple', 'dojo', 'volcano'];
const pickOther = (playerId: string, rnd = Math.random): string => {
  const others = CHARACTERS.filter((c) => c.id !== playerId);
  return others[Math.floor(rnd() * others.length)].id;
};

/** Mode flow controller: builds encounters and decides what follows a finished fight. Pure logic. */
export class ModeManager {
  mode: ModeId = 'duel';
  playerId = 'ronin';
  index = 0;
  baseDifficulty: Difficulty = 'NORMAL';
  private tournament: Encounter[] = [];
  private wave = 1;
  private current_: Encounter | null = null;
  /** Fraction of health to carry into the next Survival fight. */
  private carry = 1;
  revives = 0;

  get current(): Encounter { return this.current_!; }
  get waveNumber(): number { return this.wave; }

  startDuel(playerId: string, difficulty: Difficulty, arena: string, enemyId = 'any'): Encounter {
    this.reset('duel', playerId, difficulty);
    return this.set({ id: 'duel', title: 'DUEL', enemyId, difficulty, behavior: 'BALANCED', arena, healthMult: 1, roundsToWin: 2, rewardMult: 1 });
  }

  startStory(playerId: string, index: number): Encounter {
    this.reset('story', playerId, 'NORMAL'); this.index = Math.max(0, Math.min(STORY.length - 1, index));
    return this.set({ ...STORY[this.index] });
  }

  startTournament(playerId: string, difficulty: Difficulty): Encounter {
    this.reset('tournament', playerId, difficulty);
    const others = CHARACTERS.filter((c) => c.id !== playerId).map((c) => c.id);
    const names = ['QUARTER-FINAL', 'SEMI-FINAL', 'GRAND FINAL', 'CHAMPION BOUT'];
    this.tournament = [0, 1, 2, 3].map((i) => ({
      id: `tournament-${i + 1}`, title: names[i], subtitle: `Bout ${i + 1} of 4`,
      enemyId: others[i % others.length], difficulty: bump(difficulty, i >= 2 ? 1 : 0),
      behavior: i === 3 ? 'BOSS' as Behavior : (['BALANCED', 'AGGRESSIVE', 'TECHNICAL'] as Behavior[])[i % 3],
      arena: ARENA_ORDER[i % ARENA_ORDER.length], healthMult: i === 3 ? 1.15 : 1, boss: i === 3,
      roundsToWin: 2, rewardMult: 0.8 + i * 0.25,
    }));
    return this.set(this.tournament[0]);
  }

  startSurvival(playerId: string, difficulty: Difficulty): Encounter {
    this.reset('survival', playerId, difficulty); this.wave = 1; this.carry = 1;
    return this.set(this.survivalEncounter());
  }

  startTraining(playerId: string, arena: string): Encounter {
    this.reset('training', playerId, 'NORMAL');
    return this.set({ id: 'training', title: 'TRAINING', enemyId: 'any', difficulty: 'NORMAL', behavior: 'BALANCED', arena, healthMult: 1, roundsToWin: 99, rewardMult: 0, practice: true });
  }

  private reset(mode: ModeId, playerId: string, difficulty: Difficulty): void {
    this.mode = mode; this.playerId = playerId; this.baseDifficulty = difficulty; this.index = 0; this.revives = 0; this.carry = 1;
  }

  private set(e: Encounter): Encounter { this.current_ = { ...e, enemyId: e.enemyId === 'any' || e.enemyId === this.playerId ? pickOther(this.playerId) : e.enemyId }; return this.current_; }

  private survivalEncounter(): Encounter {
    const w = this.wave;
    const behaviors: Behavior[] = ['BALANCED', 'AGGRESSIVE', 'DEFENSIVE', 'TECHNICAL'];
    return {
      id: `survival-${w}`, title: `WAVE ${w}`, subtitle: w % 5 === 0 ? 'Elite opponent' : 'Survival', enemyId: 'any',
      difficulty: bump(this.baseDifficulty, Math.floor((w - 1) / 3)), behavior: w % 5 === 0 ? 'BOSS' : behaviors[(w * 7) % behaviors.length],
      arena: ARENA_ORDER[(w - 1) % ARENA_ORDER.length], healthMult: w % 5 === 0 ? 1.2 : 1, boss: w % 5 === 0,
      roundsToWin: 1, rewardMult: 0.5 + Math.min(1.5, w * 0.1), startHealthFrac: this.carry,
    };
  }

  /**
   * Called when a fight ends. Updates profile records/story progress and returns what comes next.
   * @param playerHealthFrac player's remaining health fraction (0-1) at the end, used by Survival.
   */
  finish(won: boolean, p: Profile, playerHealthFrac = 1): Outcome {
    const e = this.current;
    const out: Outcome = { kind: 'end', title: won ? 'VICTORY' : 'DEFEAT', lines: [], rewardItems: [], bonusGold: 0 };
    switch (this.mode) {
      case 'story': {
        const idx = e.storyIndex ?? 0;
        if (won) {
          const firstClear = idx >= p.story.cleared;
          if (firstClear) {
            p.story.cleared = idx + 1;
            out.bonusGold = 100 + idx * 30; p.gold += out.bonusGold;
            if (e.rewardKey) out.rewardItems = grantReward(p, e.rewardKey);
            out.lines.push(`Encounter cleared: ${e.title}`);
          } else out.lines.push('Replay - no first-clear bonus');
          if (idx < STORY.length - 1) { out.kind = 'continue'; out.next = this.set({ ...STORY[idx + 1] }); this.index = idx + 1; }
          else { out.title = 'STORY COMPLETE'; out.lines.push('The Shadow Emperor has fallen. The clash is over.'); }
        } else { out.kind = 'retry'; out.lines.push('Try again - the encounter restarts.'); }
        break;
      }
      case 'tournament': {
        const bout = this.index + 1;
        if (won) {
          p.records.tournamentBest = Math.max(p.records.tournamentBest, bout);
          if (bout >= this.tournament.length) { p.records.tournamentWins++; out.title = 'CHAMPION!'; out.lines.push('You won the tournament.'); out.bonusGold = 500; p.gold += 500; }
          else { this.index++; out.kind = 'continue'; out.next = this.set(this.tournament[this.index]); out.lines.push(`Bout ${bout} won. Next: ${out.next.title}`); }
        } else out.lines.push(`Eliminated in bout ${bout} of ${this.tournament.length}.`);
        break;
      }
      case 'survival': {
        if (won) {
          p.counters.survivalWaves++;
          p.records.survivalBest = Math.max(p.records.survivalBest, this.wave);
          this.carry = Math.min(1, playerHealthFrac + 0.2); // limited recovery between waves
          this.wave++; out.kind = 'continue'; out.next = this.set(this.survivalEncounter());
          out.title = `WAVE ${this.wave - 1} CLEARED`; out.lines.push(`Health restored to ${Math.round(this.carry * 100)}% (limited recovery)`);
        } else {
          out.title = 'RUN OVER'; out.lines.push(`You survived ${this.wave - 1} wave${this.wave === 2 ? '' : 's'}. Best: ${p.records.survivalBest}`);
        }
        break;
      }
      default: break;
    }
    return out;
  }

  /** Survival revive: re-enter the same wave at half health. */
  revive(): Encounter { this.revives++; this.carry = 0.5; return this.set(this.survivalEncounter()); }
}
