/** Pure (no I/O) profile model: defaults, migration, XP curve, rewards, unlock rules. */
export const SAVE_VERSION = 3;

export interface CharacterProgress { xp: number; level: number; wins: number; losses: number }

export type CosmeticSlot = 'skin' | 'armor' | 'weaponSkin' | 'vfx';

export interface MissionState { id: string; progress: number; claimed: boolean }
export interface MissionSet { key: string; list: MissionState[] }

export interface Profile {
  version: number;
  createdAt: number;
  gold: number;
  gems: number;
  characters: Record<string, CharacterProgress>;
  stats: { matches: number; wins: number; maxCombo: number; damageDealt: number };
  settings: {
    arena: string; difficulty: string; lastCharacter: string;
    musicVol: number; sfxVol: number; quality: 'low' | 'medium' | 'high'; touchScale: number; perfOverlay: boolean;
    /** 'hybrid' = controlled 3/4 cinematic camera (default); 'calm' = steady side-on; 'dynamic' = the older, livelier camera. */
    cameraStyle: 'hybrid' | 'calm' | 'dynamic';
    /** Fighting style: 'classic' (default) | 'iron' | 'wind' | 'shadow' - see combat/Styles.ts. */
    fightingStyle: 'classic' | 'iron' | 'wind' | 'shadow';
    /** Strength of cinematic camera moves (ultimate / KO / victory), 0.3 - 1.5. */
    cinematicIntensity: number;
    /** Camera distance multiplier (1 = default, higher = further back), 0.8 - 1.8. */
    cameraDistance: number;
    /** Cinematic camera moments + slow motion on ultimates, KOs and victory. */
    cinematics: boolean;
  };
  // ---- v2
  story: { cleared: number };
  records: { tournamentBest: number; tournamentWins: number; survivalBest: number };
  inventory: string[];
  equipped: Record<string, Partial<Record<CosmeticSlot, string>>>;
  /** Cosmetic weapon glow tier per weapon kind (1-5). Never affects combat stats. */
  weaponTier: Record<string, number>;
  missions: { daily: MissionSet; weekly: MissionSet };
  achievements: Record<string, number>;
  counters: { specials: number; perfectDodges: number; perfectRounds: number; bossesDefeated: number; survivalWaves: number; modesPlayed: Record<string, number> };
  dailyReward: { lastClaim: string; streak: number };
  ads: { removed: boolean; sessionsSinceInterstitial: number };
}

export const newCharacterProgress = (): CharacterProgress => ({ xp: 0, level: 1, wins: 0, losses: 0 });

export function defaultProfile(): Profile {
  return {
    version: SAVE_VERSION, createdAt: Date.now(), gold: 0, gems: 0, characters: {},
    stats: { matches: 0, wins: 0, maxCombo: 0, damageDealt: 0 },
    settings: { arena: 'temple', difficulty: 'NORMAL', lastCharacter: 'ronin', musicVol: 0.8, sfxVol: 1, quality: 'high', touchScale: 1, perfOverlay: false, cameraStyle: 'hybrid', fightingStyle: 'classic', cinematicIntensity: 1, cameraDistance: 1, cinematics: true },
    story: { cleared: 0 },
    records: { tournamentBest: 0, tournamentWins: 0, survivalBest: 0 },
    inventory: [], equipped: {}, weaponTier: {},
    missions: { daily: { key: '', list: [] }, weekly: { key: '', list: [] } },
    achievements: {},
    counters: { specials: 0, perfectDodges: 0, perfectRounds: 0, bossesDefeated: 0, survivalWaves: 0, modesPlayed: {} },
    dailyReward: { lastClaim: '', streak: 0 },
    ads: { removed: false, sessionsSinceInterstitial: 0 },
  };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

function migrateMissionSet(v: unknown): MissionSet {
  const o = obj(v);
  return {
    key: typeof o.key === 'string' ? o.key : '',
    list: Array.isArray(o.list) ? o.list.map((m) => ({ id: String(obj(m).id ?? ''), progress: num(obj(m).progress, 0), claimed: !!obj(m).claimed })).filter((m) => m.id) : [],
  };
}

/**
 * Bring any stored object up to the current version WITHOUT discarding data.
 * Known fields are validated and filled; unknown fields are preserved.
 * v0/v1 -> v2 only ADDS fields (story, records, inventory, missions...) - nothing is reset.
 */
export function migrateProfile(raw: unknown): Profile {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  const c = obj(r.counters), rec = obj(r.records), st = obj(r.settings), dr = obj(r.dailyReward), ad = obj(r.ads);
  const out: Profile = {
    ...(r as object),
    version: SAVE_VERSION,
    createdAt: num(r.createdAt, base.createdAt),
    gold: Math.max(0, num(r.gold, 0)),
    gems: Math.max(0, num(r.gems, 0)),
    characters: {},
    stats: {
      matches: num(obj(r.stats).matches, 0), wins: num(obj(r.stats).wins, 0),
      maxCombo: num(obj(r.stats).maxCombo, 0), damageDealt: num(obj(r.stats).damageDealt, 0),
    },
    settings: {
      ...base.settings, ...st,
      musicVol: num(st.musicVol, base.settings.musicVol), sfxVol: num(st.sfxVol, base.settings.sfxVol),
      touchScale: num(st.touchScale, 1), perfOverlay: !!st.perfOverlay,
      // v3: the old default 'calm' (never chosen explicitly by most players) moves to the new hybrid camera; an explicit 'dynamic' is kept
      cameraStyle: st.cameraStyle === 'dynamic' ? 'dynamic' : st.cameraStyle === 'calm' && num(r.version, 0) >= 3 ? 'calm' : 'hybrid',
      fightingStyle: st.fightingStyle === 'iron' || st.fightingStyle === 'wind' || st.fightingStyle === 'shadow' ? st.fightingStyle : 'classic',
      cinematicIntensity: Math.max(0.3, Math.min(1.5, num(st.cinematicIntensity, 1))), cameraDistance: Math.max(0.8, Math.min(1.8, num(st.cameraDistance, 1))), cinematics: st.cinematics !== false,
      quality: st.quality === 'low' || st.quality === 'medium' || st.quality === 'high' ? st.quality : 'high',
    },
    story: { cleared: Math.max(0, Math.min(15, num(obj(r.story).cleared, 0))) },
    records: { tournamentBest: num(rec.tournamentBest, 0), tournamentWins: num(rec.tournamentWins, 0), survivalBest: num(rec.survivalBest, 0) },
    inventory: [...new Set(strArr(r.inventory))],
    equipped: {},
    weaponTier: {},
    missions: { daily: migrateMissionSet(obj(r.missions).daily), weekly: migrateMissionSet(obj(r.missions).weekly) },
    achievements: {},
    counters: {
      specials: num(c.specials, 0), perfectDodges: num(c.perfectDodges, 0), perfectRounds: num(c.perfectRounds, 0),
      bossesDefeated: num(c.bossesDefeated, 0), survivalWaves: num(c.survivalWaves, 0),
      modesPlayed: Object.fromEntries(Object.entries(obj(c.modesPlayed)).filter(([, v]) => typeof v === 'number')) as Record<string, number>,
    },
    dailyReward: { lastClaim: typeof dr.lastClaim === 'string' ? dr.lastClaim : '', streak: num(dr.streak, 0) },
    ads: { removed: !!ad.removed, sessionsSinceInterstitial: num(ad.sessionsSinceInterstitial, 0) },
  } as Profile;
  for (const [id, cp] of Object.entries(obj(r.characters))) {
    const c2 = obj(cp);
    out.characters[id] = { ...c2, xp: num(c2.xp, 0), level: Math.max(1, num(c2.level, 1)), wins: num(c2.wins, 0), losses: num(c2.losses, 0) } as CharacterProgress;
  }
  for (const [id, eq] of Object.entries(obj(r.equipped))) {
    const e = obj(eq); const slots: Partial<Record<CosmeticSlot, string>> = {};
    for (const s of ['skin', 'armor', 'weaponSkin', 'vfx'] as CosmeticSlot[]) if (typeof e[s] === 'string') slots[s] = e[s];
    out.equipped[id] = slots;
  }
  for (const [k, v] of Object.entries(obj(r.weaponTier))) if (typeof v === 'number') out.weaponTier[k] = Math.max(1, Math.min(5, Math.round(v)));
  for (const [k, v] of Object.entries(obj(r.achievements))) if (typeof v === 'number') out.achievements[k] = v;
  return out;
}

/** XP needed to go from `level` to `level + 1`. */
export const xpForNextLevel = (level: number): number => Math.round(100 * Math.pow(level, 1.4));
export const MAX_LEVEL = 30;

export function addXp(p: CharacterProgress, amount: number): { levelsGained: number } {
  p.xp += Math.max(0, Math.round(amount));
  let gained = 0;
  while (p.level < MAX_LEVEL && p.xp >= xpForNextLevel(p.level)) { p.xp -= xpForNextLevel(p.level); p.level++; gained++; }
  if (p.level >= MAX_LEVEL) p.xp = 0;
  return { levelsGained: gained };
}

export interface MatchResult {
  won: boolean; maxCombo: number; damage: number; roundsWon: number; difficulty: string;
  /** Multiplies XP/gold (modes scale rewards; training uses 0). */
  rewardMult?: number;
  mode?: string;
  specials?: number; perfectDodges?: number; perfectRounds?: number; boss?: boolean;
}
export interface Rewards { xp: number; gold: number; gems: number }

const DIFF_MULT: Record<string, number> = { EASY: 0.7, NORMAL: 1, HARD: 1.5 };

export function computeRewards(r: MatchResult, levelsGained = 0): Rewards {
  const m = (DIFF_MULT[r.difficulty] ?? 1) * (r.rewardMult ?? 1);
  const xp = Math.round(((r.won ? 120 : 40) + r.maxCombo * 5 + r.damage / 20) * m);
  const gold = Math.round(((r.won ? 80 : 25) + r.roundsWon * 10) * m);
  return { xp, gold, gems: levelsGained * 5 };
}

/** Characters unlock by wins (or can be bought in the store: item id `char_<id>`). */
export const CHARACTER_UNLOCKS: Record<string, { wins: number }> = { titan: { wins: 2 }, akira: { wins: 5 } };

export function characterLockReason(p: Profile, id: string): string | null {
  const rule = CHARACTER_UNLOCKS[id];
  if (!rule || p.stats.wins >= rule.wins || p.inventory.includes(`char_${id}`)) return null;
  return `Win ${rule.wins} matches (${p.stats.wins}/${rule.wins}) or buy in the Store`;
}

/** Apply a finished match to the profile. Returns what to show on the result screen. */
export function applyMatch(p: Profile, charId: string, r: MatchResult) {
  const before = new Set(Object.keys(CHARACTER_UNLOCKS).filter((id) => !characterLockReason(p, id)));
  const cp = (p.characters[charId] ??= newCharacterProgress());
  const rew = computeRewards(r);
  const gained = addXp(cp, rew.xp).levelsGained;
  rew.gems = gained * 5;
  p.gold += rew.gold; p.gems += rew.gems;
  if (r.won) { cp.wins++; p.stats.wins++; } else cp.losses++;
  p.stats.matches++;
  p.stats.maxCombo = Math.max(p.stats.maxCombo, r.maxCombo);
  p.stats.damageDealt += Math.round(r.damage);
  p.counters.specials += r.specials ?? 0;
  p.counters.perfectDodges += r.perfectDodges ?? 0;
  p.counters.perfectRounds += r.perfectRounds ?? 0;
  if (r.won && r.boss) p.counters.bossesDefeated++;
  if (r.mode) p.counters.modesPlayed[r.mode] = (p.counters.modesPlayed[r.mode] ?? 0) + 1;
  const unlocked = Object.keys(CHARACTER_UNLOCKS).filter((id) => !before.has(id) && !characterLockReason(p, id));
  return { rewards: rew, levelsGained: gained, newLevel: cp.level, unlocked };
}
