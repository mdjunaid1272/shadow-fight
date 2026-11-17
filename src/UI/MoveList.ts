import type { CharacterDef } from '../characters/CharacterData';
import type { AttackData, Button } from '../combat/types';

/** Keyboard input for each move (touch buttons carry the same names). */
export const MOVE_INPUTS: Record<string, string> = {
  light1: 'J', light2: 'J, J', light3: 'J, J, J', light4: 'J, J, J, J',
  kick: 'L', heavy: 'K', lowkick: 'C + L', sweep: 'C + K', launcher: 'C + J',
  grab: 'G', counter: 'after a PARRY: J / K',
  airlight: 'jump, J', airheavy: 'jump, K', airkick: 'jump, L',
  special: 'U', ultimate: 'I',
};
const MOVE_NAMES: Record<string, string> = {
  light1: 'Light 1', light2: 'Light 2', light3: 'Light 3', light4: 'Light 4', kick: 'Kick', heavy: 'Heavy', lowkick: 'Low Kick', sweep: 'Sweep',
  launcher: 'Launcher', grab: 'Throw', counter: 'Counter', airlight: 'Air Light', airheavy: 'Air Heavy', airkick: 'Air Kick', special: 'Special', ultimate: 'Ultimate',
};
const KEY: Record<Button, string> = { light: 'J', heavy: 'K', kick: 'L', special: 'U', ultimate: 'I', grab: 'G' };

/** Frame advantage when the attack is BLOCKED: the defender's blockstun minus the attacker's remaining frames after contact. */
export function onBlockAdvantage(a: AttackData): number { return a.blockstun - (a.active - 1 + a.recovery); }
/** Frame advantage on HIT (same idea with hitstun). Launchers / knockdowns are reported as 'KD'. */
export function onHitAdvantage(a: AttackData): number | 'KD' { return a.knockdown || a.launch ? 'KD' : a.hitstun - (a.active - 1 + a.recovery); }

export interface ComboRoute { inputs: string; moves: string[]; damage: number }

/**
 * Every combo route of a character, generated from the chain data (which is acyclic), so the list can never disagree with
 * the real game. Damage includes the 10%-per-hit combo scaling. Launcher routes show the juggle follow-ups too.
 */
export function comboRoutes(def: CharacterDef, maxLen = 5): ComboRoute[] {
  const A = def.stats.attacks, routes: ComboRoute[] = [];
  const starters = ['light1', 'kick', 'heavy', 'launcher', 'lowkick'];
  const walk = (id: string, path: string[], inputs: string[]) => {
    const next = Object.entries(A[id].chain);
    if (path.length >= 2 || (path.length === 1 && next.length === 0 && false)) routes.push(make(path, inputs));
    if (path.length >= maxLen) return;
    for (const [btn, to] of next) if (A[to as string]) walk(to as string, [...path, to as string], [...inputs, KEY[btn as Button]]);
  };
  const make = (path: string[], inputs: string[]): ComboRoute => {
    let dmg = 0; path.forEach((id, i) => { dmg += A[id].damage * Math.max(0.4, 1 - 0.1 * i); });
    const start = A[path[0]];
    const first = path[0] === 'launcher' ? 'C+J' : path[0] === 'lowkick' ? 'C+L' : KEY[start.button];
    return { inputs: [first, ...inputs.slice(1)].join(' > '), moves: path, damage: Math.round(dmg) };
  };
  for (const s of starters) if (A[s]) walk(s, [s], [KEY[A[s].button]]);
  // keep the routes players actually use: the longest per starter plus the biggest damage ones
  const unique = new Map<string, ComboRoute>(); for (const r of routes) unique.set(r.inputs, r);
  return [...unique.values()].sort((x, y) => y.damage - x.damage).slice(0, 10);
}

const adv = (n: number | 'KD'): string => (n === 'KD' ? 'KD' : n > 0 ? `+${n}` : String(n));

/** HTML for the move-list overlay: inputs, frame data (startup / active / recovery), damage, height and frame advantage. */
export function buildMoveList(def: CharacterDef): string {
  const A = def.stats.attacks;
  const order = ['light1', 'light2', 'light3', 'light4', 'kick', 'heavy', 'lowkick', 'sweep', 'launcher', 'grab', 'counter', 'airlight', 'airheavy', 'airkick', 'special', 'ultimate'];
  const rows = order.filter((id) => A[id] && !(id === 'light4' && !A.light3?.chain.light) && !(id === 'light3' && !A.light2?.chain.light)).map((id) => {
    const a = A[id];
    return `<tr><td>${MOVE_NAMES[id]}</td><td>${MOVE_INPUTS[id]}</td><td>${(a.level ?? 'mid').toUpperCase()}</td><td>${a.startup}/${a.active}/${a.recovery}</td><td>${a.damage}</td><td>${a.grab ? '-' : adv(onBlockAdvantage(a))}</td><td>${a.grab ? '-' : adv(onHitAdvantage(a))}</td></tr>`;
  }).join('');
  const combos = comboRoutes(def).map((r) => `<li><b>${r.inputs}</b> <span>${r.damage} dmg</span></li>`).join('');
  return `<h2>${def.name} - MOVES</h2>
<table class="moves"><thead><tr><th>MOVE</th><th>INPUT</th><th>HIT</th><th>S/A/R</th><th>DMG</th><th>BLOCK</th><th>HIT</th></tr></thead><tbody>${rows}</tbody></table>
<h3>COMBOS</h3><ul class="combos">${combos}</ul>
<p class="note">S/A/R = startup / active / recovery frames (60 per second). BLOCK/HIT = frame advantage (+ you act first). HIT: HIGH moves are ducked by crouching (C), LOW moves need a crouching guard. Hold BACK to block; tap it as an attack lands to PARRY. KD = knockdown / launch.</p>`;
}
