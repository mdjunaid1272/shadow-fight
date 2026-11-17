import type { MissionSet, MissionState, Profile } from './Profile';

/**
 * Missions & achievements. Pure logic: the game reports events, this file
 * updates progress, rotates the daily/weekly sets and grants rewards.
 */
export type MissionEvent =
  | 'match_played' | 'match_won' | 'combo' | 'damage' | 'special' | 'perfect_dodge' | 'perfect_round'
  | 'story_cleared' | 'survival_wave' | 'boss_defeated' | 'tournament_won' | `win_with:${string}` | `mode:${string}`;

export interface MissionDef {
  id: string; title: string; event: MissionEvent; target: number;
  /** 'sum' accumulates; 'max' keeps the highest single value (e.g. best combo). */
  kind: 'sum' | 'max';
  reward: { gold: number; gems: number; xp: number };
}

const d = (id: string, title: string, event: MissionEvent, target: number, gold: number, kind: 'sum' | 'max' = 'sum', gems = 0, xp = 0): MissionDef =>
  ({ id, title, event, target, kind, reward: { gold, gems, xp } });

export const DAILY_POOL: MissionDef[] = [
  d('d_win2', 'Win 2 matches', 'match_won', 2, 150),
  d('d_win3', 'Win 3 matches', 'match_won', 3, 220, 'sum', 0, 40),
  d('d_play4', 'Play 4 matches', 'match_played', 4, 120),
  d('d_combo4', 'Land a 4-hit combo', 'combo', 4, 140, 'max'),
  d('d_combo6', 'Land a 6-hit combo', 'combo', 6, 200, 'max', 1),
  d('d_special3', 'Use 3 special attacks', 'special', 3, 130),
  d('d_dodge2', 'Perfect-dodge 2 attacks', 'perfect_dodge', 2, 160),
  d('d_dmg2500', 'Deal 2500 damage', 'damage', 2500, 150),
  d('d_story1', 'Clear a Story encounter', 'story_cleared', 1, 180),
  d('d_surv3', 'Survive 3 waves in Survival', 'survival_wave', 3, 200, 'max'),
  d('d_perfect1', 'Win a round without taking damage', 'perfect_round', 1, 250, 'sum', 2),
];
export const WEEKLY_POOL: MissionDef[] = [
  d('w_win10', 'Win 10 matches', 'match_won', 10, 600, 'sum', 5, 150),
  d('w_dmg15k', 'Deal 15,000 damage', 'damage', 15000, 650, 'sum', 3),
  d('w_special15', 'Use 15 special attacks', 'special', 15, 550),
  d('w_dodge10', 'Perfect-dodge 10 attacks', 'perfect_dodge', 10, 600, 'sum', 3),
  d('w_boss1', 'Defeat a Story boss', 'boss_defeated', 1, 800, 'sum', 5),
  d('w_tourney', 'Win a Tournament', 'tournament_won', 1, 900, 'sum', 8),
  d('w_surv8', 'Reach wave 8 in Survival', 'survival_wave', 8, 750, 'max', 4),
  d('w_combo9', 'Land a 9-hit combo', 'combo', 9, 700, 'max', 4),
];

export const missionDef = (id: string): MissionDef | undefined => [...DAILY_POOL, ...WEEKLY_POOL].find((m) => m.id === id);

// ---------------------------------------------------------------- rotation
export const dayKey = (t = Date.now()): string => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
/** ISO-ish week key: the Monday of the week. */
export const weekKey = (t = Date.now()): string => { const x = new Date(t); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return dayKey(x.getTime()); };

function seeded(seed: string): () => number {
  let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
function pick(pool: MissionDef[], n: number, seed: string): MissionDef[] {
  const rnd = seeded(seed), a = [...pool];
  const out: MissionDef[] = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]);
  return out;
}

/** Rotate the sets if the day/week changed. Returns true if anything changed (save needed). */
export function ensureMissions(p: Profile, now = Date.now()): boolean {
  let changed = false;
  const dk = dayKey(now), wk = weekKey(now);
  if (p.missions.daily.key !== dk) { p.missions.daily = { key: dk, list: pick(DAILY_POOL, 3, 'd' + dk).map((m) => ({ id: m.id, progress: 0, claimed: false })) }; changed = true; }
  if (p.missions.weekly.key !== wk) { p.missions.weekly = { key: wk, list: pick(WEEKLY_POOL, 3, 'w' + wk).map((m) => ({ id: m.id, progress: 0, claimed: false })) }; changed = true; }
  return changed;
}

export function trackEvent(p: Profile, event: MissionEvent, value = 1): void {
  for (const set of [p.missions.daily, p.missions.weekly]) {
    for (const m of set.list) {
      const def = missionDef(m.id);
      if (!def || def.event !== event || m.claimed) continue;
      m.progress = def.kind === 'max' ? Math.max(m.progress, value) : m.progress + value;
    }
  }
}

export const missionComplete = (m: MissionState): boolean => { const def = missionDef(m.id); return !!def && m.progress >= def.target; };

/** Claim a finished mission; returns the reward or null if not claimable. */
export function claimMission(p: Profile, id: string): MissionDef['reward'] | null {
  for (const set of [p.missions.daily, p.missions.weekly] as MissionSet[]) {
    const m = set.list.find((x) => x.id === id);
    if (!m || m.claimed || !missionComplete(m)) continue;
    const def = missionDef(id)!; m.claimed = true;
    p.gold += def.reward.gold; p.gems += def.reward.gems;
    return def.reward;
  }
  return null;
}

// ---------------------------------------------------------------- daily login reward
export function dailyRewardAmount(streak: number): { gold: number; gems: number } {
  const s = Math.min(7, Math.max(1, streak));
  return { gold: 50 + s * 25, gems: s === 7 ? 5 : s % 3 === 0 ? 1 : 0 };
}
export function canClaimDaily(p: Profile, now = Date.now()): boolean { return p.dailyReward.lastClaim !== dayKey(now); }
export function claimDaily(p: Profile, bonus = 1, now = Date.now()): { gold: number; gems: number; streak: number } | null {
  if (!canClaimDaily(p, now)) return null;
  const yesterday = dayKey(now - 86400000);
  p.dailyReward.streak = p.dailyReward.lastClaim === yesterday ? p.dailyReward.streak + 1 : 1;
  p.dailyReward.lastClaim = dayKey(now);
  const r = dailyRewardAmount(p.dailyReward.streak);
  const gold = r.gold * bonus, gems = r.gems * bonus;
  p.gold += gold; p.gems += gems;
  return { gold, gems, streak: p.dailyReward.streak };
}

// ---------------------------------------------------------------- achievements
export interface AchievementDef { id: string; title: string; desc: string; test: (p: Profile) => boolean; reward: { gold: number; gems: number } }
const a = (id: string, title: string, desc: string, test: (p: Profile) => boolean, gold = 100, gems = 0): AchievementDef => ({ id, title, desc, test, reward: { gold, gems } });
export const ACHIEVEMENTS: AchievementDef[] = [
  a('first_win', 'First Blood', 'Win your first match', (p) => p.stats.wins >= 1, 100),
  a('wins_10', 'Seasoned Fighter', 'Win 10 matches', (p) => p.stats.wins >= 10, 250, 2),
  a('wins_50', 'Living Legend', 'Win 50 matches', (p) => p.stats.wins >= 50, 1000, 10),
  a('combo_5', 'Chain Reaction', 'Land a 5-hit combo', (p) => p.stats.maxCombo >= 5, 150),
  a('combo_9', 'Combo Master', 'Land a 9-hit combo', (p) => p.stats.maxCombo >= 9, 400, 3),
  a('damage_20k', 'Heavy Hitter', 'Deal 20,000 total damage', (p) => p.stats.damageDealt >= 20000, 300, 2),
  a('special_25', 'Shadow Adept', 'Use 25 special attacks', (p) => p.counters.specials >= 25, 250, 1),
  a('dodge_15', 'Untouchable', 'Perfect-dodge 15 attacks', (p) => p.counters.perfectDodges >= 15, 300, 2),
  a('perfect_1', 'Flawless', 'Win a round without taking damage', (p) => p.counters.perfectRounds >= 1, 300, 2),
  a('story_5', 'Chapter One', 'Clear 3 Story encounters', (p) => p.story.cleared >= 3, 200),
  a('story_boss', 'Boss Slayer', 'Defeat a Story boss', (p) => p.counters.bossesDefeated >= 1, 400, 3),
  a('story_all', 'Shadow Master', 'Clear the whole Story', (p) => p.story.cleared >= 15, 2000, 20),
  a('tourney', 'Champion', 'Win a Tournament', (p) => p.records.tournamentWins >= 1, 500, 5),
  a('survival_5', 'Last One Standing', 'Reach wave 5 in Survival', (p) => p.records.survivalBest >= 5, 400, 3),
  a('roster', 'Full Roster', 'Fight with all four characters', (p) => ['ronin', 'shinobi', 'titan', 'akira'].every((c) => (p.characters[c]?.wins ?? 0) + (p.characters[c]?.losses ?? 0) > 0), 350, 3),
  a('mastery_10', 'Mastery', 'Reach level 10 with any character', (p) => Object.values(p.characters).some((c) => c.level >= 10), 500, 5),
];

/** Grants any newly earned achievements (and their rewards). Returns the new ones. */
export function checkAchievements(p: Profile, now = Date.now()): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (p.achievements[def.id] || !def.test(p)) continue;
    p.achievements[def.id] = now; p.gold += def.reward.gold; p.gems += def.reward.gems; out.push(def);
  }
  return out;
}
