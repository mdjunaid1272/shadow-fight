import type { AttackData, CharacterStats } from './types';

const a = (d: AttackData): AttackData => d;

/** Initial tuning values. Light 5/3/12, heavy 14/5/24 as per the design brief. */
export const BASE_ATTACKS: Record<string, AttackData> = {
  light1: a({
    id: 'light1', button: 'light', startup: 5, active: 3, recovery: 12,
    damage: 40, hitstun: 20, blockstun: 12, knockback: 0.05, energyGain: 4, lunge: 0.25,
    reach: 1.15, radius: 0.5, height: 1.3, cancelWindow: 10,
    chain: { light: 'light2', kick: 'kick', heavy: 'heavy' }, knockdown: false, hitstop: 3, clip: 'LIGHT1',
  }),
  light2: a({
    id: 'light2', button: 'light', startup: 6, active: 3, recovery: 14,
    damage: 45, hitstun: 22, blockstun: 12, knockback: 0.06, energyGain: 4, lunge: 0.25,
    reach: 1.2, radius: 0.5, height: 1.3, cancelWindow: 10,
    chain: { heavy: 'heavy', kick: 'kick' }, knockdown: false, hitstop: 3, clip: 'LIGHT2',
  }),
  kick: a({
    id: 'kick', button: 'kick', startup: 9, active: 4, recovery: 16,
    damage: 70, hitstun: 24, blockstun: 14, knockback: 0.12, energyGain: 6, lunge: 0.2,
    reach: 1.25, radius: 0.4, height: 0.9, cancelWindow: 8,
    chain: { heavy: 'heavy' }, knockdown: false, hitstop: 4, clip: 'KICK',
  }),
  heavy: a({
    id: 'heavy', button: 'heavy', startup: 14, active: 5, recovery: 24,
    damage: 120, hitstun: 30, blockstun: 18, knockback: 0.3, energyGain: 10, lunge: 0.45,
    reach: 1.45, radius: 0.6, height: 1.3, cancelWindow: 0,
    chain: {}, knockdown: true, hitstop: 7, clip: 'HEAVY',
  }),
  airlight: a({
    id: 'airlight', button: 'light', startup: 6, active: 6, recovery: 10,
    damage: 55, hitstun: 22, blockstun: 12, knockback: 0.08, energyGain: 5, lunge: 0,
    reach: 1.2, radius: 0.55, height: 0.6, cancelWindow: 0,
    chain: {}, knockdown: false, hitstop: 4, clip: 'AIRLIGHT', air: true,
  }),
  // Shadow Slash: dashing slash, blockable and dodgeable (sidestep i-frames beat it).
  special: a({
    id: 'special', button: 'special', startup: 16, active: 6, recovery: 26,
    damage: 140, hitstun: 28, blockstun: 20, knockback: 0.25, energyGain: 0, lunge: 2.2,
    reach: 1.5, radius: 0.65, height: 1.2, cancelWindow: 0,
    chain: {}, knockdown: true, hitstop: 8, clip: 'SPECIAL', cost: 40,
  }),
  // Crimson Execution: slow wind-up, cinematic; fully avoidable by block / sidestep.
  ultimate: a({
    id: 'ultimate', button: 'ultimate', startup: 30, active: 8, recovery: 40,
    damage: 320, hitstun: 40, blockstun: 26, knockback: 0.4, energyGain: 0, lunge: 3.0,
    reach: 1.7, radius: 0.85, height: 1.2, cancelWindow: 0,
    chain: {}, knockdown: true, hitstop: 14, clip: 'ULTIMATE', cost: 100, cinematic: true,
  }),
};

export const RONIN: CharacterStats = {
  name: 'Ronin', maxHealth: 1000, walkSpeed: 0.05, backSpeed: 0.036, attacks: BASE_ATTACKS,
};


export interface AttackMods {
  startupAdd?: number; recoveryAdd?: number; damage?: number; reach?: number; lunge?: number; hitstopAdd?: number;
  /** Per-attack overrides applied last (ability tuning). */
  overrides?: Record<string, Partial<AttackData>>;
}

/** Derive a character's attack table from the shared base, so tuning stays data-driven. */
export function buildAttacks(m: AttackMods): Record<string, AttackData> {
  const out: Record<string, AttackData> = {};
  for (const [id, a] of Object.entries(BASE_ATTACKS)) {
    const isAbility = id === 'special' || id === 'ultimate';
    out[id] = {
      ...a,
      chain: { ...a.chain },
      startup: Math.max(3, a.startup + (isAbility ? 0 : m.startupAdd ?? 0)),
      recovery: Math.max(6, a.recovery + (m.recoveryAdd ?? 0)),
      damage: Math.round(a.damage * (m.damage ?? 1)),
      reach: a.reach * (m.reach ?? 1),
      lunge: a.lunge * (m.lunge ?? 1),
      hitstop: a.hitstop + (m.hitstopAdd ?? 0),
      ...(m.overrides?.[id] ?? {}),
    };
  }
  return out;
}
