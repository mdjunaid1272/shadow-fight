import type { AttackData, CharacterStats } from './types';

/**
 * Fighting styles: a playstyle layered on top of any character, in the spirit of picking a school of fighting.
 *  CLASSIC - the character exactly as designed (no modifiers; the default)
 *  IRON    - armoured bruiser: heavy moves have super armour, a sturdier guard, more health; slower on its feet
 *  WIND    - acrobat: double jump, longer sidestep, strong air attacks; lighter hits, less health
 *  SHADOW  - energy master: fills the shadow meter faster, cheaper shadow arts, long-range and phasing moves; less health
 * Each non-classic style adds four signature moves on the STYLE button (B / STYLE): B, forward + B, back + B, crouch + B.
 * Everything here is data: a style is a stat multiplier set plus a move table, so it can be tuned (and tested) in one place.
 */
export type StyleId = 'classic' | 'iron' | 'wind' | 'shadow';
export const STYLE_IDS: StyleId[] = ['classic', 'iron', 'wind', 'shadow'];

export interface StyleInfo { id: StyleId; name: string; tagline: string; traits: string[] }
export const STYLES: Record<StyleId, StyleInfo> = {
  classic: { id: 'classic', name: 'CLASSIC', tagline: 'The fighter exactly as designed.', traits: ['No modifiers'] },
  iron: { id: 'iron', name: 'IRON', tagline: 'Armoured bruiser. Wades through light hits and breaks guards.', traits: ['Super armour on heavy moves', 'Guard holds 20% longer', '+3% health, slower walking and jabs', 'Heavy hits +6% damage'] },
  wind: { id: 'wind', name: 'WIND', tagline: 'Acrobat. Lives in the air and never stays still.', traits: ['Double jump', 'Longer, safer sidestep', 'Air attacks +12% damage', 'Lighter hits, -2% health'] },
  shadow: { id: 'shadow', name: 'SHADOW', tagline: 'Energy master. Cheap shadow arts and reach no one else has.', traits: ['Shadow energy +50%', 'Shadow arts cost 25% less and hit 12% harder', 'Long-range and phasing moves'] },
};

export const normalizeStyle = (v: unknown): StyleId => (v === 'iron' || v === 'wind' || v === 'shadow' ? v : 'classic');

/** Cost of one style move in shadow energy. */
const STYLE_MOVE_COST = 20;

const mv = (d: AttackData): AttackData => d;

/** The four signature moves of a style. Frame data is authored once; the clips reuse each weapon's own key poses (poseSet). */
function styleMoves(style: Exclude<StyleId, 'classic'>, cost: number): Record<string, AttackData> {
  if (style === 'iron') return {
    iron_a: mv({ id: 'iron_a', name: 'Iron Fist', button: 'style', startup: 20, active: 5, recovery: 28, damage: 115, hitstun: 32, blockstun: 20, knockback: 0.3, energyGain: 6, lunge: 0.5, reach: 1.35, radius: 0.65, height: 1.3, cancelWindow: 0, guardDamage: 45, armor: true, chain: {}, knockdown: true, hitstop: 9, clip: 'IRON_A', poseSet: 'HEAVY', cost }),
    iron_b: mv({ id: 'iron_b', name: 'Siege Charge', button: 'style', startup: 22, active: 6, recovery: 30, damage: 100, hitstun: 30, blockstun: 20, knockback: 0.3, energyGain: 6, lunge: 2.4, reach: 1.3, radius: 0.7, height: 1.2, cancelWindow: 0, guardDamage: 35, armor: true, chain: {}, knockdown: true, hitstop: 8, clip: 'IRON_B', poseSet: 'HEAVY', cost }),
    iron_c: mv({ id: 'iron_c', name: 'Bulwark Strike', button: 'style', startup: 12, active: 4, recovery: 22, damage: 80, hitstun: 28, blockstun: 16, knockback: 0.35, energyGain: 5, lunge: -0.6, reach: 1.4, radius: 0.6, height: 1.3, cancelWindow: 0, chain: {}, knockdown: false, hitstop: 6, clip: 'IRON_C', poseSet: 'LIGHT2', cost }),
    iron_d: mv({ id: 'iron_d', name: 'Stonebreaker', button: 'style', startup: 20, active: 5, recovery: 30, damage: 100, hitstun: 30, blockstun: 18, knockback: 0.25, energyGain: 6, lunge: 0.4, reach: 1.4, radius: 0.6, height: 0.25, cancelWindow: 0, level: 'low', guardDamage: 30, chain: {}, knockdown: true, hitstop: 8, clip: 'IRON_D', poseSet: 'SWEEP', cost }),
  };
  if (style === 'wind') return {
    wind_a: mv({ id: 'wind_a', name: 'Gale Kick', button: 'style', startup: 11, active: 4, recovery: 18, damage: 65, hitstun: 24, blockstun: 14, knockback: 0.2, energyGain: 5, lunge: 0.6, reach: 1.4, radius: 0.45, height: 0.95, cancelWindow: 0, chain: {}, knockdown: false, hitstop: 5, clip: 'WIND_A', poseSet: 'FLIPKICK', cost }),
    wind_b: mv({ id: 'wind_b', name: 'Cyclone Dash', button: 'style', startup: 14, active: 6, recovery: 22, damage: 38, hitstun: 24, blockstun: 14, knockback: 0.2, energyGain: 5, lunge: 2.4, reach: 1.3, radius: 0.55, height: 1.1, cancelWindow: 0, shape: 'swing', arc: 260, hits: 2, chain: {}, knockdown: false, hitstop: 4, clip: 'WIND_B', poseSet: 'SPINSLASH', cost }),
    wind_c: mv({ id: 'wind_c', name: 'Feather Flip', button: 'style', startup: 10, active: 4, recovery: 20, damage: 55, hitstun: 22, blockstun: 14, knockback: 0.3, energyGain: 4, lunge: -1.5, reach: 1.3, radius: 0.5, height: 1.0, cancelWindow: 0, chain: {}, knockdown: false, hitstop: 5, clip: 'WIND_C', poseSet: 'FLIPKICK', cost }),
    wind_d: mv({ id: 'wind_d', name: 'Tempest Sweep', button: 'style', startup: 12, active: 5, recovery: 24, damage: 70, hitstun: 26, blockstun: 16, knockback: 0.2, energyGain: 5, lunge: 0.2, reach: 1.5, radius: 0.5, height: 0.25, cancelWindow: 0, level: 'low', shape: 'swing', arc: 280, chain: {}, knockdown: true, hitstop: 6, clip: 'WIND_D', poseSet: 'SPINKICK', cost }),
  };
  return {
    shadow_a: mv({ id: 'shadow_a', name: 'Shadow Bolt', button: 'style', startup: 16, active: 4, recovery: 26, damage: 85, hitstun: 24, blockstun: 14, knockback: 0.2, energyGain: 5, lunge: 0, reach: 3.4, radius: 0.45, height: 1.2, cancelWindow: 0, shape: 'thrust', reachStart: 0.8, chain: {}, knockdown: false, hitstop: 5, clip: 'SHADOW_A', poseSet: 'SPECIAL', cost }),
    shadow_b: mv({ id: 'shadow_b', name: 'Phase Rush', button: 'style', startup: 15, active: 5, recovery: 24, damage: 80, hitstun: 26, blockstun: 16, knockback: 0.25, energyGain: 5, lunge: 3.2, reach: 1.2, radius: 0.6, height: 1.2, cancelWindow: 0, phase: true, chain: {}, knockdown: true, hitstop: 6, clip: 'SHADOW_B', poseSet: 'SPECIAL', cost }),
    shadow_c: mv({ id: 'shadow_c', name: 'Dark Wave', button: 'style', startup: 14, active: 6, recovery: 26, damage: 70, hitstun: 26, blockstun: 16, knockback: 0.25, energyGain: 5, lunge: -1.0, reach: 2.2, radius: 0.6, height: 1.2, cancelWindow: 0, shape: 'swing', arc: 200, chain: {}, knockdown: true, hitstop: 6, clip: 'SHADOW_C', poseSet: 'HEAVY', cost }),
    shadow_d: mv({ id: 'shadow_d', name: 'Umbral Ripple', button: 'style', startup: 18, active: 6, recovery: 28, damage: 75, hitstun: 26, blockstun: 16, knockback: 0.2, energyGain: 5, lunge: 0, reach: 3.0, radius: 0.45, height: 0.25, cancelWindow: 0, level: 'low', shape: 'thrust', reachStart: 0.6, chain: {}, knockdown: true, hitstop: 6, clip: 'SHADOW_D', poseSet: 'SWEEP', cost }),
  };
}

const isLightish = (a: AttackData) => (a.button === 'light' || a.button === 'kick') && !a.cost && !a.grab && !a.air;
const isHeavyish = (a: AttackData) => a.button === 'heavy' && !a.cost && !a.grab && !a.air;
const scale = (n: number, k: number) => Math.round(n * k);

/** Return the character's stats with a fighting style applied (CLASSIC returns them unchanged apart from the style tag). */
export function applyStyle(base: CharacterStats, style: StyleId): CharacterStats {
  if (style === 'classic') return { ...base, style: 'classic' };
  const attacks: Record<string, AttackData> = {};
  for (const [id, a0] of Object.entries(base.attacks)) {
    const a: AttackData = { ...a0, chain: { ...a0.chain } };
    if (style === 'iron') {
      if (isHeavyish(a)) { a.damage = scale(a.damage, 1.06); a.hitstop += 1; }
      if (['heavy', 'rush'].includes(id)) a.armor = true;
      if (isLightish(a) && id !== 'counter') a.startup += 2; // the price of the armour: slightly slower jabs
    } else if (style === 'wind') {
      if (isLightish(a) || isHeavyish(a)) a.damage = scale(a.damage, 0.93);
      if (a.air) { a.damage = scale(a.damage, 1.12); if (a.landLag) a.landLag = Math.max(4, a.landLag - 3); }
    } else if (style === 'shadow') {
      if (a.cost && a.cost < 100) { a.cost = scale(a.cost, 0.75); a.damage = scale(a.damage, 1.12); }
    }
    attacks[id] = a;
  }
  Object.assign(attacks, styleMoves(style, style === 'shadow' ? Math.round(STYLE_MOVE_COST * 0.75) : STYLE_MOVE_COST));
  const out: CharacterStats = { ...base, style, attacks };
  if (style === 'iron') Object.assign(out, { maxHealth: scale(base.maxHealth, 1.03), walkSpeed: base.walkSpeed * 0.9, backSpeed: base.backSpeed * 0.9, jump: (base.jump ?? 1) * 0.95, dodgeSpeed: (base.dodgeSpeed ?? 1) * 0.9, guardResist: 0.8 });
  if (style === 'wind') Object.assign(out, { maxHealth: scale(base.maxHealth, 0.98), walkSpeed: base.walkSpeed * 1.04, backSpeed: base.backSpeed * 1.06, jump: (base.jump ?? 1) * 1.1, dodgeSpeed: (base.dodgeSpeed ?? 1) * 1.2, doubleJump: true, dodgeBonus: 4 });
  if (style === 'shadow') Object.assign(out, { energyMult: 1.5 });
  return out;
}

/** The style an AI fighter uses when an encounter does not name one: it follows how that opponent fights. */
export function styleForOpponent(characterId: string, behavior: string): StyleId {
  if (behavior === 'BOSS') return ({ ronin: 'shadow', shinobi: 'wind', titan: 'iron', akira: 'shadow' } as Record<string, StyleId>)[characterId] ?? 'classic'; // each boss has a style
  if (behavior === 'AGGRESSIVE') return 'wind';
  if (behavior === 'DEFENSIVE') return 'iron';
  if (behavior === 'TECHNICAL') return 'shadow';
  return ({ ronin: 'classic', shinobi: 'wind', titan: 'iron', akira: 'shadow' } as Record<string, StyleId>)[characterId] ?? 'classic';
}
