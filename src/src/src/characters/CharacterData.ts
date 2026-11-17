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
    stats: { id: 'ronin', name: 'Ronin', maxHealth: 1000, walkSpeed: 0.05, backSpeed: 0.036, attacks: buildAttacks({}) },
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
        overrides: {
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
          special: { startup: 22, lunge: 0.9, damage: 190, reach: 1.3, radius: 1.0, recovery: 32 },
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
        overrides: {
          special: { reach: 2.1, radius: 0.5, lunge: 3.0, damage: 135 },
          ultimate: { reach: 2.3, radius: 0.8, damage: 300, lunge: 3.2 },
        },
      }),
    },
  },
];

export const getCharacter = (id: string): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

