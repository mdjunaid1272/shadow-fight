import type { AttackData, CharacterStats } from './types';

const a = (d: AttackData): AttackData => d;

/**
 * Shared move set (60 simulation frames per second). Every character derives its own table from this through
 * buildAttacks(), overriding timings, reach, hit shape and - importantly - which moves chain into which.
 *
 * Inputs:  light / heavy / kick, with crouch held: launcher / sweep / low kick.  grab: throw.  special / ultimate: shadow energy.
 * Direction: hold FORWARD / BACK / SIDEWAYS when pressing a button for a different move (dash strike, rush, axe kick, retreat cut,
 *            back kick, spin slash, spin kick, shadow arts), SPRINT + light = running strike.
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

  // ------------------------------------------------------------- directional moves (hold a direction while pressing the button)
  dashstrike: a({ // forward + light: a step-in strike that closes distance
    id: 'dashstrike', button: 'light', startup: 9, active: 3, recovery: 16,
    damage: 55, hitstun: 24, blockstun: 12, knockback: 0.1, energyGain: 5, lunge: 1.3,
    reach: 1.2, radius: 0.5, height: 1.3, cancelWindow: 8,
    chain: { heavy: 'heavy' }, knockdown: false, hitstop: 4, clip: 'DASHSTRIKE', poseSet: 'LIGHT1',
  }),
  rush: a({ // forward + heavy: charging blow that pressures guards
    id: 'rush', button: 'heavy', startup: 18, active: 5, recovery: 26,
    damage: 105, hitstun: 30, blockstun: 20, knockback: 0.3, energyGain: 9, lunge: 1.7,
    reach: 1.3, radius: 0.6, height: 1.2, cancelWindow: 0, guardDamage: 30,
    chain: {}, knockdown: true, hitstop: 7, clip: 'RUSH', poseSet: 'HEAVY',
  }),
  axekick: a({ // forward + kick: overhead axe kick - slow, but hits crouching defenders
    id: 'axekick', button: 'kick', startup: 15, active: 3, recovery: 24,
    damage: 90, hitstun: 28, blockstun: 16, knockback: 0.15, energyGain: 7, lunge: 0.3,
    reach: 1.15, radius: 0.5, height: 1.5, cancelWindow: 0, guardDamage: 20,
    chain: {}, knockdown: false, hitstop: 6, clip: 'AXEKICK',
  }),
  retreatcut: a({ // back + light: a cut thrown while stepping away - a spacing poke
    id: 'retreatcut', button: 'light', startup: 7, active: 3, recovery: 14,
    damage: 35, hitstun: 20, blockstun: 10, knockback: 0.12, energyGain: 3, lunge: -0.45,
    reach: 1.25, radius: 0.5, height: 1.3, cancelWindow: 0,
    chain: {}, knockdown: false, hitstop: 3, clip: 'RETREATCUT', poseSet: 'LIGHT2',
  }),
  backkick: a({ // back + kick: pushes the opponent away while backing off
    id: 'backkick', button: 'kick', startup: 10, active: 3, recovery: 16,
    damage: 50, hitstun: 22, blockstun: 14, knockback: 0.35, energyGain: 4, lunge: -0.3,
    reach: 1.3, radius: 0.4, height: 0.9, cancelWindow: 0,
    chain: {}, knockdown: false, hitstop: 4, clip: 'BACKKICK',
  }),
  spinslash: a({ // sideways + heavy: wide spinning attack - the answer to an opponent circling you
    id: 'spinslash', button: 'heavy', startup: 16, active: 6, recovery: 26,
    damage: 95, hitstun: 28, blockstun: 16, knockback: 0.25, energyGain: 8, lunge: 0.2,
    reach: 1.3, radius: 0.6, height: 1.2, cancelWindow: 0, shape: 'swing', arc: 300,
    chain: {}, knockdown: true, hitstop: 6, clip: 'SPINSLASH',
  }),
  spinkick: a({ // sideways + kick: spinning kick, wide and fast
    id: 'spinkick', button: 'kick', startup: 12, active: 5, recovery: 20,
    damage: 75, hitstun: 24, blockstun: 14, knockback: 0.18, energyGain: 6, lunge: 0.15,
    reach: 1.25, radius: 0.45, height: 0.9, cancelWindow: 0, shape: 'swing', arc: 240,
    chain: {}, knockdown: false, hitstop: 5, clip: 'SPINKICK',
  }),
  sprintstrike: a({ // sprint + light: running strike that covers a lot of ground
    id: 'sprintstrike', button: 'light', startup: 12, active: 4, recovery: 22,
    damage: 70, hitstun: 26, blockstun: 14, knockback: 0.25, energyGain: 6, lunge: 2.0,
    reach: 1.3, radius: 0.55, height: 1.2, cancelWindow: 0,
    chain: {}, knockdown: false, hitstop: 5, clip: 'SPRINTSTRIKE', poseSet: 'LIGHT1',
  }),

  // ------------------------------------------------------------- more air moves (jump + direction + button)
  divekick: a({ // forward + kick in the air: steep dive kick
    id: 'divekick', button: 'kick', startup: 5, active: 7, recovery: 8,
    damage: 65, hitstun: 24, blockstun: 14, knockback: 0.12, energyGain: 5, lunge: 0,
    reach: 1.0, radius: 0.45, height: 0.15, cancelWindow: 0, landLag: 12,
    chain: {}, knockdown: true, hitstop: 5, clip: 'DIVEKICK', air: true,
  }),
  airback: a({ // back + light in the air: retreating air cut
    id: 'airback', button: 'light', startup: 6, active: 5, recovery: 9,
    damage: 40, hitstun: 20, blockstun: 11, knockback: 0.1, energyGain: 4, lunge: 0,
    reach: 1.15, radius: 0.5, height: 0.7, cancelWindow: 0, landLag: 8,
    chain: {}, knockdown: false, hitstop: 3, clip: 'AIRBACK', poseSet: 'AIRLIGHT', air: true,
  }),
  airspin: a({ // sideways + heavy in the air: spinning air slash
    id: 'airspin', button: 'heavy', startup: 9, active: 8, recovery: 12,
    damage: 60, hitstun: 24, blockstun: 14, knockback: 0.15, energyGain: 6, lunge: 0,
    reach: 1.2, radius: 0.55, height: 0.8, cancelWindow: 0, landLag: 12, shape: 'swing', arc: 270,
    chain: {}, knockdown: false, hitstop: 5, clip: 'AIRSPIN', air: true,
  }),

  // ------------------------------------------------------------- extra shadow arts (direction + special)
  special_f: a({ // forward + special: advancing art
    id: 'special_f', button: 'special', startup: 14, active: 5, recovery: 24,
    damage: 120, hitstun: 26, blockstun: 18, knockback: 0.25, energyGain: 0, lunge: 2.8,
    reach: 1.4, radius: 0.6, height: 1.2, cancelWindow: 0, guardDamage: 22,
    chain: {}, knockdown: true, hitstop: 7, clip: 'SPECIAL_F', poseSet: 'SPECIAL', cost: 40,
  }),
  special_b: a({ // back + special: evasive art that cuts as it retreats
    id: 'special_b', button: 'special', startup: 10, active: 6, recovery: 22,
    damage: 100, hitstun: 26, blockstun: 16, knockback: 0.25, energyGain: 0, lunge: -1.2,
    reach: 2.0, radius: 0.5, height: 1.2, cancelWindow: 0, guardDamage: 18,
    chain: {}, knockdown: true, hitstop: 6, clip: 'SPECIAL_B', poseSet: 'SPECIAL', cost: 40,
  }),
  special_low: a({ // crouch + special: low art that must be crouch-guarded
    id: 'special_low', button: 'special', startup: 18, active: 6, recovery: 30,
    damage: 110, hitstun: 28, blockstun: 18, knockback: 0.25, energyGain: 0, lunge: 1.4,
    reach: 1.7, radius: 0.55, height: 0.25, cancelWindow: 0, level: 'low', guardDamage: 24,
    chain: {}, knockdown: true, hitstop: 7, clip: 'SPECIAL_LOW', poseSet: 'SWEEP', cost: 40,
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
  /** Character-only moves (new ids): chain finishers and signature techniques. */
  extra?: Record<string, AttackData>;
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
  for (const [id, a] of Object.entries(m.extra ?? {})) out[id] = { ...a, chain: { ...a.chain } }; // character-only moves are used exactly as authored
  // a chain-only move that no chain of this character reaches (e.g. a 3rd/4th light for a 2-hit fighter) does not exist for them
  for (const id of ['light3', 'light4']) {
    const referenced = Object.values(out).some((x) => Object.values(x.chain).includes(id));
    if (!referenced) delete out[id];
  }
  return out;
}
