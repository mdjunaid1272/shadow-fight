import type { Palette, WeaponKind } from '../characters/CharacterData';
import { dayKey } from './Missions';
import type { CosmeticSlot, Profile } from './Profile';

/**
 * Store catalogue + pure purchase/equip logic.
 * Everything sold here is COSMETIC (colours, effects) except character unlocks,
 * which are also earnable by playing - nothing changes combat stats, so no pay-to-win.
 */
export type StoreCategory = 'characters' | 'weapons' | 'armor' | 'skins' | 'effects' | 'daily';

export interface StoreItem {
  id: string;
  category: Exclude<StoreCategory, 'daily'>;
  name: string;
  desc: string;
  price: { gold?: number; gems?: number };
  /** Restrict to one character (undefined = fits everyone). */
  character?: string;
  palette?: Partial<Palette>;
  /** Item that unlocks a character instead of cosmetics. */
  unlocksCharacter?: string;
  /** Not sold: granted by a story reward key. */
  reward?: string;
}

const slotOf = (cat: StoreItem['category']): CosmeticSlot | null =>
  cat === 'skins' ? 'skin' : cat === 'armor' ? 'armor' : cat === 'weapons' ? 'weaponSkin' : cat === 'effects' ? 'vfx' : null;
export const slotFor = slotOf;

const g = (gold: number) => ({ gold });
const gm = (gems: number) => ({ gems });

export const ITEMS: StoreItem[] = [
  { id: 'char_titan', category: 'characters', name: 'Titan', desc: 'Unlock the heavy gauntlet brawler now (or win 2 matches).', price: g(1500), unlocksCharacter: 'titan' },
  { id: 'char_akira', category: 'characters', name: 'Akira', desc: 'Unlock the spear master now (or win 5 matches).', price: g(2500), unlocksCharacter: 'akira' },

  { id: 'skin_ronin_ember', category: 'skins', name: 'Ember Ronin', desc: 'Scorched crimson robes.', price: g(600), character: 'ronin', palette: { cloth: 0x7a2216, clothDark: 0x3a1008, accent: 0xffb43a } },
  { id: 'skin_ronin_ghost', category: 'skins', name: 'Ghost Ronin', desc: 'Pale spirit garb.', price: gm(40), character: 'ronin', palette: { cloth: 0xd8dde8, clothDark: 0x8890a8, accent: 0x2f7bff, glow: 0x6fb4ff } },
  { id: 'skin_ronin_royal', category: 'skins', name: 'Royal Ronin', desc: 'Story reward: defeat the first boss.', price: {}, character: 'ronin', reward: 'story_boss_1', palette: { cloth: 0x1a1a40, clothDark: 0x0c0c24, accent: 0xffd700, glow: 0xffd700 } },
  { id: 'skin_shinobi_crimson', category: 'skins', name: 'Crimson Shinobi', desc: 'Blood-red night suit.', price: g(600), character: 'shinobi', palette: { cloth: 0x5a1424, clothDark: 0x24060c, accent: 0xff4a68, glow: 0xff4a68 } },
  { id: 'skin_shinobi_frost', category: 'skins', name: 'Frost Shinobi', desc: 'Icy blue and silver.', price: gm(40), character: 'shinobi', palette: { cloth: 0x3a5a7a, clothDark: 0x1c2e40, accent: 0x6fe0ff, glow: 0x6fe0ff } },
  { id: 'skin_titan_obsidian', category: 'skins', name: 'Obsidian Titan', desc: 'Volcanic black armour.', price: g(700), character: 'titan', palette: { cloth: 0x2a2a30, clothDark: 0x121216, accent: 0xff5a1a, glow: 0xff5a1a } },
  { id: 'skin_titan_jade', category: 'skins', name: 'Jade Titan', desc: 'Carved green stone.', price: gm(40), character: 'titan', palette: { cloth: 0x3a6a4a, clothDark: 0x1c3a28, accent: 0xe8d8a0, glow: 0x6ff0a0 } },
  { id: 'skin_akira_dusk', category: 'skins', name: 'Dusk Akira', desc: 'Twilight violet.', price: g(700), character: 'akira', palette: { cloth: 0x5a3a7a, clothDark: 0x2c1c40, accent: 0xffd27a, glow: 0xc090ff } },
  { id: 'skin_akira_gold', category: 'skins', name: 'Golden Akira', desc: 'Gilded dragon-guard.', price: gm(50), character: 'akira', palette: { cloth: 0x8a6a1a, clothDark: 0x4a3808, accent: 0xfff2b0, glow: 0xffd24a } },
  { id: 'skin_shadow', category: 'skins', name: 'Shadow Cloak', desc: 'Story reward: clear the whole Story. Fits everyone.', price: {}, reward: 'story_clear', palette: { cloth: 0x14121c, clothDark: 0x0a0810, accent: 0x8a4bff, glow: 0xb06bff, skin: 0x8a7a90 } },

  { id: 'armor_iron', category: 'armor', name: 'Iron Plate', desc: 'Dull steel trim.', price: g(400), palette: { clothDark: 0x3a3f4a, accent: 0xb8c0d0 } },
  { id: 'armor_bloodsteel', category: 'armor', name: 'Bloodsteel', desc: 'Dark red lacquer.', price: g(500), palette: { clothDark: 0x2a0a10, accent: 0xd4143a } },
  { id: 'armor_gilded', category: 'armor', name: 'Gilded Guard', desc: 'Gold-trimmed plate.', price: gm(30), palette: { clothDark: 0x4a3a12, accent: 0xffd700 } },

  { id: 'ws_ember', category: 'weapons', name: 'Emberforged', desc: 'Weapon glows like cooling iron.', price: g(500), palette: { metal: 0xe8a070, glow: 0xff6a20 } },
  { id: 'ws_frost', category: 'weapons', name: 'Frostedge', desc: 'Pale blue ice steel.', price: g(500), palette: { metal: 0xcfe8ff, glow: 0x6fe0ff } },
  { id: 'ws_void', category: 'weapons', name: 'Voidsteel', desc: 'Weapon bleeds violet shadow.', price: gm(35), palette: { metal: 0x6a5a8a, glow: 0xb06bff } },
  { id: 'ws_gold', category: 'weapons', name: 'Goldcore', desc: 'Story reward: defeat the second boss.', price: {}, reward: 'story_boss_2', palette: { metal: 0xe8d080, glow: 0xffd700 } },

  { id: 'fx_crimson', category: 'effects', name: 'Crimson Sparks', desc: 'Red impact sparks and trails.', price: g(300), palette: { glow: 0xff3050 } },
  { id: 'fx_azure', category: 'effects', name: 'Azure Sparks', desc: 'Blue impact sparks and trails.', price: g(300), palette: { glow: 0x4aa0ff } },
  { id: 'fx_emerald', category: 'effects', name: 'Emerald Sparks', desc: 'Green impact sparks and trails.', price: g(300), palette: { glow: 0x3aff9a } },
  { id: 'fx_solar', category: 'effects', name: 'Solar Sparks', desc: 'Golden impact sparks and trails.', price: g(400), palette: { glow: 0xffc040 } },
  { id: 'fx_violet', category: 'effects', name: 'Violet Sparks', desc: 'Shadow-purple sparks and trails.', price: gm(20), palette: { glow: 0xc060ff } },
];

export const itemById = (id: string): StoreItem | undefined => ITEMS.find((i) => i.id === id);
export const owns = (p: Profile, id: string): boolean => p.inventory.includes(id);
export const isPurchasable = (i: StoreItem): boolean => !i.reward && (i.price.gold !== undefined || i.price.gems !== undefined);

// ---------------------------------------------------------------- daily offers
const DISCOUNT = 0.7;
function seededIndexes(seed: string, n: number, count: number): number[] {
  let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const pool = Array.from({ length: n }, (_, i) => i), out: number[] = [];
  while (out.length < count && pool.length) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; out.push(pool.splice((h >>> 0) % pool.length, 1)[0]); }
  return out;
}
/** Three rotating offers (30% off) drawn from items the player does not own yet. */
export function dailyOffers(p: Profile, now = Date.now()): StoreItem[] {
  const pool = ITEMS.filter((i) => isPurchasable(i) && i.category !== 'characters' && !owns(p, i.id));
  return seededIndexes('offers' + dayKey(now), pool.length, 3).map((i) => pool[i]);
}
export function priceOf(p: Profile, item: StoreItem, now = Date.now()): { gold?: number; gems?: number } {
  const off = dailyOffers(p, now).some((o) => o.id === item.id);
  const f = (v?: number) => (v === undefined ? undefined : off ? Math.max(1, Math.round(v * DISCOUNT)) : v);
  return { gold: f(item.price.gold), gems: f(item.price.gems) };
}

// ---------------------------------------------------------------- buy / equip
export function buyItem(p: Profile, id: string, now = Date.now()): { ok: boolean; reason?: string } {
  const item = itemById(id);
  if (!item) return { ok: false, reason: 'Unknown item' };
  if (owns(p, id)) return { ok: false, reason: 'Already owned' };
  if (!isPurchasable(item)) return { ok: false, reason: 'Story reward - cannot be bought' };
  const price = priceOf(p, item, now);
  if (price.gold !== undefined && p.gold < price.gold) return { ok: false, reason: 'Not enough gold' };
  if (price.gems !== undefined && p.gems < price.gems) return { ok: false, reason: 'Not enough gems' };
  p.gold -= price.gold ?? 0; p.gems -= price.gems ?? 0;
  p.inventory.push(id);
  return { ok: true };
}

export function fitsCharacter(item: StoreItem, charId: string): boolean { return !item.character || item.character === charId; }

/** Equip (or, if already equipped, unequip) a cosmetic for a character. */
export function toggleEquip(p: Profile, charId: string, id: string): { ok: boolean; equipped?: boolean; reason?: string } {
  const item = itemById(id);
  if (!item) return { ok: false, reason: 'Unknown item' };
  const slot = slotOf(item.category);
  if (!slot) return { ok: false, reason: 'Not equippable' };
  if (!owns(p, id)) return { ok: false, reason: 'Not owned' };
  if (!fitsCharacter(item, charId)) return { ok: false, reason: `Only fits ${item.character?.toUpperCase()}` };
  const eq = (p.equipped[charId] ??= {});
  if (eq[slot] === id) { delete eq[slot]; return { ok: true, equipped: false }; }
  eq[slot] = id; return { ok: true, equipped: true };
}

export function isEquipped(p: Profile, charId: string, id: string): boolean {
  const item = itemById(id); const slot = item && slotOf(item.category);
  return !!slot && p.equipped[charId]?.[slot] === id;
}

/** Grant any items tied to a story reward key. Returns the items granted. */
export function grantReward(p: Profile, key: string): StoreItem[] {
  const items = ITEMS.filter((i) => i.reward === key && !owns(p, i.id));
  for (const i of items) p.inventory.push(i.id);
  return items;
}

/** Resolve the palette a character is drawn with: base + skin + armor + weapon skin + effects colour. */
export function resolvePalette(p: Profile, charId: string, base: Palette, preview?: StoreItem): Palette {
  const out: Palette = { ...base };
  const eq = p.equipped[charId] ?? {};
  for (const slot of ['skin', 'armor', 'weaponSkin', 'vfx'] as CosmeticSlot[]) {
    const item = preview && slotOf(preview.category) === slot ? preview : eq[slot] ? itemById(eq[slot]!) : undefined;
    if (item?.palette && fitsCharacter(item, charId)) Object.assign(out, item.palette);
  }
  return out;
}

// ---------------------------------------------------------------- cosmetic weapon tiers
export const MAX_WEAPON_TIER = 5;
export const weaponUpgradeCost = (tier: number): number => 250 * tier * tier;
/** Visual glow multiplier. Purely cosmetic - never touches damage, speed or reach. */
export const glowBoost = (tier: number): number => 1 + 0.3 * (Math.max(1, tier) - 1);
export function upgradeWeapon(p: Profile, kind: WeaponKind): { ok: boolean; reason?: string } {
  const tier = p.weaponTier[kind] ?? 1;
  if (tier >= MAX_WEAPON_TIER) return { ok: false, reason: 'Max tier' };
  const cost = weaponUpgradeCost(tier);
  if (p.gold < cost) return { ok: false, reason: 'Not enough gold' };
  p.gold -= cost; p.weaponTier[kind] = tier + 1; return { ok: true };
}
