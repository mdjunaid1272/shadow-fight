import { buildAttacks } from '../combat/AttackData';
import type { CharacterStats } from '../combat/types';

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
        overrides: {
          light1: { shape: 'swing', arc: 70 }, light2: { shape: 'swing', arc: 80 }, heavy: { shape: 'swing', arc: 120 },
          light3: { shape: 'swing', arc: 95, damage: 60 },                 // rising finisher of the 3-hit chain
          sweep: { shape: 'swing', arc: 130 },                             // low blade sweep
          counter: { shape: 'swing', arc: 100, reach: 1.35, damage: 95 },  // defensive counter slash after a parry
          special: { shape: 'swing', arc: 50 }, ultimate: { shape: 'swing', arc: 170 },
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
      id: 'shinobi', name: 'Shinobi', maxHealth: 900, walkSpeed: 0.064, backSpeed: 0.048,
      attacks: buildAttacks({
        startupAdd: -1, recoveryAdd: -2, damage: 0.75, reach: 0.88, lunge: 1.1,
        overrides: { // daggers: short, fast, narrow arcs
          // four-hit flurry: every dagger strike is fast, the chain keeps going
          light1: { shape: 'swing', arc: 50 },
          light2: { shape: 'swing', arc: 50, chain: { light: 'light3', kick: 'kick', heavy: 'heavy' } },
          light3: { shape: 'swing', arc: 55, damage: 34, startup: 5, recovery: 12, chain: { light: 'light4', kick: 'kick' } },
          light4: { shape: 'swing', arc: 70, damage: 44, startup: 6, recovery: 18, knockback: 0.16 },
          counter: { shape: 'swing', arc: 70, reach: 1.15, lunge: 1.7, damage: 72, knockdown: false, recovery: 14 }, // evasive counter: slips past and cuts
          grab: { damage: 80, startup: 8, recovery: 20 },                  // quick, light throw
          airkick: { damage: 40, recovery: 7 },
          special: { startup: 11, lunge: 3.6, damage: 105, recovery: 22, reach: 1.3 },
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
      id: 'titan', name: 'Titan', maxHealth: 1150, walkSpeed: 0.04, backSpeed: 0.03,
      attacks: buildAttacks({
        startupAdd: 2, recoveryAdd: 3, damage: 1.3, reach: 0.95, hitstopAdd: 1,
        overrides: {
          light2: { chain: { heavy: 'heavy', kick: 'kick' } },             // jab-cross only: no third light, the heavy follows instead
          heavy: { guardDamage: 48 },                                      // armour-breaking blow: wrecks a guard in two hits
          counter: { damage: 120, guardDamage: 40, recovery: 20 },         // crushing counter
          grab: { damage: 150, reach: 1.0, startup: 9, recovery: 28 },     // the strongest throw
          launcher: { damage: 80, launch: 0.19 },
          special: { startup: 22, lunge: 0.9, damage: 190, reach: 1.3, radius: 1.0, recovery: 32, guardDamage: 70 },
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
      id: 'akira', name: 'Akira', maxHealth: 1000, walkSpeed: 0.05, backSpeed: 0.038,
      attacks: buildAttacks({
        reach: 1.32, lunge: 1.2, damage: 1.1,
        overrides: { // spear: forward thrusts are lines, the heavy is a wide sweep
          light1: { shape: 'thrust', reachStart: 0.4 }, light2: { shape: 'thrust', reachStart: 0.4 },
          light3: { shape: 'thrust', reachStart: 0.4, reach: 1.7, startup: 8, damage: 62 }, // piercing combo: three thrusts, the last one long
          heavy: { shape: 'swing', arc: 140 },
          sweep: { shape: 'swing', arc: 150, reach: 1.7 },                 // long low sweep
          counter: { shape: 'thrust', reachStart: 0.5, reach: 1.9, lunge: -0.5, damage: 80 }, // retreating spear strike
          grab: { damage: 80, reach: 0.8, startup: 11, recovery: 28 },     // weak and slow: Akira wants space
          special: { reach: 2.1, radius: 0.5, lunge: 3.0, damage: 135, shape: 'thrust', reachStart: 0.6 },
          ultimate: { reach: 2.3, radius: 0.8, damage: 300, lunge: 3.2, shape: 'thrust', reachStart: 0.6 },
        },
      }),
    },
  },
];

export const getCharacter = (id: string): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

