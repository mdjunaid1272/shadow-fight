import { buildAttacks } from '../combat/AttackData';
import type { AttackData, CharacterStats } from '../combat/types';

export type WeaponKind = 'katana' | 'daggers' | 'gauntlets' | 'spear';

export interface Palette { skin: number; cloth: number; clothDark: number; accent: number; hair: number; metal: number; glow: number }

export interface CharacterDef {
  id: string;
  name: string;
  style: string;
  weapon: WeaponKind;
  weaponName: string;
  palette: Palette;
  /** Uniform body scale (Titan is bigger, Shinobi leaner). */
  scale: number;
  abilities: [string, string];
  /** 1-10 display ratings for the select screen. */
  ratings: { power: number; speed: number; range: number; defense: number };
  blurb: string;
  stats: CharacterStats;
}

/** A character-only move (chain finisher): frame data authored in full. */
const move = (d: AttackData): AttackData => d;

/** Data-driven roster. Add a character by adding an entry - no combat code changes needed. */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'ronin', name: 'RONIN', style: 'Balanced sword combat', weapon: 'katana', weaponName: 'Katana', scale: 1,
    palette: { skin: 0xd9a47e, cloth: 0x34447f, clothDark: 0x1f2850, accent: 0xc8203c, hair: 0x1b1512, metal: 0xcfd6e0, glow: 0xff3050 },
    abilities: ['Shadow Slash', 'Crimson Execution'],
    ratings: { power: 6, speed: 6, range: 6, defense: 6 },
    blurb: 'A masterless swordsman. Fair in every way, dangerous in all of them.',
    stats: {
      id: 'ronin', name: 'Ronin', maxHealth: 1000, walkSpeed: 0.05, backSpeed: 0.036,
      attacks: buildAttacks({ // katana: every slash sweeps an arc, so it hits what the blade visibly passes through
        extra: {
          // chain finishers
          risingslash: move({ id: 'risingslash', name: 'Rising Slash', button: 'kick', startup: 10, active: 3, recovery: 24, damage: 50, hitstun: 40, blockstun: 14, knockback: 0.05, energyGain: 5, lunge: 0.25, reach: 1.3, radius: 0.55, height: 1.3, cancelWindow: 0, launch: 0.215, shape: 'swing', arc: 100, chain: {}, knockdown: false, hitstop: 5, clip: 'RISINGSLASH', poseSet: 'LAUNCHER' }),
          tsubame: move({ id: 'tsubame', name: 'Swallow Cut', button: 'kick', startup: 7, active: 3, recovery: 16, damage: 50, hitstun: 22, blockstun: 12, knockback: 0.08, energyGain: 5, lunge: 0.3, reach: 1.25, radius: 0.5, height: 1.3, cancelWindow: 8, shape: 'swing', arc: 110, chain: { heavy: 'heavy' }, knockdown: false, hitstop: 4, clip: 'TSUBAME', poseSet: 'LIGHT2' }),
        },
        overrides: {
          light1: { shape: 'swing', arc: 70, chain: { light: 'light2', kick: 'tsubame', heavy: 'heavy' } },
          light2: { shape: 'swing', arc: 80 }, heavy: { shape: 'swing', arc: 120 },
          light3: { shape: 'swing', arc: 95, damage: 60, chain: { heavy: 'heavy', kick: 'risingslash' } }, // rising finisher of the 3-hit chain
          sweep: { shape: 'swing', arc: 130 },                             // low blade sweep
          counter: { shape: 'swing', arc: 100, reach: 1.35, damage: 95 },  // defensive counter slash after a parry
          // direction moves: every one is a different weapon technique
          dashstrike: { name: 'Step Cut', shape: 'swing', arc: 60 }, rush: { name: 'Overhead Cleave', shape: 'swing', arc: 90 },
          retreatcut: { name: 'Withdrawing Cut', shape: 'swing', arc: 60 }, spinslash: { name: 'Whirling Blade', shape: 'swing', arc: 320 },
          sprintstrike: { name: 'Running Thrust', shape: 'thrust', reachStart: 0.4, damage: 75 },
          special: { shape: 'swing', arc: 50 }, ultimate: { shape: 'swing', arc: 170 },
          special_f: { name: 'Crimson Dash', shape: 'swing', arc: 60, lunge: 3.2, damage: 125 },
          special_b: { name: 'Moonlit Retreat', shape: 'swing', arc: 80 },
          special_low: { name: 'Rising Tide', shape: 'swing', arc: 140 },
        },
      }),
    },
  },
  {
    id: 'shinobi', name: 'SHINOBI', style: 'Fast assassin', weapon: 'daggers', weaponName: 'Dual Daggers', scale: 0.96,
    palette: { skin: 0xcfa07c, cloth: 0x2b3340, clothDark: 0x12161d, accent: 0x8a4bff, hair: 0x0e0c10, metal: 0xb8c0d0, glow: 0xb06bff },
    abilities: ['Phantom Dash', 'Shadow Barrage'],
    ratings: { power: 4, speed: 10, range: 3, defense: 4 },
    blurb: 'Strikes first, strikes fast. Every hit is light, but they never stop coming.',
    stats: {
      id: 'shinobi', name: 'Shinobi', maxHealth: 900, walkSpeed: 0.064, backSpeed: 0.048, jump: 1.12, dodgeSpeed: 1.3, // nimble: highest jump, longest sidestep
      attacks: buildAttacks({
        startupAdd: -1, recoveryAdd: -2, damage: 0.75, reach: 0.88, lunge: 1.1,
        extra: {
          flipkick: move({ id: 'flipkick', name: 'Flip Kick', button: 'heavy', startup: 9, active: 3, recovery: 24, damage: 45, hitstun: 40, blockstun: 14, knockback: 0.05, energyGain: 5, lunge: 0.3, reach: 1.0, radius: 0.5, height: 1.0, cancelWindow: 0, launch: 0.215, chain: {}, knockdown: false, hitstop: 5, clip: 'FLIPKICK' }),
          trip: move({ id: 'trip', name: 'Trip', button: 'kick', startup: 8, active: 3, recovery: 18, damage: 40, hitstun: 26, blockstun: 12, knockback: 0.12, energyGain: 4, lunge: 0.2, reach: 1.1, radius: 0.45, height: 0.25, cancelWindow: 0, level: 'low', chain: {}, knockdown: true, hitstop: 5, clip: 'TRIP', poseSet: 'LOWKICK' }),
        },
        overrides: { // daggers: short, fast, narrow arcs
          // four-hit flurry: every dagger strike is fast, the chain keeps going
          light1: { shape: 'swing', arc: 50 },
          light2: { shape: 'swing', arc: 50, chain: { light: 'light3', kick: 'kick', heavy: 'heavy' } },
          light3: { shape: 'swing', arc: 55, damage: 34, startup: 5, recovery: 12, chain: { light: 'light4', kick: 'trip' } },
          light4: { shape: 'swing', arc: 70, damage: 44, startup: 6, recovery: 18, knockback: 0.16, chain: { kick: 'kick', heavy: 'flipkick' } },
          counter: { shape: 'swing', arc: 70, reach: 1.15, lunge: 1.7, damage: 72, knockdown: false, recovery: 14 }, // evasive counter: slips past and cuts
          grab: { damage: 80, startup: 8, recovery: 20 },                  // quick, light throw
          airkick: { damage: 40, recovery: 7 },
          // direction moves: long, evasive, hit-and-run
          dashstrike: { name: 'Shadow Lunge', shape: 'swing', arc: 50, lunge: 1.9, damage: 48 },
          rush: { name: 'Shadow Rush', lunge: 2.4, damage: 80, startup: 15 },
          retreatcut: { name: 'Vanishing Cut', lunge: -0.7, startup: 6 },
          backkick: { name: 'Shadow Kick' }, spinslash: { name: 'Blade Cyclone', arc: 340, startup: 13 }, spinkick: { name: 'Dancing Kick', startup: 10 },
          sprintstrike: { name: 'Blur Strike', lunge: 2.8, startup: 10 },
          axekick: { name: 'Falling Heel' },
          special: { startup: 11, lunge: 3.6, damage: 105, recovery: 22, reach: 1.3 },
          special_f: { name: 'Shadow Step', shape: 'swing', arc: 70, lunge: 4.0, hits: 3, damage: 38, active: 6, startup: 11 },  // a three-hit dash
          special_b: { name: 'Smoke Vanish', lunge: -2.0, damage: 70, startup: 8 },
          special_low: { name: 'Viper Cut', lunge: 2.0, startup: 14, damage: 80 },
          ultimate: { damage: 250, startup: 26, lunge: 3.6, active: 12 },
        },
      }),
    },
  },
  {
    id: 'titan', name: 'TITAN', style: 'Heavy martial arts', weapon: 'gauntlets', weaponName: 'Heavy Gauntlets', scale: 1.12,
    palette: { skin: 0xb57a58, cloth: 0x5b4a3a, clothDark: 0x2d241c, accent: 0xffb43a, hair: 0x201812, metal: 0x8d8f98, glow: 0xffa030 },
    abilities: ['Ground Breaker', 'Titan Wrath'],
    ratings: { power: 10, speed: 3, range: 4, defense: 8 },
    blurb: 'Every blow lands like a falling wall. Slow to start, impossible to ignore.',
    stats: {
      id: 'titan', name: 'Titan', maxHealth: 1150, walkSpeed: 0.04, backSpeed: 0.03, jump: 0.9, dodgeSpeed: 0.8, // heavy: low jump, short sidestep
      attacks: buildAttacks({
        startupAdd: 2, recoveryAdd: 3, damage: 1.3, reach: 0.95, hitstopAdd: 1,
        extra: {
          knee: move({ id: 'knee', name: 'Knee Strike', button: 'kick', startup: 9, active: 3, recovery: 18, damage: 80, hitstun: 26, blockstun: 14, knockback: 0.2, energyGain: 6, lunge: 0.3, reach: 1.0, radius: 0.5, height: 1.0, cancelWindow: 0, chain: {}, knockdown: false, hitstop: 6, clip: 'KNEE' }),
          hammerfist: move({ id: 'hammerfist', name: 'Hammer Fist', button: 'heavy', startup: 15, active: 4, recovery: 24, damage: 130, hitstun: 30, blockstun: 18, knockback: 0.3, energyGain: 9, lunge: 0.4, reach: 1.2, radius: 0.6, height: 1.3, cancelWindow: 0, guardDamage: 30, chain: {}, knockdown: true, hitstop: 8, clip: 'HAMMERFIST', poseSet: 'HEAVY' }),
        },
        overrides: {
          light1: { chain: { light: 'light2', kick: 'kick', heavy: 'hammerfist' } },
          light2: { chain: { heavy: 'heavy', kick: 'knee' } },             // jab-cross only: no third light, the heavy or a knee follows
          heavy: { guardDamage: 48 },                                      // armour-breaking blow: wrecks a guard in two hits
          counter: { damage: 120, guardDamage: 40, recovery: 20 },         // crushing counter
          grab: { damage: 150, reach: 1.0, startup: 9, recovery: 28 },     // the strongest throw
          launcher: { damage: 80, launch: 0.19 },
          // direction moves: heavy, committal, huge damage
          dashstrike: { name: 'Shoulder Charge', lunge: 1.0, damage: 75, radius: 0.6 },
          rush: { name: 'Bull Rush', lunge: 2.2, damage: 140, guardDamage: 40, startup: 20 },
          axekick: { name: 'Hammer Heel', damage: 120, startup: 17 },
          retreatcut: { name: 'Jab Away', damage: 45 }, backkick: { name: 'Mule Kick', knockback: 0.5 },
          spinslash: { name: 'Whirlwind', damage: 120, arc: 280 }, spinkick: { name: 'Sweeping Boot', damage: 95 },
          sprintstrike: { name: 'Charging Tackle', lunge: 2.4, damage: 100, knockdown: true },
          special: { startup: 22, lunge: 0.9, damage: 190, reach: 1.3, radius: 1.0, recovery: 32, guardDamage: 70 },
          special_f: { name: 'Earthquake Step', lunge: 1.6, damage: 160, radius: 1.1, guardDamage: 50 },
          special_b: { name: 'Iron Recoil', lunge: -0.6, damage: 130, reach: 1.6, radius: 0.9 },
          special_low: { name: 'Quake Fist', damage: 150, reach: 1.4, radius: 0.9 },
          ultimate: { damage: 420, startup: 36, lunge: 1.8, reach: 1.5, radius: 1.1 },
        },
      }),
    },
  },
  {
    id: 'akira', name: 'AKIRA', style: 'Technical spear combat', weapon: 'spear', weaponName: 'Spear', scale: 1,
    palette: { skin: 0xd2a07a, cloth: 0x2c6b57, clothDark: 0x173a30, accent: 0xf2e6c0, hair: 0x7a2a2a, metal: 0xdde4ea, glow: 0x6ff0c0 },
    abilities: ['Piercing Wind', 'Dragon Tempest'],
    ratings: { power: 5, speed: 5, range: 10, defense: 5 },
    blurb: 'Keeps you at the tip of the spear. Once you close the gap, Akira is vulnerable.',
    stats: {
      id: 'akira', name: 'Akira', maxHealth: 1000, walkSpeed: 0.05, backSpeed: 0.04, jump: 1.0, dodgeSpeed: 1.1, // keeps away: quick back-step and sidestep
      attacks: buildAttacks({
        reach: 1.32, lunge: 1.2, damage: 1.1,
        extra: {
          whirl: move({ id: 'whirl', name: 'Spear Whirl', button: 'heavy', startup: 14, active: 5, recovery: 24, damage: 85, hitstun: 28, blockstun: 16, knockback: 0.25, energyGain: 7, lunge: 0.3, reach: 1.9, radius: 0.5, height: 0.9, cancelWindow: 0, shape: 'swing', arc: 220, chain: {}, knockdown: true, hitstop: 6, clip: 'WHIRL', poseSet: 'SWEEP' }),
          polekick: move({ id: 'polekick', name: 'Vault Kick', button: 'kick', startup: 10, active: 3, recovery: 16, damage: 60, hitstun: 24, blockstun: 14, knockback: 0.18, energyGain: 5, lunge: 0.3, reach: 1.6, radius: 0.45, height: 1.0, cancelWindow: 0, chain: {}, knockdown: false, hitstop: 5, clip: 'POLEKICK', poseSet: 'KICK' }),
        },
        overrides: { // spear: forward thrusts are lines, the heavy is a wide sweep
          light1: { shape: 'thrust', reachStart: 0.4 },
          light2: { shape: 'thrust', reachStart: 0.4, chain: { light: 'light3', heavy: 'heavy', kick: 'polekick' } },
          light3: { shape: 'thrust', reachStart: 0.4, reach: 1.7, startup: 8, damage: 62, chain: { heavy: 'whirl' } }, // piercing combo: three thrusts, the last one long
          heavy: { shape: 'swing', arc: 140 },
          sweep: { shape: 'swing', arc: 150, reach: 1.7 },                 // long low sweep
          counter: { shape: 'thrust', reachStart: 0.5, reach: 1.9, lunge: -0.5, damage: 80 }, // retreating spear strike
          grab: { damage: 80, reach: 0.8, startup: 11, recovery: 28 },     // weak and slow: Akira wants space
          // direction moves: thrusts and pole work at the tip of the spear
          dashstrike: { name: 'Lance Step', shape: 'thrust', reachStart: 0.4, lunge: 1.6 },
          rush: { name: 'Charging Lance', shape: 'thrust', reachStart: 0.5, lunge: 2.2 },
          retreatcut: { name: 'Retreating Thrust', shape: 'thrust', reachStart: 0.4, lunge: -0.8 },
          spinslash: { name: 'Windmill', arc: 340 }, axekick: { name: 'Pole Drop' },
          sprintstrike: { name: 'Sprinting Pierce', shape: 'thrust', reachStart: 0.5, lunge: 2.6 },
          special: { reach: 2.1, radius: 0.5, lunge: 3.0, damage: 135, shape: 'thrust', reachStart: 0.6 },
          special_f: { name: 'Piercing Rush', shape: 'thrust', reachStart: 0.6, hits: 3, damage: 36, lunge: 3.0, reach: 2.1, active: 6 },  // a three-hit rush
          special_b: { name: 'Retreating Gale', shape: 'thrust', reachStart: 0.6, lunge: -1.5, reach: 2.3 },
          special_low: { name: 'Serpent Sweep', shape: 'swing', arc: 160, reach: 2.0 },
          ultimate: { reach: 2.3, radius: 0.8, damage: 300, lunge: 3.2, shape: 'thrust', reachStart: 0.6 },
        },
      }),
    },
  },
];

export const getCharacter = (id: string): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
