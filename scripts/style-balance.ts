// Fighting-style balance: AI mirror matches between every pair of styles, both sides, several seeds.
// usage: npx tsx scripts/style-balance.ts [seedsPerPair]
import { EnemyAI } from '../src/ai/EnemyAI';
import { CHARACTERS } from '../src/characters/CharacterData';
import { CombatManager } from '../src/combat/CombatManager';
import { Fighter } from '../src/combat/Fighter';
import { applyStyle, STYLE_IDS, type StyleId } from '../src/combat/Styles';

const bounds = { x: 7.2, z: 2.4 };
export function styleShares(seeds = 2): { share: Record<string, number>; games: number; byChar: Record<string, Record<string, number>> } {
  const score: Record<string, number> = {}, games: Record<string, number> = {}, byChar: Record<string, Record<string, number>> = {};
  for (const s of STYLE_IDS) { score[s] = 0; games[s] = 0; }
  const cs: Record<string, Record<string, number>> = {}, cg: Record<string, Record<string, number>> = {};
  for (let i = 0; i < STYLE_IDS.length; i++) for (let j = i + 1; j < STYLE_IDS.length; j++) for (const c of CHARACTERS) for (const swap of [false, true]) for (let k = 1; k <= seeds; k++) {
    const sa: StyleId = swap ? STYLE_IDS[j] : STYLE_IDS[i], sb: StyleId = swap ? STYLE_IDS[i] : STYLE_IDS[j];
    const a = new Fighter(applyStyle(c.stats, sa), bounds), b = new Fighter(applyStyle(c.stats, sb), bounds); a.reset(-0.9, 0, 1); b.reset(0.9, 0, -1);
    const cm = new CombatManager([a, b]); const A = new EnemyAI('HARD', 'BALANCED', k * 11, c.id), B = new EnemyAI('HARD', 'BALANCED', k * 17 + 3, c.id); let ko = false; cm.events.on('ko', () => { ko = true; });
    for (let f = 0; f < 3600 && !ko; f++) cm.step([A.think(a, b), B.think(b, a)]);
    const fa = a.health / a.stats.maxHealth, fb = b.health / b.stats.maxHealth, w = Math.abs(fa - fb) < 0.02 ? 0.5 : fa > fb ? 1 : 0;
    score[sa] += w; score[sb] += 1 - w; games[sa]++; games[sb]++;
    for (const [s, v] of [[sa, w], [sb, 1 - w]] as const) { (cs[c.id] ??= {})[s] = ((cs[c.id] ??= {})[s] ?? 0) + v; (cg[c.id] ??= {})[s] = ((cg[c.id] ??= {})[s] ?? 0) + 1; }
  }
  const share: Record<string, number> = {}; for (const s of STYLE_IDS) share[s] = score[s] / games[s];
  for (const id of Object.keys(cs)) { byChar[id] = {}; for (const s of Object.keys(cs[id])) byChar[id][s] = cs[id][s] / cg[id][s]; }
  return { share, games: games.classic, byChar };
}
if (process.argv[1]?.includes('style-balance')) {
  const r = styleShares(Number(process.argv[2] ?? 2));
  console.log(`style win share over ${r.games} matches each: ` + STYLE_IDS.map((s) => `${s} ${(100 * r.share[s]).toFixed(0)}%`).join('  '));
  for (const [id, m] of Object.entries(r.byChar)) console.log(`  ${id.padEnd(8)} ` + STYLE_IDS.map((s) => `${s} ${(100 * m[s]).toFixed(0)}%`).join('  '));
}
