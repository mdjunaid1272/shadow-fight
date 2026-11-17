import type { AttackData, CharacterStats } from './types';

const a = (d: AttackData): AttackData => d;

/**
 * Shared move set (60 simulation frames per second). Every character derives its own table from this through
 * buildAttacks(), overriding timings, reach, hit shape and - importantly - which moves chain into which.
 *
 * Inputs:  light / heavy / kick, with crouch held: launcher / sweep / low kick.  grab: throw.  special / ultimate: shadow energy.
 * Air:     light / heavy / kick while jumping: airlight / airheavy / airkick.
 * Counter: after a parry, light or heavy performs the character's counter attack.
 * Heights: light jabs are HIGH (duck them), low kicks and sweeps are LOW (crouch-guard them), the rest MID.
 */
export const BASE_ATTACKS: Record<string, AttackData> = {
  // ------------------------------------------------------------- light chain
  light1: a({
    id: 'light1', button: 'light', startup: 5, active: 3, recovery: 12,
    damage: 40, hitstun: 20, blockstun: 12, knockback: 0.05, energyGain: 4, lunge: 0.25,
    reach: 1.15, radius: 0.5, height: 1.3, cancelWindow: 10, level: 'high',
    chain: { light: 'light2', kick: 'kick', heavy: 'heavy' }, knockdown: false, hitstop: 3, clip: 'LIGHT1',
  }),
  light2: a({
    id: 'light2', button: 'light', startup: 6, active: 3, recovery: 14,
    damage: 45, hitstun: 22, blockstun: 12, knockback: 0.06, energyGain: 4, lunge: 0.25,
    reach: 1.2, radius: 0.5, height: 1.3, cancelWindow: 10, level: 'high',
    chain: { light: 'light3', heavy: 'heavy', kick: 'kick' }, knockdown: false, hitstop: 3, clip: 'LIGHT2',
  }),
  light3: a({ // chain finisher: slower, harder, cannot be followed by another light
    id: 'light3', button: 'light', startup: 7, active: 3, recovery: 18,
    damage: 55, hitstun: 24, blockstun: 14, knockback: 0.14, energyGain: 5, lunge: 0.3,
    reach: 1.25, radius: 0.55, height: 1.3, cancelWindow: 8,
    chain: { heavy: 'heavy' }, knockdown: false, hitstop: 4, clip: 'LIGHT3', poseSet: 'LIGHT1',
  }),
  light4: a({ // only reachable by characters whose chains continue (Shinobi's rapid flurry)
    id: 'light4', button: 'light', startup: 6, active: 3, recovery: 16,
    damage: 40, hitstun: 22, blockstun: 12, knockback: 0.1, energyGain: 4, lunge: 0.3,
    reach: 1.1, radius: 0.5, height: 1.3, cancelWindow: 6,
    chain: { kick: 'kick' }, knockdown: false, hitstop: 3, clip: 'LIGHT4', poseSet: 'LIGHT2',
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
    reach: 1.45, radius: 0.6, height: 1.3, cancelWindow: 0, guardDamage: 22,
    chain: {}, knockdown: true, hitstop: 7, clip: 'HEAVY',
  }),

  // ------------------------------------------------------------- crouching moves (crouch + button)
  lowkick: a({ // fast low poke: must be crouch-guarded, pairs with high jabs for a real mix-up
    id: 'lowkick', button: 'kick', startup: 8, active: 3, recovery: 16,
    damage: 45, hitstun: 22, blockstun: 12, knockback: 0.08, energyGain: 4, lunge: 0.1,
    reach: 1.25, radius: 0.4, height: 0.25, cancelWindow: 0, level: 'low',
    chain: {}, knockdown: false, hitstop: 4, clip: 'LOWKICK',
  }),
  sweep: a({ // slow low sweep that knocks down
    id: 'sweep', button: 'heavy', startup: 14, active: 4, recovery: 26,
    damage: 70, hitstun: 26, blockstun: 16, knockback: 0.2, energyGain: 8, lunge: 0.2,
    reach: 1.35, radius: 0.5, height: 0.2, cancelWindow: 0, level: 'low', guardDamage: 16,
    chain: {}, knockdown: true, hitstop: 6, clip: 'SWEEP',
  }),
  launcher: a({ // rising strike: throws the victim up so a juggle can follow
    id: 'launcher', button: 'light', startup: 15, active: 2, recovery: 30,
    damage: 60, hitstun: 40, blockstun: 18, knockback: 0.05, energyGain: 6, lunge: 0.3,
    reach: 1.1, radius: 0.55, height: 1.2, cancelWindow: 14, launch: 0.215,
    chain: { light: 'light1', kick: 'kick' }, knockdown: false, hitstop: 6, clip: 'LAUNCHER',
  }),

  // ------------------------------------------------------------- grab (throw)
  grab: a({
    id: 'grab', button: 'grab', startup: 9, active: 3, recovery: 24,
    damage: 100, hitstun: 0, blockstun: 0, knockback: 0.3, energyGain: 8, lunge: 0.2,
    reach: 0.85, radius: 0.5, height: 1.0, cancelWindow: 0, grab: true,
    chain: {}, knockdown: true, hitstop: 6, clip: 'GRAB',
  }),

  // ------------------------------------------------------------- counter (light/heavy within a window after a parry)
  counter: a({
    id: 'counter', button: 'light', startup: 5, active: 4, recovery: 16,
    damage: 85, hitstun: 30, blockstun: 14, knockback: 0.2, energyGain: 8, lunge: 0.5,
    reach: 1.3, radius: 0.55, height: 1.3, cancelWindow: 0,
    chain: {}, knockdown: true, hitstop: 7, clip: 'COUNTER', poseSet: 'LIGHT1',
  }),

  // ------------------------------------------------------------- air moves (jump + button)
  airlight: a({
    id: 'airlight', button: 'light', startup: 6, active: 6, recovery: 10,
    damage: 55, hitstun: 22, blockstun: 12, knockback: 0.08, energyGain: 5, lunge: 0,
    reach: 1.2, radius: 0.55, height: 0.6, cancelWindow: 0, landLag: 8,
    chain: {}, knockdown: false, hitstop: 4, clip: 'AIRLIGHT', air: true,
  }),
  airheavy: a({ // diving overhead: slow, hits hard, knocks down
    id: 'airheavy', button: 'heavy', startup: 10, active: 5, recovery: 14,
    damage: 90, hitstun: 28, blockstun: 16, knockback: 0.12, energyGain: 7, lunge: 0,
    reach: 1.15, radius: 0.6, height: 0.3, cancelWindow: 0, landLag: 14, guardDamage: 18,
    chain: {}, knockdown: true, hitstop: 6, clip: 'AIRHEAVY', air: true,
  }),
  airkick: a({ // quick low-angle air kick: the juggle starter / safe jump-in
    id: 'airkick', button: 'kick', startup: 4, active: 5, recovery: 8,
    damage: 45, hitstun: 20, blockstun: 12, knockback: 0.06, energyGain: 4, lunge: 0,
    reach: 1.3, radius: 0.4, height: 0.35, cancelWindow: 0, landLag: 10,
    chain: {}, knockdown: false, hitstop: 3, clip: 'AIRKICK', air: true,
  }),

  // ------------------------------------------------------------- shadow abilities
  // Shadow Slash: dashing slash, blockable and dodgeable (sidestep i-frames beat it).
  special: a({
    id: 'special', button: 'special', startup: 16, active: 6, recovery: 26,
    damage: 140, hitstun: 28, blockstun: 20, knockback: 0.25, energyGain: 0, lunge: 2.2,
    reach: 1.5, radius: 0.65, height: 1.2, cancelWindow: 0, guardDamage: 26,
    chain: {}, knockdown: true, hitstop: 8, clip: 'SPECIAL', cost: 40,
  }),
  // Crimson Execution: slow wind-up, cinematic; fully avoidable by block / sidestep.
  ultimate: a({
    id: 'ultimate', button: 'ultimate', startup: 30, active: 8, recovery: 40,
    damage: 320, hitstun: 40, blockstun: 26, knockback: 0.4, energyGain: 0, lunge: 3.0,
    reach: 1.7, radius: 0.85, height: 1.2, cancelWindow: 0, guardDamage: 45,
    chain: {}, knockdown: true, hitstop: 14, clip: 'ULTIMATE', cost: 100, cinematic: true,
  }),
};

export const RONIN: CharacterStats = {
  name: 'Ronin', maxHealth: 1000, walkSpeed: 0.05, backSpeed: 0.036, attacks: BASE_ATTACKS,
};


export interface AttackMods {
  startupAdd?: number; recoveryAdd?: number; damage?: number; reach?: number; lunge?: number; hitstopAdd?: number;
  /** Per-attack overrides applied last (ability tuning, hit shapes, character-specific chains). */
  overrides?: Record<string, Partial<AttackData>>;
}

/** Derive a character's attack table from the shared base, so tuning stays data-driven. */
export function buildAttacks(m: AttackMods): Record<string, AttackData> {
  const out: Record<string, AttackData> = {};
  for (const [id, a] of Object.entries(BASE_ATTACKS)) {
    const isAbility = id === 'special' || id === 'ultimate';
    const fixed = id === 'grab' || id === 'counter'; // throws and counters keep their own tuning; characters override them explicitly
    out[id] = {
      ...a,
      chain: { ...a.chain },
      startup: Math.max(3, a.startup + (isAbility || fixed ? 0 : m.startupAdd ?? 0)),
      recovery: Math.max(6, a.recovery + (m.recoveryAdd ?? 0)),
      damage: Math.round(a.damage * (fixed ? 1 : m.damage ?? 1)),
      reach: a.reach * (fixed ? 1 : m.reach ?? 1),
      lunge: a.lunge * (m.lunge ?? 1),
      hitstop: a.hitstop + (m.hitstopAdd ?? 0),
      ...(m.overrides?.[id] ?? {}),
    };
  }
  return out;
}
