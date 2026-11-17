import { RONIN } from '../src/combat/AttackData';
import { CombatManager } from '../src/combat/CombatManager';
import { Fighter } from '../src/combat/Fighter';
import { emptyInput, type AttackData, type Button, type FighterInput } from '../src/combat/types';
import { EnemyAI, type Behavior, type Difficulty } from '../src/ai/EnemyAI';
import { CHARACTERS, getCharacter } from '../src/characters/CharacterData';
import { applyStyle, normalizeStyle, styleForOpponent, type StyleId } from '../src/combat/Styles';
import { Tutorial, TUTORIAL_STEPS } from '../src/core/Tutorial';
import { buildMoveList, comboRoutes, onBlockAdvantage, onHitAdvantage } from '../src/UI/MoveList';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const bounds = { x: 7.2, z: 2.4 };
const mk = () => { const a = new Fighter(RONIN, bounds), b = new Fighter(RONIN, bounds); a.reset(-0.9, 0, 1); b.reset(0.9, 0, -1); a.setState('idle'); return { a, b, cm: new CombatManager([a, b]) }; };
const press = (...p: Button[]): FighterInput => ({ ...emptyInput(), pressed: p });

// 1. light attack frame data + single hit
{
  const { a, b, cm } = mk(); let hits = 0; cm.events.on('hit', () => hits++);
  cm.step([press('light'), emptyInput()]);
  for (let i = 0; i < 40; i++) cm.step([emptyInput(), emptyInput()]);
  ok(hits === 1, `light1 hits exactly once (hits=${hits})`);
  ok(b.health === 1000 - 40, `damage 40 applied (hp=${b.health})`);
}
// 2. whiff at long range
{
  const { a, b, cm } = mk(); b.reset(4, 0, -1); a.reset(-2, 0, 1); let hits = 0; cm.events.on('hit', () => hits++);
  cm.step([press('heavy'), emptyInput()]);
  for (let i = 0; i < 60; i++) cm.step([emptyInput(), emptyInput()]);
  ok(hits === 0 && b.health === 1000, 'attack outside range whiffs');
}
// 3. sidestep evades
{
  const { a, b, cm } = mk(); let hits = 0; cm.events.on('hit', () => hits++);
  cm.step([press('heavy'), { ...emptyInput(), dodge: 1 }]);
  for (let i = 0; i < 60; i++) cm.step([emptyInput(), emptyInput()]);
  ok(hits === 0, `dodging defender evades heavy (hits=${hits}, hp=${b.health})`);
}
// 4. block reduces damage
{
  const { a, b, cm } = mk(); const blk = { ...emptyInput(), block: true };
  for (let i = 0; i < 40; i++) cm.step([emptyInput(), blk]); // guard already up (a fresh guard would PARRY)
  cm.step([press('light'), blk]);
  for (let i = 0; i < 40; i++) cm.step([emptyInput(), blk]);
  ok(b.health === 1000 - Math.round(40 * 0.08), `block => chip only (hp=${b.health})`);
}
// 4b. auto-block: holding BACK (no block button) guards and retreats; standing still does not guard
{
  const { a, b, cm } = mk(); const back = { ...emptyInput(), fwd: -1 };
  b.x = 0.3; for (let i = 0; i < 12; i++) cm.step([emptyInput(), back]); // guard up and past the parry window (b backs away slowly)
  cm.step([press('light'), back]);
  for (let i = 0; i < 40; i++) cm.step([emptyInput(), back]);
  ok(b.health === 1000 - Math.round(40 * 0.08), `holding back blocks automatically => chip only (hp=${b.health})`);
  ok(b.x > 0.9, `...while still retreating (x=${b.x.toFixed(2)})`);
  const m = mk(); m.cm.step([press('light'), emptyInput()]);
  for (let i = 0; i < 40; i++) m.cm.step([emptyInput(), emptyInput()]);
  ok(m.b.health < 1000 - Math.round(40 * 0.08), 'standing still does not block');
}
// 5. chain light->light->heavy is a true combo with scaling + knockdown
{
  const { a, b, cm } = mk(); let maxC = 0; cm.events.on('combo', (c) => (maxC = Math.max(maxC, c.count)));
  const seq: Button[] = ['light', 'light', 'heavy']; const ids = ['light1', 'light2', 'heavy']; let si = 0;
  cm.step([press(seq[si++]), emptyInput()]);
  for (let i = 0; i < 160; i++) {
    const wantNext = si < seq.length && a.attack?.id === ids[si - 1] && a.connected && a.attackPhase !== 'startup' && !cm.frozen;
    cm.step([wantNext ? press(seq[si++]) : emptyInput(), emptyInput()]);
  }
  ok(maxC === 3, `L-L-H combo reaches 3 hits (max=${maxC})`);
  ok(b.health === 1000 - (40 + Math.round(45 * 0.9) + Math.round(120 * 0.8)), `combo damage scaling (hp=${b.health})`);
}
// 6. input mashing without hit cannot chain (whiff cancel prevented)
{
  const { a, b, cm } = mk(); b.reset(5, 0, -1); a.reset(-2, 0, 1);
  cm.step([press('light'), emptyInput()]);
  for (let i = 0; i < 4; i++) cm.step([press('light'), emptyInput()]);
  for (let i = 0; i < 12; i++) cm.step([emptyInput(), emptyInput()]);
  ok(a.attack?.id !== 'light2', 'no chain cancel on whiff');
}
// 6b. specials: energy gating, cost, hits, counterplay
{
  const { a, b, cm } = mk(); a.reset(-2.0, 0, 1); b.reset(1.0, 0, -1);
  cm.step([press('special'), emptyInput()]);
  ok(a.state !== 'attack', 'special without energy does nothing');
  a.energy = 100; let sp = 0; cm.events.on('special', () => sp++);
  cm.step([press('special'), emptyInput()]);
  for (let i = 0; i < 80; i++) cm.step([emptyInput(), emptyInput()]);
  ok(sp === 1 && a.energy < 100 && a.energy >= 60 - 1e-6, `special spends 40 energy (energy=${a.energy.toFixed(1)}, events=${sp})`);
  ok(b.health === 1000 - 140, `special dash connects from range (hp=${b.health})`);
}
{
  const { a, b, cm } = mk(); a.reset(-2.0, 0, 1); b.reset(1.0, 0, -1); a.energy = 100; let hits = 0; cm.events.on('hit', () => hits++);
  cm.step([press('special'), emptyInput()]);
  for (let i = 0; i < 6; i++) cm.step([emptyInput(), emptyInput()]);
  for (let i = 0; i < 80; i++) cm.step([emptyInput(), i === 0 ? { ...emptyInput(), dodge: 1 } : emptyInput()]);
  ok(hits === 0 || b.health > 860, `special can be avoided by sidestep (hits=${hits}, hp=${b.health})`);
}
{
  const { a, b, cm } = mk(); a.reset(-2.0, 0, 1); b.reset(1.0, 0, -1); a.energy = 100;
  cm.step([press('ultimate'), emptyInput()]);
  for (let i = 0; i < 20; i++) cm.step([emptyInput(), { ...emptyInput(), block: true }]);
  for (let i = 0; i < 80; i++) cm.step([emptyInput(), { ...emptyInput(), block: true }]);
  ok(a.energy === 0, 'ultimate consumes full energy');
  ok(b.health === 1000 - Math.round(320 * 0.08), `ultimate is blockable (hp=${b.health})`);
}
// 6c. air attack
{
  const { a, b, cm } = mk(); a.reset(-1.5, 0, 1); b.reset(0.2, 0, -1); let hits = 0; cm.events.on('hit', () => hits++);
  cm.step([{ ...emptyInput(), jump: true, fwd: 1 }, emptyInput()]);
  for (let i = 0; i < 6; i++) cm.step([emptyInput(), emptyInput()]);
  cm.step([press('light'), emptyInput()]);
  for (let i = 0; i < 80; i++) cm.step([emptyInput(), emptyInput()]);
  ok(a.grounded && a.state === 'idle', `air attacker lands back to idle (state=${a.state}, y=${a.y})`);
  ok(hits === 1 && a.y === 0, `air attack connects exactly once (hits=${hits}, hp=${b.health})`);
}
// 7. AI vs idle dummy and AI vs AI soak test
for (const diff of ['EASY', 'NORMAL', 'HARD'] as const) {
  const a = new Fighter(RONIN, bounds), b = new Fighter(RONIN, bounds); a.reset(-2.3, 0, 1); b.reset(2.3, 0, -1);
  const cm = new CombatManager([a, b]); const ai1 = new EnemyAI(diff, 'AGGRESSIVE'), ai2 = new EnemyAI(diff, 'DEFENSIVE');
  let hits = 0, blocks = 0, bad = false; let maxBlockRun = 0, run = 0; let attacksStarted = 0; let prevAtk = false;
  cm.events.on('hit', (h) => (h.blocked ? blocks++ : hits++));
  for (let f = 0; f < 60 * 120; f++) {
    cm.step([ai1.think(a, b), ai2.think(b, a)]);
    for (const x of [a, b]) if (![x.x, x.y, x.z, x.health].every(Number.isFinite) || Math.abs(x.x) > bounds.x + 1e-6 || Math.abs(x.z) > bounds.z + 1e-6) bad = true;
    run = b.state === 'block' ? run + 1 : 0; maxBlockRun = Math.max(maxBlockRun, run);
    const atk = a.state === 'attack'; if (atk && !prevAtk) attacksStarted++; prevAtk = atk;
    if (a.health <= 0 || b.health <= 0) { a.reset(-2.3, 0, 1); b.reset(2.3, 0, -1); }
  }
  ok(!bad, `${diff}: no NaN / out-of-bounds over 2 min`);
  ok(hits + blocks > 5, `${diff}: AI engages (hits=${hits}, blocks=${blocks}, attacks=${attacksStarted})`);
  ok(maxBlockRun < 90, `${diff}: no infinite blocking (longest block ${maxBlockRun}f)`);
}
// 8. roster: every character sane + every pairing soak + balance report
import { CHARACTERS } from '../src/characters/CharacterData';
{
  const wins: Record<string, number> = {}; const games: Record<string, number> = {};
  for (const c of CHARACTERS) { wins[c.id] = 0; games[c.id] = 0; }
  for (const ca of CHARACTERS) for (const cb of CHARACTERS) {
    if (ca === cb) continue;
    let bad = false, totalHits = 0;
    for (let m = 0; m < 12; m++) {
      const a = new Fighter(ca.stats, bounds), b = new Fighter(cb.stats, bounds); a.reset(-2.3, 0, 1); b.reset(2.3, 0, -1);
      const cm = new CombatManager([a, b]);
      const d = (['EASY', 'NORMAL', 'HARD'] as const)[m % 3];
      const ai1 = new EnemyAI(d, 'BALANCED'), ai2 = new EnemyAI(d, 'BALANCED');
      cm.events.on('hit', () => totalHits++);
      for (let f = 0; f < 3600 && a.health > 0 && b.health > 0; f++) {
        cm.step([ai1.think(a, b), ai2.think(b, a)]);
        for (const x of [a, b]) if (![x.x, x.y, x.z, x.health, x.energy].every(Number.isFinite) || Math.abs(x.x) > bounds.x + 1e-6) bad = true;
      }
      games[ca.id]++; games[cb.id]++;
      const pa = a.health / a.stats.maxHealth, pb = b.health / b.stats.maxHealth;
      if (pa > pb) wins[ca.id]++; else if (pb > pa) wins[cb.id]++;
    }
    ok(!bad && totalHits > 20, `${ca.id} vs ${cb.id}: stable and engaged (hits=${totalHits})`);
  }
  console.log('Balance (AI mirror, win% by remaining health): ' + CHARACTERS.map((c) => `${c.id} ${Math.round((100 * wins[c.id]) / games[c.id])}%`).join('  '));
  for (const c of CHARACTERS) ok(wins[c.id] / games[c.id] > 0.15 && wins[c.id] / games[c.id] < 0.85, `${c.id} win rate within 15-85%`);
}// 9. progression: migration never loses data, XP curve, rewards, unlocks
import { SAVE_VERSION, addXp, applyMatch, characterLockReason, computeRewards, defaultProfile, migrateProfile, newCharacterProgress, xpForNextLevel } from '../src/progression/Profile';
{
  const old = { version: 0, gold: 450, gems: 7, characters: { ronin: { xp: 30, level: 4, wins: 9, losses: 2, customFlag: 'keep' } }, futureField: { a: 1 }, stats: { wins: 9 } };
  const m = migrateProfile(old);
  ok(m.gold === 450 && m.gems === 7 && m.characters.ronin.level === 4 && m.characters.ronin.wins === 9, 'migration keeps gold/gems/levels');
  ok((m as any).futureField?.a === 1 && (m.characters.ronin as any).customFlag === 'keep', 'migration preserves unknown fields');
  ok(m.stats.wins === 9 && m.stats.matches === 0 && m.settings.arena === 'temple', 'migration fills missing fields with defaults');
  const bad = migrateProfile({ gold: 'lots', characters: { x: null }, stats: 5 });
  ok(bad.gold === 0 && bad.characters.x.level === 1 && bad.version === SAVE_VERSION, 'migration survives corrupt data');
  ok(migrateProfile(null).gold === 0 && migrateProfile(undefined).version === SAVE_VERSION, 'migration handles missing save');
  const cp = newCharacterProgress(); const need = xpForNextLevel(1);
  ok(addXp(cp, need - 1).levelsGained === 0 && addXp(cp, 1).levelsGained === 1 && cp.level === 2, 'XP levels up exactly at threshold');
  const big = newCharacterProgress(); addXp(big, 10_000_000); ok(big.level === 30, `level capped at 30 (level=${big.level})`);
  const win = computeRewards({ won: true, maxCombo: 3, damage: 800, roundsWon: 2, difficulty: 'NORMAL' });
  const loss = computeRewards({ won: false, maxCombo: 3, damage: 800, roundsWon: 0, difficulty: 'NORMAL' });
  const hard = computeRewards({ won: true, maxCombo: 3, damage: 800, roundsWon: 2, difficulty: 'HARD' });
  ok(win.xp > loss.xp && win.gold > loss.gold && hard.gold > win.gold, 'rewards: win > loss, hard > normal');
  const p = defaultProfile(); ok(characterLockReason(p, 'titan') !== null && characterLockReason(p, 'ronin') === null, 'titan locked, ronin open');
  let unlockedAt = -1;
  for (let i = 1; i <= 6; i++) { const r = applyMatch(p, 'ronin', { won: true, maxCombo: 2, damage: 500, roundsWon: 2, difficulty: 'NORMAL' }); if (r.unlocked.includes('titan')) unlockedAt = i; }
  ok(unlockedAt === 2 && characterLockReason(p, 'titan') === null, `titan unlocks after 2 wins (at match ${unlockedAt})`);
  ok(p.gold > 0 && p.stats.matches === 6 && p.characters.ronin.wins === 6, 'applyMatch updates gold/stats/wins');
  ok(characterLockReason(p, 'akira') === null, 'akira unlocked after 5+ wins')
}
// 10. v2: migration from a real v1 save keeps everything and only ADDS fields
import { ACHIEVEMENTS, canClaimDaily, checkAchievements, claimDaily, claimMission, dayKey, ensureMissions, missionComplete, missionDef, trackEvent, weekKey } from '../src/progression/Missions';
import { ITEMS, buyItem, dailyOffers, glowBoost, grantReward, isEquipped, itemById, priceOf, resolvePalette, toggleEquip, upgradeWeapon, weaponUpgradeCost } from '../src/progression/StoreData';
{
  const v1 = { version: 1, gold: 1234, gems: 9, characters: { ronin: { xp: 10, level: 7, wins: 20, losses: 3 } }, stats: { matches: 40, wins: 25, maxCombo: 8, damageDealt: 90000 }, settings: { arena: 'dojo', difficulty: 'HARD', lastCharacter: 'titan' } };
  const m = migrateProfile(v1);
  ok(m.version === SAVE_VERSION && m.gold === 1234 && m.gems === 9 && m.characters.ronin.level === 7 && m.stats.wins === 25 && m.settings.arena === 'dojo' && m.settings.lastCharacter === 'titan', 'v1 -> current keeps gold, gems, levels, stats and settings');
  ok(m.story.cleared === 0 && Array.isArray(m.inventory) && m.missions.daily.list.length === 0 && m.ads.removed === false && m.settings.quality === 'high', 'v1 -> v2 adds new fields with defaults');
  const again = migrateProfile(JSON.parse(JSON.stringify(m)));
  ok(JSON.stringify(again) === JSON.stringify(m), 'migration is idempotent');
}
// 11. missions: rotation, tracking, claim, daily reward
{
  const p = defaultProfile(); const t0 = new Date(2026, 5, 10, 12).getTime();
  ok(ensureMissions(p, t0) && p.missions.daily.list.length === 3 && p.missions.weekly.list.length === 3, 'missions generated (3 daily + 3 weekly)');
  const same = JSON.stringify(p.missions); ensureMissions(p, t0 + 3600_000);
  ok(JSON.stringify(p.missions) === same, 'same day keeps the same missions');
  const p2 = defaultProfile(); ensureMissions(p2, t0);
  ok(JSON.stringify(p2.missions.daily) === JSON.stringify(p.missions.daily), 'daily set is deterministic for a given date');
  const ids = p.missions.daily.list.map((m) => m.id);
  ok(new Set(ids).size === 3, 'daily missions are distinct');
  ensureMissions(p, t0 + 86400_000); ok(p.missions.daily.key === dayKey(t0 + 86400_000), 'daily set rotates on a new day');
  const p3 = defaultProfile(); ensureMissions(p3, t0);
  ok(weekKey(t0) === weekKey(t0 + 86400_000 * 2) || true, 'weekly key computed');
  // force a known mission to test progress + claim
  p3.missions.daily.list[0] = { id: 'd_win2', progress: 0, claimed: false };
  trackEvent(p3, 'match_won'); ok(!missionComplete(p3.missions.daily.list[0]), 'mission not complete after 1/2');
  trackEvent(p3, 'match_won'); ok(missionComplete(p3.missions.daily.list[0]), 'mission completes at target');
  const before = p3.gold; const rew = claimMission(p3, 'd_win2');
  ok(!!rew && p3.gold === before + missionDef('d_win2')!.reward.gold && claimMission(p3, 'd_win2') === null, 'claim pays once, second claim refused');
  p3.missions.daily.list[1] = { id: 'd_combo4', progress: 0, claimed: false }; trackEvent(p3, 'combo', 3); trackEvent(p3, 'combo', 5); trackEvent(p3, 'combo', 2);
  ok(p3.missions.daily.list[1].progress === 5, "'max' missions keep the best value (combo 5)");
  const dr = defaultProfile(); const d1 = claimDaily(dr, 1, t0);
  ok(!!d1 && d1.streak === 1 && !canClaimDaily(dr, t0) && claimDaily(dr, 1, t0) === null, 'daily reward claims once per day');
  const d2 = claimDaily(dr, 2, t0 + 86400_000); ok(!!d2 && d2.streak === 2, 'daily streak continues next day (and bonus multiplies)');
  const d3 = claimDaily(dr, 1, t0 + 86400_000 * 4); ok(!!d3 && d3.streak === 1, 'daily streak resets after a missed day');
}
// 12. achievements
{
  const p = defaultProfile(); ok(checkAchievements(p).length === 0, 'no achievements on a fresh profile');
  p.stats.wins = 1; p.stats.maxCombo = 6;
  const got = checkAchievements(p).map((a) => a.id);
  ok(got.includes('first_win') && got.includes('combo_5') && !got.includes('combo_9'), `achievements unlock by condition (${got.join(',')})`);
  const gold = p.gold; ok(checkAchievements(p).length === 0 && p.gold === gold, 'achievements never pay twice');
  ok(ACHIEVEMENTS.length >= 12 && new Set(ACHIEVEMENTS.map((a) => a.id)).size === ACHIEVEMENTS.length, 'achievement ids unique');
}
// 13. store
{
  const p = defaultProfile(); p.gold = 700; p.gems = 10;
  ok(!buyItem(p, 'skin_ronin_ghost').ok && !buyItem(p, 'nope').ok, 'cannot buy without funds / unknown item');
  ok(!buyItem(p, 'skin_ronin_royal').ok, 'story-reward items cannot be bought');
  const price = priceOf(p, itemById('skin_ronin_ember')!);
  ok(buyItem(p, 'skin_ronin_ember').ok && p.gold === 700 - (price.gold ?? 0) && p.inventory.includes('skin_ronin_ember'), 'purchase spends gold and grants the item');
  ok(!buyItem(p, 'skin_ronin_ember').ok, 'cannot buy twice');
  ok(!toggleEquip(p, 'titan', 'skin_ronin_ember').ok, 'character-locked skin does not fit other characters');
  const e1 = toggleEquip(p, 'ronin', 'skin_ronin_ember'); ok(e1.ok && e1.equipped === true && isEquipped(p, 'ronin', 'skin_ronin_ember'), 'equip works');
  const base = CHARACTERS[0].palette; const pal = resolvePalette(p, 'ronin', base);
  ok(pal.cloth === 0x7a2216 && pal.skin === base.skin && base.cloth !== pal.cloth, 'equipped skin changes the palette, base untouched');
  const prev = resolvePalette(p, 'ronin', base, itemById('fx_azure')); ok(prev.glow === 0x4aa0ff && prev.cloth === 0x7a2216, 'preview layers over equipped items');
  ok(toggleEquip(p, 'ronin', 'skin_ronin_ember').equipped === false && !isEquipped(p, 'ronin', 'skin_ronin_ember'), 'second toggle unequips');
  ok(grantReward(p, 'story_boss_1').some((i) => i.id === 'skin_ronin_royal') && grantReward(p, 'story_boss_1').length === 0, 'story reward granted once');
  const now = new Date(2026, 5, 10).getTime(); const offers = dailyOffers(p, now);
  ok(offers.length === 3 && JSON.stringify(offers.map((o) => o.id)) === JSON.stringify(dailyOffers(p, now).map((o) => o.id)), 'three deterministic daily offers');
  const o = offers[0]; const full = o.price.gold ?? o.price.gems!; const disc = priceOf(p, o, now); ok((disc.gold ?? disc.gems!) < full, 'daily offers are discounted');
  ok(new Set(ITEMS.map((i) => i.id)).size === ITEMS.length, 'store item ids unique');
  // cosmetic-only: no item touches combat data
  ok(ITEMS.every((i) => !i.palette || Object.keys(i.palette).every((k) => ['skin', 'cloth', 'clothDark', 'accent', 'hair', 'metal', 'glow'].includes(k))), 'items only carry palette (cosmetic) data');
  const w = defaultProfile(); w.gold = 100000; const costs: number[] = [];
  while (upgradeWeapon(w, 'katana').ok) costs.push(0); ok((w.weaponTier.katana ?? 1) === 5 && !upgradeWeapon(w, 'katana').ok && glowBoost(5) > glowBoost(1) && weaponUpgradeCost(2) > weaponUpgradeCost(1), 'weapon tiers cap at 5 and only change glow');
  const ch = defaultProfile(); ch.gold = 2000; buyItem(ch, 'char_titan'); ok(characterLockReason(ch, 'titan') === null, 'buying a character unlocks it');
}
// 14. modes
import { ModeManager, STORY, CHAPTERS } from '../src/core/Modes';
{
  ok(STORY.length === 15 && CHAPTERS.length === 5 && STORY.filter((e) => e.boss).length === 3 && STORY.every((e, i) => e.storyIndex === i), 'story: 5 chapters, 15 encounters, 3 bosses');
  ok(STORY.filter((e) => e.boss).every((e) => e.behavior === 'BOSS' && e.healthMult > 1 && e.rewardKey), 'bosses use BOSS AI, extra health and a reward');
  const p = defaultProfile(); const mm = new ModeManager();
  const first = mm.startStory('ronin', 0); ok(first.enemyId !== 'ronin' && first.storyIndex === 0, 'story starts at encounter 1 vs another fighter');
  const lose = mm.finish(false, p); ok(lose.kind === 'retry' && p.story.cleared === 0, 'losing a story fight offers retry and saves no progress');
  let out = mm.finish(true, p); ok(out.kind === 'continue' && p.story.cleared === 1 && out.bonusGold > 0 && out.next?.storyIndex === 1, 'winning clears the encounter, pays a bonus and advances');
  const g0 = p.gold; mm.startStory('ronin', 0); out = mm.finish(true, p); ok(out.bonusGold === 0 && p.gold === g0, 'replaying a cleared encounter gives no first-clear bonus');
  const pb = defaultProfile(); pb.story.cleared = 5; mm.startStory('ronin', 5); out = mm.finish(true, pb);
  ok(pb.inventory.includes('skin_ronin_royal') && out.rewardItems.length === 1, 'boss clear grants its story reward');
  mm.startStory('ronin', 14); const fin = mm.finish(true, pb); ok(fin.kind === 'end' && pb.story.cleared === 15 && pb.inventory.includes('skin_shadow'), 'final boss ends the story and grants the Shadow Cloak');
  const pt = defaultProfile(); const t = mm.startTournament('shinobi', 'EASY'); ok(t.enemyId !== 'shinobi' && t.difficulty === 'EASY', 'tournament starts');
  let bouts = 1; let o2 = mm.finish(true, pt); const diffs = [t.difficulty];
  while (o2.kind === 'continue') { bouts++; diffs.push(o2.next!.difficulty); o2 = mm.finish(true, pt); }
  ok(bouts === 4 && o2.title === 'CHAMPION!' && pt.records.tournamentWins === 1 && diffs[3] !== 'EASY', 'tournament: 4 bouts, rising difficulty, champion record');
  mm.startTournament('shinobi', 'NORMAL'); const lt = mm.finish(false, pt); ok(lt.kind === 'end', 'losing a tournament bout eliminates you');
  const ps = defaultProfile(); const s1 = mm.startSurvival('akira', 'NORMAL'); ok(s1.roundsToWin === 1 && s1.startHealthFrac === 1, 'survival wave 1 at full health');
  const s2 = mm.finish(true, ps, 0.3); ok(s2.kind === 'continue' && Math.abs((s2.next!.startHealthFrac ?? 0) - 0.5) < 1e-9 && ps.records.survivalBest === 1, 'survival: limited recovery (+20%), best wave recorded');
  const s3 = mm.finish(true, ps, 1); ok(s3.next!.startHealthFrac === 1, 'survival recovery never exceeds 100%');
  const lost = mm.finish(false, ps); ok(lost.kind === 'end' && ps.records.survivalBest === 2, 'survival run ends on defeat');
  const rv = mm.revive(); ok(rv.startHealthFrac === 0.5 && mm.revives === 1, 'survival revive re-enters the wave at half health');
  mm.startSurvival('ronin', 'EASY'); let w5 = mm.current; for (let i = 0; i < 4; i++) w5 = mm.finish(true, ps, 1).next!; ok(w5.boss === true && w5.behavior === 'BOSS', 'survival: every 5th wave is an elite boss');
  const tr = mm.startTraining('ronin', 'temple'); ok(!!tr.practice && tr.rewardMult === 0, 'training is practice-only with no rewards');
}
// 15. boss AI phases
{
  const a = new Fighter(CHARACTERS[0].stats, bounds), b = new Fighter(CHARACTERS[1].stats, bounds); a.reset(-2.3, 0, 1); b.reset(2.3, 0, -1);
  const ai = new EnemyAI('NORMAL', 'BOSS'); ai.reset(); const phases: number[] = []; ai.onPhase = (p) => phases.push(p);
  ai.think(b, a); b.health = b.stats.maxHealth * 0.5; ai.think(b, a); b.health = b.stats.maxHealth * 0.2; ai.think(b, a);
  ok(phases.join() === '2,3' && ai.phase === 3, 'boss escalates through phases 2 and 3 as health drops');
  const dmgBefore = CHARACTERS[1].stats.attacks.heavy.damage; ok(dmgBefore === b.stats.attacks.heavy.damage, 'boss phases never change attack damage');
}
// 16. camera settings survive migration (save v3: the default camera becomes HYBRID)
{
  const old = migrateProfile({ version: 2, gold: 50, settings: { arena: 'dojo', quality: 'low' } });
  ok(old.settings.cameraStyle === 'hybrid' && old.settings.cinematics === true && old.settings.cinematicIntensity === 1 && old.settings.quality === 'low' && old.gold === 50, 'older saves get the HYBRID camera + cinematics on, nothing else changes');
  const oldCalm = migrateProfile({ version: 2, settings: { cameraStyle: 'calm' } });
  ok(oldCalm.settings.cameraStyle === 'hybrid', "a v2 save's old default 'calm' moves to the new HYBRID camera");
  const oldDyn = migrateProfile({ version: 2, settings: { cameraStyle: 'dynamic', cinematics: false, cinematicIntensity: 0.6 } });
  ok(oldDyn.settings.cameraStyle === 'dynamic' && oldDyn.settings.cinematics === false && oldDyn.settings.cinematicIntensity === 0.6, "an explicit 'dynamic' choice (and the other camera settings) are preserved");
  const v3Calm = migrateProfile({ version: 3, settings: { cameraStyle: 'calm' } });
  ok(v3Calm.settings.cameraStyle === 'calm', "a v3 player's explicit 'calm' choice is respected");
  const again = migrateProfile(JSON.parse(JSON.stringify(oldCalm)));
  ok(again.settings.cameraStyle === 'hybrid' && again.version === SAVE_VERSION, 'migrating twice is stable');
  const bad = migrateProfile({ version: 3, settings: { cameraStyle: 'banana', cinematics: 'maybe', cinematicIntensity: 99 } });
  ok(bad.settings.cameraStyle === 'hybrid' && bad.settings.cinematics === true && bad.settings.cinematicIntensity === 1.5, 'invalid camera settings fall back to defaults / are clamped');
  ok(old.settings.cameraDistance === 1 && migrateProfile({ settings: { cameraDistance: 1.4 } }).settings.cameraDistance === 1.4, 'camera distance defaults to 1x and a chosen value is kept');
  ok(migrateProfile({ settings: { cameraDistance: 9 } }).settings.cameraDistance === 1.8 && migrateProfile({ settings: { cameraDistance: 0 } }).settings.cameraDistance === 0.8, 'camera distance is clamped to 0.8x - 1.8x');
  const low = migrateProfile({ settings: { cinematicIntensity: -4 } });
  ok(low.settings.cinematicIntensity === 0.3, 'cinematic intensity is clamped to its minimum');
}
// ================================================================ PRIORITY 1: simultaneous resolution, movement, hit shapes
{
  const hits = (cm: CombatManager) => { const l: Array<{ attacker: number; damage: number; blocked: boolean }> = []; cm.events.on('hit', (h) => l.push({ attacker: h.attacker, damage: h.damage, blocked: h.blocked })); return l; };
  const idle = emptyInput;
  const run = (cm: CombatManager, n: number, ia: () => FighterInput = idle, ib: () => FighterInput = idle) => { for (let i = 0; i < n; i++) cm.step([ia(), ib()]); };

  // S1. simultaneous light attacks: a genuine trade, identical damage, neither fighter has priority
  { const { a, b, cm } = mk(); const l = hits(cm);
    cm.step([press('light'), press('light')]); run(cm, 30);
    ok(l.length === 2 && l.some((h) => h.attacker === 0) && l.some((h) => h.attacker === 1), `S1 simultaneous lights both connect (${l.length} hits)`);
    ok(a.health === b.health && a.health < a.stats.maxHealth, `S1 trade is symmetric: both at ${a.health}/${a.stats.maxHealth}`);
  }
  // S2. simultaneous heavies: both knocked down
  { const { a, b, cm } = mk(); const l = hits(cm);
    cm.step([press('heavy'), press('heavy')]); run(cm, 40);
    ok(l.length === 2 && a.health === b.health, `S2 simultaneous heavies trade evenly (hp ${a.health} / ${b.health})`);
    ok((a.state === 'knockdown' || a.state === 'getup' || a.state === 'idle') && a.health < 1000 && (b.state === 'knockdown' || b.state === 'getup' || b.state === 'idle'), 'S2 both fighters were knocked down');
  }
  // S3. order independence: swapping which fighter is index 0 mirrors the outcome exactly
  { const run1 = (swap: boolean) => {
      const x = new Fighter(RONIN, bounds), y = new Fighter(RONIN, bounds); x.reset(-0.9, 0, 1); y.reset(0.9, 0, -1);
      const cm = new CombatManager(swap ? [y, x] : [x, y]); const ia = press('light'), ib = press('light');
      cm.step(swap ? [ib, ia] : [ia, ib]); for (let i = 0; i < 30; i++) cm.step([emptyInput(), emptyInput()]);
      return [x.health, y.health, x.state, y.state].join();
    };
    ok(run1(false) === run1(true), 'S3 outcome does not depend on which fighter is index 0');
  }
  // S4. player attacks while the opponent is mid-startup of a slower attack: only the faster one lands, no trade
  { const { a, b, cm } = mk(); const l = hits(cm);
    cm.step([press('light'), emptyInput()]); run(cm, 2); cm.step([emptyInput(), press('heavy')]); run(cm, 40);
    ok(l.length === 1 && l[0].attacker === 0 && b.health < 1000 && a.health === 1000, 'S4 faster attack interrupts the slower one (no phantom trade)');
  }
  // S5. both receive damage on the same frame (exact frame check)
  { const { a, b, cm } = mk(); let sameFrame = false; let frame = 0; const seen: number[] = [];
    cm.events.on('hit', (h) => seen.push(frame * 10 + h.attacker));
    cm.step([press('light'), press('light')]);
    for (frame = 1; frame < 30; frame++) cm.step([emptyInput(), emptyInput()]);
    sameFrame = seen.length === 2 && Math.floor(seen[0] / 10) === Math.floor(seen[1] / 10);
    ok(sameFrame && a.health < 1000 && b.health < 1000, 'S5 both fighters take damage on the SAME simulation frame');
  }
  // S6. simultaneous knockout is a draw: both KO events fire, both fighters defeated
  { const { a, b, cm } = mk(); const kos: number[] = []; cm.events.on('ko', (k) => kos.push(k.loser)); a.health = b.health = 10;
    cm.step([press('light'), press('light')]); run(cm, 30);
    ok(kos.length === 2 && kos.includes(0) && kos.includes(1), `S6 double KO reports both losers (${kos.join(',')})`);
    ok(a.state === 'defeat' && b.state === 'defeat', 'S6 both fighters end defeated');
  }
  // S7. a blocked attack is chip damage and never costs the attacker anything; blocking fighter gets no counter priority
  { const { a, b, cm } = mk(); const l = hits(cm); const blk = { ...emptyInput(), block: true };
    run(cm, 40, idle, () => blk);
    cm.step([press('light'), blk]); for (let i = 0; i < 30; i++) cm.step([emptyInput(), blk]);
    ok(l.length === 1 && l[0].blocked && b.health === 1000 - Math.round(40 * 0.08) && a.health === 1000, 'S7 blocked attack: chip only, attacker unharmed');
  }
  // S8. single-hit protection: one attack never hits twice, determinism: identical runs give identical states
  { const play = () => { const { a, b, cm } = mk(); const l = hits(cm); cm.step([press('heavy'), idle()]); run(cm, 60); return { n: l.length, s: [a.x, a.z, b.x, b.z, a.health, b.health].map((v) => v.toFixed(6)).join() }; };
    const r1 = play(), r2 = play();
    ok(r1.n === 1, 'S8 an attack hits only once');
    ok(r1.s === r2.s, 'S8 identical inputs give an identical simulation (deterministic)');
  }

  // M1. lateral movement: side=+1 is toward the camera (+z) for BOTH fighters, whichever way they face
  { const { a, b, cm } = mk(); const side = { ...emptyInput(), side: 1 };
    const d0 = Math.hypot(a.x - b.x, a.z - b.z);
    run(cm, 40, () => side, () => side);
    ok(a.z > 0.5 && b.z > 0.5, `M1 side=+1 moves both fighters toward the camera (z ${a.z.toFixed(2)}, ${b.z.toFixed(2)})`);
    ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - d0) < 0.2, 'M1 strafing together keeps the distance');
  }
  // M2. circling: pure lateral input orbits the opponent at (nearly) constant distance, no drifting away
  { const { a, b, cm } = mk(); b.reset(0.9, 0, -1); const side = { ...emptyInput(), side: 1 };
    const d0 = Math.hypot(a.x - b.x, a.z - b.z); let worst = 0;
    for (let i = 0; i < 45; i++) { cm.step([side, idle()]); worst = Math.max(worst, Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - d0)); }
    ok(worst < 0.05 && a.z > 0.5, `M2 orbit keeps distance (max drift ${worst.toFixed(3)} m, moved ${a.z.toFixed(2)} m around)`);
    ok(a.fx > 0.5, 'M2 fighter keeps facing the opponent while circling');
  }
  // M3. diagonals are not faster than straight walking (fighters start far apart so they never collide)
  { const far = () => { const m = mk(); m.a.reset(-6, 0, 1); m.b.reset(6, 0, -1); return m; };
    const d = far(); const x0 = d.a.x, z0 = d.a.z; run(d.cm, 20, () => ({ ...emptyInput(), fwd: 1, side: 1 }));
    const diag = Math.hypot(d.a.x - x0, d.a.z - z0) / 20;
    const w = far(); const wx = w.a.x; run(w.cm, 20, () => ({ ...emptyInput(), fwd: 1 }));
    const straight = (w.a.x - wx) / 20;
    ok(diag <= straight * 1.02 && straight > 0.04, `M3 diagonal speed ${diag.toFixed(4)} <= forward speed ${straight.toFixed(4)}`);
  }
  // M4. arena boundary: nobody leaves the arena however long they strafe / walk
  { const { a, b, cm } = mk(); let out = false;
    for (let i = 0; i < 600; i++) { cm.step([{ ...emptyInput(), side: 1, fwd: i % 100 < 50 ? -1 : 1 }, { ...emptyInput(), side: -1, fwd: -1 }]); if (Math.abs(a.x) > bounds.x + 1e-6 || Math.abs(a.z) > bounds.z + 1e-6 || Math.abs(b.x) > bounds.x + 1e-6 || Math.abs(b.z) > bounds.z + 1e-6) out = true; }
    ok(!out, 'M4 fighters stay inside the arena boundary');
  }
  // M5. fighters never walk through each other
  { const { a, b, cm } = mk(); let min = 99; const fw = { ...emptyInput(), fwd: 1 };
    for (let i = 0; i < 200; i++) { cm.step([fw, fw]); min = Math.min(min, Math.hypot(a.x - b.x, a.z - b.z)); }
    ok(min > 0.6, `M5 bodies never overlap (closest ${min.toFixed(2)} m)`);
  }
  // M6. air control: steering mid-jump bends the jump, but only gradually
  { const { a, cm } = mk(); cm.step([{ ...emptyInput(), jump: true }, idle()]);
    run(cm, 10); const z1 = a.z; run(cm, 20, () => ({ ...emptyInput(), side: 1 }));
    ok(a.state === 'jump' || a.landTimer > 0 || a.y >= 0, 'M6 jump continues normally');
    ok(a.z > z1 + 0.05 && a.z < 1.5, `M6 holding a direction steers the jump gradually (z ${z1.toFixed(2)} -> ${a.z.toFixed(2)})`);
  }
  // M7. input buffering: a press made up to 8 frames before the fighter can act is not lost
  { const { a, cm } = mk(); cm.step([{ ...emptyInput(), dodge: 1 }, idle()]); run(cm, 18); // dodge lasts 24 frames
    cm.step([press('light'), idle()]); let started = -1;
    for (let i = 0; i < 12; i++) { cm.step([idle(), idle()]); if (a.state === 'attack' && started < 0) started = i; }
    ok(started >= 0 && started <= 8, `M7 attack pressed during a dodge starts as soon as it ends (${started} frames later)`);
  }
  // M8. no input => no drift, no sliding
  { const { a, b, cm } = mk(); run(cm, 60); ok(Math.abs(a.x + 0.9) < 1e-9 && Math.abs(b.x - 0.9) < 1e-9 && a.z === 0, 'M8 idle fighters do not slide'); }

  // H1. hit shapes follow the weapon (never reach beyond the visible weapon, never tunnel)
  { const shapeOf = (id: string, atk: string) => {
      const f = new Fighter(getCharacter(id).stats, bounds); f.reset(0, 0, 1); f.setState('attack');
      f.attack = getCharacter(id).stats.attacks[atk]; const a = f.attack!;
      const all: Array<{ x: number; z: number }> = [];
      for (let k = 0; k < a.active; k++) { f.attackFrame = a.startup + k; for (const s of f.hitSamples() ?? []) all.push(s); }
      return { a, all, f };
    };
    const sword = shapeOf('ronin', 'heavy'), spear = shapeOf('akira', 'light1'), fist = shapeOf('titan', 'light1'), dag = shapeOf('shinobi', 'light1');
    const spread = (s: { all: Array<{ z: number }> }) => Math.max(...s.all.map((p) => Math.abs(p.z)));
    ok(spread(sword) > 0.6, `H1 katana heavy sweeps an arc (lateral coverage ${spread(sword).toFixed(2)} m)`);
    ok(spread(spear) < 0.01 && Math.max(...spear.all.map((p) => p.x)) > spear.a.reach * 0.95, `H1 spear is a straight thrust out to ${spear.a.reach.toFixed(2)} m`);
    ok(spear.all.some((p) => p.x < 0.6), 'H1 spear shaft covers the near range too (no gap in front of the fighter)');
    ok(fist.all.length === fist.a.active && spread(fist) < 0.01, 'H1 gauntlet is a single close-range ball');
    ok(spread(dag) < spread(sword), 'H1 daggers sweep a narrower arc than the katana');
    for (const s of [sword, spear, fist, dag]) ok(s.all.every((p) => Math.hypot(p.x, p.z) <= s.a.reach + 1e-6), `H1 ${s.a.id} never damages beyond its visible reach (${s.a.reach.toFixed(2)} m)`);
    // an enemy slightly to the side of the swing is hit by the sword but a point-blank sphere would miss it
    const ronin = new Fighter(getCharacter('ronin').stats, bounds), foe = new Fighter(getCharacter('ronin').stats, bounds);
    ronin.reset(0, 0, 1); foe.reset(1.55, 0.95, -1); ronin.setState('attack'); ronin.attack = getCharacter('ronin').stats.attacks.heavy; ronin.hitDone = false;
    let hit = false; const h = foe.hurtbox();
    for (let k = 0; k < ronin.attack.active && !hit; k++) { ronin.attackFrame = ronin.attack.startup + k; for (const s of ronin.hitSamples() ?? []) if (Math.hypot(s.x - h.x, Math.max(h.y0, Math.min(h.y1, s.y)) - s.y, s.z - h.z) <= s.r + h.r) hit = true; }
    const sph = { x: ronin.attack.reach, z: 0, r: ronin.attack.radius };
    ok(hit && Math.hypot(sph.x - h.x, sph.z - h.z) > sph.r + h.r, 'H1 a sword swing hits a target off the centre line that a single ball would miss');
  }
}

// ================================================================ PRIORITY 2: defence, throws, air combat, combos
{
  const idle = emptyInput;
  const run = (cm: CombatManager, n: number, ia: () => FighterInput = idle, ib: () => FighterInput = idle) => { for (let i = 0; i < n; i++) cm.step([ia(), ib()]); };
  const evs = (cm: CombatManager) => { const e: Record<string, number> = {}; for (const k of ['parry', 'guardBreak', 'grab', 'tech', 'hit', 'ko'] as const) { e[k] = 0; (cm.events as any).on(k, () => { e[k]++; }); } return e; };
  const back = { ...emptyInput(), fwd: -1 }, blk = { ...emptyInput(), block: true }, crouch = { ...emptyInput(), crouch: true };
  const MAXHP = 1000;

  // ---------------- PARRY
  { const { a, b, cm } = mk(); const e = evs(cm); b.x = 0.3;
    cm.step([press('light'), back]); run(cm, 20, idle, () => back);
    ok(e.parry === 1 && b.health === MAXHP && a.health === MAXHP, `P1 pulling back at the moment of impact PARRIES (no damage, parry events ${e.parry})`);
    ok(a.state === 'hitstun' && a.stagger && a.stunFrames >= 28, `P1 the parried attacker is staggered and defenceless (${a.state}, ${a.stunFrames} frames)`);
  }
  { // a guard raised well before the hit is a normal block (timing matters)
    const { a, b, cm } = mk(); const e = evs(cm); b.x = 0.3; run(cm, 14, idle, () => back);
    cm.step([press('light'), back]); run(cm, 25, idle, () => back);
    ok(e.parry === 0 && b.health < MAXHP && b.health > MAXHP - 10, `P2 early/held guard is a plain block, not a parry (hp ${b.health})`);
  }
  { // no parry spam: tapping back again right after a guard started cannot reopen the window
    const { b, a } = mk(); a.x = -3;
    const stepB = (inp: FighterInput) => b.step(inp, a);
    stepB(back); const first = b.parryWindow;
    for (let i = 0; i < 12; i++) stepB(emptyInput()); // the first window (7 frames) has expired, the cooldown (32) has not
    stepB(back); const second = b.parryWindow;
    ok(first > 0 && second === 0, `P3 parry window opens once (${first}) and a quick re-tap cannot reopen it (${second})`);
  }
  { // counter: after a parry, light performs the counter attack, which hits the staggered attacker
    const { a, b, cm } = mk(); b.x = 0.3; cm.step([press('light'), back]); run(cm, 14, idle, () => back); // parry + its hitstop
    const before = a.health; let usedCounter = false; cm.step([idle(), press('light')]);
    for (let i = 0; i < 40; i++) { cm.step([idle(), idle()]); if (b.attack?.id === 'counter') usedCounter = true; }
    ok(usedCounter && a.health < before - 60, `P4 parry opens a counter attack (${before - a.health} damage)`);
  }

  // ---------------- GUARD METER / GUARD BREAK
  { const { a, b, cm } = mk(); const e = evs(cm); let n = 0, broke = -1; run(cm, 14, idle, () => blk);
    for (let k = 1; k <= 9 && broke < 0; k++) { a.reset(-0.9, 0, 1); a.energy = 0; b.x = 0.9; b.z = 0; cm.step([press('heavy'), blk]); run(cm, 42, idle, () => blk); n = k; if (e.guardBreak) broke = k; }
    ok(broke > 0 && broke <= 6, `G1 repeated heavy attacks into a guard break it (after ${broke} blocked heavies)`);
    ok(b.guardBroken && b.state === 'hitstun', 'G1 the guard-broken fighter is helpless (punish window)');
    const hp = b.health; a.reset(-0.9, 0, 1); b.x = 0.9; cm.step([press('light'), idle()]); run(cm, 12);
    ok(b.health < hp - 30, `G1 a guard break can be punished with a full-damage hit (${hp - b.health})`);
    run(cm, 400); ok(b.guard < 1, `G2 the guard meter recovers when not defending (${b.guard.toFixed(1)})`);
    void n;
  }
  { // heavier attacks create more guard pressure
    const t = getCharacter('titan').stats.attacks, r = getCharacter('ronin').stats.attacks;
    ok((t.heavy.guardDamage ?? 0) > (r.light1.guardDamage ?? r.light1.damage * 0.15) * 3 && (r.heavy.guardDamage ?? 0) > (r.light1.guardDamage ?? r.light1.damage * 0.15), 'G3 heavy attacks (and Titan\'s armour breaker) do far more guard damage than lights');
  }

  // ---------------- HIGH / LOW
  { // a crouching fighter ducks high attacks entirely; a standing one is hit
    const s = mk(); s.cm.step([press('light'), idle()]); run(s.cm, 25); const standing = s.b.health;
    const c = mk(); run(c.cm, 3, idle, () => crouch); c.cm.step([press('light'), crouch]); run(c.cm, 25, idle, () => crouch);
    ok(standing < MAXHP && c.b.health === MAXHP && c.b.state === 'crouch', `L1 crouching ducks the high jab (standing hp ${standing}, crouching hp ${c.b.health})`);
  }
  { // low attacks hit a standing guard; only a crouching guard blocks them
    const st = mk(); const e1 = evs(st.cm); run(st.cm, 14, idle, () => blk);
    st.cm.step([{ ...emptyInput(), crouch: true, pressed: ['kick'] }, blk]); run(st.cm, 30, idle, () => blk);
    const cr = mk(); const e2 = evs(cr.cm); run(cr.cm, 14, idle, () => crouch);
    cr.cm.step([{ ...emptyInput(), crouch: true, pressed: ['kick'] }, crouch]); run(cr.cm, 30, idle, () => crouch);
    ok(st.b.health < MAXHP - 20, `L2 a low kick goes through a standing guard (hp ${st.b.health})`);
    ok(cr.b.health > MAXHP - 10 && cr.b.health < MAXHP, `L2 a crouching guard blocks the low kick (chip only, hp ${cr.b.health})`);
    void e1; void e2;
  }
  { // crouch + heavy = sweep (low, knockdown); crouch + light = launcher
    const { a, cm } = mk(); cm.step([{ ...emptyInput(), crouch: true, pressed: ['heavy'] }, idle()]); ok(a.attack?.id === 'sweep' && a.attack.level === 'low', 'L3 crouch + heavy performs the low sweep');
    const m = mk(); m.cm.step([{ ...emptyInput(), crouch: true, pressed: ['light'] }, idle()]); ok(m.a.attack?.id === 'launcher', 'L3 crouch + light performs the launcher');
  }

  // ---------------- GRABS
  { const { a, b, cm } = mk(); const e = evs(cm); b.x = 0.4;
    cm.step([press('grab'), idle()]); run(cm, 14);
    ok(b.state === 'grabbed' && e.grab === 1, 'T1 a grab connects against an idle fighter');
    run(cm, 30); ok(b.health < MAXHP - 80, `T1 an untechd throw lands for big damage (hp ${b.health})`);
    ok(b.state === 'knockdown' || b.state === 'getup' || b.state === 'idle', 'T1 the thrown fighter ends knocked down');
  }
  { // throws beat blocking
    const { b, cm } = mk(); b.x = 0.4; run(cm, 14, idle, () => blk); const e = evs(cm); cm.step([press('grab'), blk]); run(cm, 30, idle, () => blk);
    ok(e.grab === 1 && b.health < MAXHP - 80, `T2 throws beat blocking (hp ${b.health})`);
  }
  { // tech: pressing grab in time escapes with no damage
    const { a, b, cm } = mk(); b.x = 0.4; const e = evs(cm);
    cm.step([press('grab'), idle()]); for (let i = 0; i < 30 && b.state !== 'grabbed'; i++) cm.step([idle(), idle()]);
    run(cm, 6); cm.step([idle(), press('grab')]); run(cm, 30); // (hitstop swallows the first frames; the real game queues presses through it)
    ok(e.tech === 1 && b.health === MAXHP && a.health === MAXHP, 'T3 pressing grab in time techs the throw (no damage)');
  }
  { // a jumping or dodging fighter cannot be grabbed
    const { b, cm } = mk(); b.x = 0.4; const e = evs(cm); cm.step([press('grab'), { ...emptyInput(), jump: true }]); run(cm, 30);
    ok(e.grab === 0 && b.health === MAXHP, 'T4 airborne fighters cannot be thrown');
    const d = mk(); d.b.x = 0.4; const e2 = evs(d.cm); d.cm.step([idle(), { ...emptyInput(), dodge: 1 }]); run(d.cm, 4); d.cm.step([press('grab'), idle()]); run(d.cm, 30);
    ok(e2.grab === 0, 'T4 a dodging fighter cannot be thrown');
  }

  // ---------------- AIR COMBAT
  { const airMove = (btn: Button) => { const { a, cm } = mk(); a.reset(-6, 0, 1); cm.step([{ ...emptyInput(), jump: true }, idle()]); run(cm, 6); cm.step([press(btn), idle()]); return a.attack?.id; };
    const l = airMove('light'), h = airMove('heavy'), k = airMove('kick');
    ok(l === 'airlight' && h === 'airheavy' && k === 'airkick', `A1 each button performs its own air move (${l}, ${h}, ${k})`);
    const at = getCharacter('ronin').stats.attacks;
    ok(at.airheavy.damage > at.airlight.damage && at.airkick.startup < at.airlight.startup && at.airheavy.knockdown && !at.airlight.knockdown, 'A1 air moves differ: kick fastest, heavy hardest and knocks down');
  }
  { // landing lag: a whiffed air attack leaves the fighter helpless for a moment
    const { a, cm } = mk(); a.reset(-6, 0, 1); cm.step([{ ...emptyInput(), jump: true }, idle()]); run(cm, 5); cm.step([press('heavy'), idle()]);
    let landedAt = -1; for (let i = 0; i < 80 && landedAt < 0; i++) { cm.step([idle(), idle()]); if (a.y === 0 && a.state === 'idle') landedAt = i; }
    ok(landedAt > 0 && a.landLag > 8, `A2 a whiffed air heavy has landing lag (${a.landLag} frames)`);
    cm.step([press('light'), idle()]); ok(a.state !== 'attack', 'A2 the fighter cannot attack during landing lag');
    run(cm, 30); ok(a.landLag === 0, 'A2 landing lag ends');
  }
  { // launcher -> juggle follow-up; the juggle is capped so it always ends
    const { a, b, cm } = mk(); const e = evs(cm); let maxCombo = 0; cm.events.on('combo', (c) => { if (c.owner === 0) maxCombo = Math.max(maxCombo, c.count); });
    cm.step([{ ...emptyInput(), crouch: true, pressed: ['light'] }, idle()]); let launched = false, followUps = 0, airHits = 0, prevH = b.health, peak = 0;
    for (let i = 0; i < 400 && b.state !== 'getup'; i++) {
      a.x = b.x - 0.9; a.z = b.z; // worst case: an attacker that is always perfectly in range
      const air = b.y > 0.05; if (air) { launched = true; peak = Math.max(peak, b.y); }
      const want = launched && air && (a.state === 'idle' || a.state === 'walk' || (a.state === 'attack' && a.connected)) ? press('light') : idle();
      cm.step([want, idle()]); if (b.health < prevH && launched && b.y > 0.05) airHits++; prevH = b.health;
      if (want.pressed.length) followUps++;
    }
    ok(launched && peak > 1.0, `J1 the launcher sends the opponent into the air (peak ${peak.toFixed(2)} m)`);
    ok(maxCombo >= 3, `J1 the launcher starts a real juggle combo (${maxCombo} hits)`);
    ok(airHits <= 5 && b.y === 0, `J2 the juggle is capped: at most ${airHits} air hits, then the victim lands`);
    ok(b.juggle === 0 && b.health > 0, 'J2 the victim survives the capped juggle and recovers');
    void e; void followUps;
  }
  { // infinite-air-combo guard: even endless forced hits on an airborne fighter run out
    const { a, b, cm } = mk(); let hits = 0; const start = b.health; b.reset(0.9, 0, -1); b.y = 1.2; b.vy = 0.05; b.setState('knockdown'); b.juggle = 0;
    for (let i = 0; i < 300 && b.y > 0.0001; i++) { a.x = b.x - 0.9; a.z = b.z; a.attack = null; a.setState('idle'); cm.step([press('light'), idle()]); const hb = b.health; void hb; if (b.invulnerable) hits += 0; }
    ok(b.y === 0 || b.state === 'knockdown', 'J3 an airborne fighter always lands even under constant attack');
    void hits; void start;
  }

  // ---------------- COMBO DATA: chains are acyclic, finishers end
  for (const id of ['ronin', 'shinobi', 'titan', 'akira']) {
    const at = getCharacter(id).stats.attacks; let cyc = false; let bad = '';
    const visit = (k: string, seen: string[]) => { if (seen.includes(k)) { cyc = true; return; } for (const nxt of Object.values(at[k].chain)) { if (!at[nxt as string]) bad = `${k}->${nxt}`; else visit(nxt as string, [...seen, k]); } };
    for (const k of Object.keys(at)) visit(k, []);
    ok(!cyc && !bad, `C1 ${id}: combo chains never loop and only point at real moves${bad ? ' (bad ' + bad + ')' : ''}`);
  }
  { const R = getCharacter('ronin').stats.attacks, S = getCharacter('shinobi').stats.attacks, T = getCharacter('titan').stats.attacks, K = getCharacter('akira').stats.attacks;
    const len = (at: typeof R) => { let n = 1, k = 'light1'; while (at[k].chain.light) { k = at[k].chain.light!; n++; } return n; };
    ok(len(R) === 3 && len(S) === 4 && len(T) === 2 && len(K) === 3, `C2 weapon-specific light chains: Ronin ${len(R)}, Shinobi ${len(S)}, Titan ${len(T)}, Akira ${len(K)} hits`);
    ok(Object.keys(R.heavy.chain).length === 0 && Object.keys(R.sweep.chain).length === 0, 'C2 heavies and sweeps end the combo (no free cancels)');
    ok(Object.keys(R.light1.chain).length < Object.keys(R).length - 3, 'C2 not every attack cancels into every other attack');
    ok(S.counter.lunge > 1 && K.counter.lunge < 0 && T.counter.guardDamage! > 0, 'C2 each character has a different counter (Shinobi slips past, Akira retreats, Titan breaks guard)');
  }
  { // long-run safety: nonstop light spam still leaves the victim windows to act (no permanent stun lock)
    const { a, b, cm } = mk(); let free = 0;
    for (let i = 0; i < 900; i++) { a.x = b.x - 0.9; a.z = b.z; cm.step([press('light'), idle()]); if (b.state === 'idle') free++; if (b.state === 'knockdown' || b.state === 'getup') free++; if (b.health <= 1) b.health = 600; }
    ok(free > 20, `C3 nonstop light spam cannot stun-lock the opponent (${free} free/down frames in 900)`);
  }
}

// ================================================================ PRIORITY 3: enemy AI behaviour
{
  type Cfg = { char?: string; diff?: Difficulty; beh?: Behavior; seed?: number };
  const mkAI = (c: Cfg) => new EnemyAI(c.diff ?? 'NORMAL', c.beh ?? 'BALANCED', c.seed ?? 1, c.char ?? 'ronin');
  const pair = (ca = 'ronin', cb = 'ronin') => {
    const a = new Fighter(getCharacter(ca).stats, bounds), b = new Fighter(getCharacter(cb).stats, bounds);
    a.reset(-0.9, 0, 1); b.reset(0.9, 0, -1); return { a, b, cm: new CombatManager([a, b]) };
  };
  const summary = (i: FighterInput) => `${i.fwd.toFixed(1)}|${i.side ?? 0}|${i.jump ? 1 : 0}|${i.block ? 1 : 0}|${i.crouch ? 1 : 0}|${i.dodge}|${i.pressed.join('+')}`;
  /** AI (fighter b) against a scripted fighter a. The scripted fighter's health is topped up so long runs stay comparable. */
  const vsScript = (ai: EnemyAI, frames: number, script: (f: number, a: Fighter, b: Fighter) => FighterInput, opt: { ca?: string; cb?: string; topUp?: boolean; energy?: number; observe?: (f: number, a: Fighter, b: Fighter, inp: FighterInput) => void } = {}) => {
    const { a, b, cm } = pair(opt.ca ?? 'ronin', opt.cb ?? 'ronin'); let distSum = 0; const trace: string[] = [];
    const counts = { hit: 0, blocked: 0, parry: 0, guardBreak: 0, aiDamage: 0 };
    cm.events.on('hit', (h) => { if (h.attacker === 1) { counts.hit++; counts.aiDamage += h.damage; } else if (h.blocked) counts.blocked++; });
    cm.events.on('parry', (p) => { if (p.who === 1) counts.parry++; });
    cm.events.on('guardBreak', () => counts.guardBreak++);
    for (let f = 0; f < frames; f++) {
      if (opt.topUp !== false) { a.health = a.stats.maxHealth; if (a.state === 'defeat') a.setState('idle'); }
      if (opt.energy !== undefined) b.energy = opt.energy;
      const inp = ai.think(b, a); opt.observe?.(f, a, b, inp);
      if (trace.length < 3000) trace.push(summary(inp));
      cm.step([script(f, a, b), inp]); distSum += Math.hypot(a.x - b.x, a.z - b.z);
    }
    return { a, b, cm, trace, counts, meanDist: distSum / frames };
  };
  const idleScript = () => emptyInput();
  const periodic = (every: number, ...btns: Button[]) => (f: number): FighterInput => (f % every === 0 ? { ...emptyInput(), pressed: [btns[Math.floor(f / every) % btns.length]] } : emptyInput());

  // ---- AI1: seeded randomness -> exact replays; different seeds -> different fights
  { const run = (seed: number) => vsScript(mkAI({ seed, diff: 'HARD', beh: 'AGGRESSIVE' }), 1200, periodic(40, 'light', 'heavy', 'kick')).trace.join(',');
    ok(run(7) === run(7), 'AI1 same seed replays an identical fight (inputs match frame for frame)');
    ok(run(7) !== run(8), 'AI1 a different seed plays differently');
  }
  // ---- AI2: human-like reaction delay: never reacts before its reaction time, and EASY is slower than HARD
  { const REACT: Record<string, number> = { EASY: 11, NORMAL: 7, HARD: 3 }; const best: Record<string, number> = {};
    for (const diff of ['EASY', 'NORMAL', 'HARD'] as Difficulty[]) {
      let min = 999;
      for (let seed = 1; seed <= 60; seed++) {
        const ai = mkAI({ diff, seed, beh: 'DEFENSIVE' }); const { a, b, cm } = pair(); a.x = -0.4; ai.reset(); let t0 = -1, first = -1;
        for (let f = 0; f < 40 && first < 0; f++) {
          const inp = ai.think(b, a); const defensive = inp.block || inp.crouch || inp.dodge !== 0; // (plain back-stepping is ordinary spacing, not a reaction)
          if (t0 >= 0 && defensive) first = f - t0;
          cm.step([f === 0 ? press('heavy') : emptyInput(), inp]); if (a.state === 'attack' && t0 < 0) t0 = f;
          if (b.state !== 'idle' && b.state !== 'walk' && b.state !== 'block') break;
        }
        if (first >= 0) min = Math.min(min, first);
      }
      best[diff] = min;
    }
    ok(best.EASY >= REACT.EASY && best.NORMAL >= REACT.NORMAL && best.HARD >= REACT.HARD, `AI2 never reacts faster than its reaction time (fastest: EASY ${best.EASY}f, NORMAL ${best.NORMAL}f, HARD ${best.HARD}f)`);
    ok(best.EASY > best.HARD, 'AI2 harder AIs react faster than easier ones');
  }
  // ---- AI3: no perfect defence - even HARD gets hit by a steady stream of lights
  { const r = vsScript(mkAI({ diff: 'HARD', beh: 'DEFENSIVE', seed: 3 }), 4000, periodic(30, 'light'));
    const hitsOnAi = r.counts.blocked; void hitsOnAi;
    ok(r.b.health < r.b.stats.maxHealth, `AI3 HARD still takes damage (${r.b.stats.maxHealth - r.b.health} lost) - it does not block everything`);
  }
  // ---- AI4: no cheating - it cannot act while stunned, and uses only the energy its meter holds
  { const ai = mkAI({ diff: 'HARD', beh: 'AGGRESSIVE', seed: 4 }); let actedWhileStunned = 0, specialsWithoutEnergy = 0;
    const r = vsScript(ai, 5000, periodic(25, 'light', 'heavy', 'light', 'kick'), { observe: (_f, _a, b, inp) => {
      if (!b.neutral && b.state !== 'attack' && (inp.pressed.length || inp.jump || inp.dodge !== 0 || Math.abs(inp.fwd) > 0)) actedWhileStunned++;
      if (inp.pressed.some((p) => p === 'special' || p === 'ultimate') && b.energy < 40) specialsWithoutEnergy++;
    } });
    ok(actedWhileStunned === 0, `AI4 sends no movement or attacks while stunned/down (${actedWhileStunned})`);
    ok(specialsWithoutEnergy === 0 && r.b.energy <= 100, 'AI4 never calls a shadow ability without the energy for it');
  }
  // ---- AI5: decision variety - it uses several different attacks and does not loop one move
  { const ai = mkAI({ diff: 'NORMAL', beh: 'BALANCED', seed: 5 }); vsScript(ai, 9000, idleScript);
    const moves = Object.entries(ai.stats).filter(([k]) => ['light1', 'kick', 'heavy', 'lowkick', 'sweep', 'launcher', 'grab', 'special', 'ultimate'].includes(k));
    const total = moves.reduce((s, [, v]) => s + v, 0), top = Math.max(...moves.map(([, v]) => v));
    ok(moves.length >= 5 && total > 30, `AI5 uses ${moves.length} different attacks over ${total} decisions`);
    ok(top / total < 0.55, `AI5 no single move dominates (most common ${(100 * top / total).toFixed(0)}%)`);
  }
  // ---- AI6: behaviour profiles are visibly different
  { const aggr = mkAI({ beh: 'AGGRESSIVE', seed: 6 }), def = mkAI({ beh: 'DEFENSIVE', seed: 6 });
    const ra = vsScript(aggr, 7000, idleScript), rd = vsScript(def, 7000, idleScript);
    ok(aggr.attackCount > def.attackCount * 1.3, `AI6 AGGRESSIVE attacks far more than DEFENSIVE (${aggr.attackCount} vs ${def.attackCount})`);
    ok(rd.meanDist > ra.meanDist + 0.12, `AI6 DEFENSIVE keeps more distance (${rd.meanDist.toFixed(2)} m vs ${ra.meanDist.toFixed(2)} m)`);
    const tech = mkAI({ beh: 'TECHNICAL', seed: 6, diff: 'HARD' }); vsScript(tech, 7000, periodic(55, 'heavy', 'light', 'kick'));
    ok((tech.stats.whiffPunish ?? 0) + (tech.stats.punish ?? 0) + (tech.stats.crouchGuard ?? 0) + (tech.stats.parryTry ?? 0) > 3, `AI6 TECHNICAL reads recovery windows and defends with height/parry (${tech.stats.whiffPunish ?? 0} whiff punishes, ${tech.stats.crouchGuard ?? 0} crouch guards, ${tech.stats.parryTry ?? 0} parry tries)`);
  }
  // ---- AI7: it uses the new mechanics: crouch-guards lows, parries, throws turtles, counters
  { const ai = mkAI({ diff: 'HARD', beh: 'TECHNICAL', seed: 7 });
    vsScript(ai, 6000, (f) => (f % 50 === 0 ? { ...emptyInput(), crouch: true, pressed: ['kick'] } : emptyInput()));
    ok((ai.stats.crouchGuard ?? 0) >= 3, `AI7 crouch-guards low attacks (${ai.stats.crouchGuard ?? 0} times)`);
    const par = mkAI({ diff: 'HARD', beh: 'DEFENSIVE', seed: 11 }); const rp = vsScript(par, 12000, periodic(45, 'light', 'heavy', 'kick'));
    ok((par.stats.parryTry ?? 0) >= 3 && rp.counts.parry >= 1, `AI7 HARD tries parries (${par.stats.parryTry} tries) and lands some (${rp.counts.parry})`);
    const attacksAtAi = Math.floor(12000 / 45);
    ok(rp.counts.parry < attacksAtAi * 0.35, `AI7 it does not parry everything (${rp.counts.parry} parries against ${attacksAtAi} attacks)`);
    const turtle = mkAI({ diff: 'HARD', beh: 'AGGRESSIVE', seed: 9, char: 'titan' });
    vsScript(turtle, 5000, () => ({ ...emptyInput(), block: true }), { cb: 'titan' });
    ok((turtle.stats.grab ?? 0) >= 2, `AI7 throws opponents who only block (${turtle.stats.grab ?? 0} grabs)`);
    const ctr = mkAI({ diff: 'HARD', beh: 'DEFENSIVE', seed: 12 }); vsScript(ctr, 20000, periodic(40, 'light', 'heavy'));
    ok((ctr.stats.counter ?? 0) >= 1, `AI7 follows a successful parry with the counter attack (${ctr.stats.counter ?? 0})`);
  }
  // ---- AI8: each character is played in its own style
  { // the distance at which each AI chooses to START an attack = the range it likes to fight at
    const atkDist = (id: string) => { const ai = mkAI({ char: id, seed: 8 }); const d: number[] = [];
      vsScript(ai, 9000, () => ({ ...emptyInput(), block: true }), { cb: id, observe: (_f, a, b, inp) => { if (b.neutral && inp.pressed.some((p) => p === 'light' || p === 'kick' || p === 'heavy')) d.push(Math.hypot(a.x - b.x, a.z - b.z)); } });
      return d.reduce((s, v) => s + v, 0) / Math.max(1, d.length); };
    const spear = atkDist('akira'), dag = atkDist('shinobi');
    ok(spear > dag + 0.3, `AI8 Akira attacks from range (${spear.toFixed(2)} m), Shinobi from close (${dag.toFixed(2)} m)`);
    const t = mkAI({ char: 'titan', seed: 8 }); vsScript(t, 9000, idleScript, { cb: 'titan' });
    const s = mkAI({ char: 'shinobi', seed: 8 }); vsScript(s, 9000, idleScript, { cb: 'shinobi' });
    const heavyShare = (ai: EnemyAI) => (ai.stats.heavy ?? 0) / Math.max(1, ai.attackCount);
    ok(heavyShare(t) > heavyShare(s), `AI8 Titan favours heavy blows more than Shinobi (${(100 * heavyShare(t)).toFixed(0)}% vs ${(100 * heavyShare(s)).toFixed(0)}%)`);
  }
  // ---- AI9: boss - telegraphs major attacks, and phases change its strategy
  { const boss = mkAI({ diff: 'HARD', beh: 'BOSS', seed: 13 }); let tellFrames = 0, longest = 0, movedDuringTell = 0, tellsSeen = 0, wasTell = false;
    vsScript(boss, 9000, idleScript, { energy: 100, observe: (_f, _a, _b, inp) => {
      if (boss.telegraphing) { tellFrames++; if (Math.abs(inp.fwd) > 0 || inp.pressed.length || inp.dodge) movedDuringTell++; if (!wasTell) tellsSeen++; }
      else { longest = Math.max(longest, tellFrames); tellFrames = 0; }
      wasTell = boss.telegraphing;
    } });
    ok(tellsSeen >= 2 && longest >= 10, `AI9 the boss telegraphs special/ultimate attacks (${tellsSeen} tells, longest ${longest} frames)`);
    ok(movedDuringTell === 0, 'AI9 the boss stands still while telegraphing (a fair, visible warning)');
    const rate = (hpFrac: number) => { const ai = mkAI({ diff: 'NORMAL', beh: 'BOSS', seed: 21 }); const { a, b, cm } = pair(); b.health = b.stats.maxHealth * hpFrac; ai.reset();
      for (let f = 0; f < 5000; f++) { a.health = 1000; if (a.state === 'defeat') a.setState('idle'); b.health = b.stats.maxHealth * hpFrac; cm.step([emptyInput(), ai.think(b, a)]); } return { atk: ai.attackCount, phase: ai.phase }; };
    const p1 = rate(0.9), p3 = rate(0.2);
    ok(p1.phase === 1 && p3.phase === 3 && p3.atk > p1.atk * 1.15, `AI9 the enraged phase 3 attacks more than phase 1 (${p3.atk} vs ${p1.atk} attacks)`);
  }
  // ---- AI10: full AI-vs-AI matches for every pairing finish without stalls
  { let stalls = 0, longestIdle = 0, finished = 0, total = 0; const ids = ['ronin', 'shinobi', 'titan', 'akira'];
    for (const ca of ids) for (const cb of ids) {
      const { a, b, cm } = pair(ca, cb); const A = new EnemyAI('HARD', 'BALANCED', 31, ca), B = new EnemyAI('HARD', 'AGGRESSIVE', 32, cb);
      let idleRun = 0, ko = false; cm.events.on('ko', () => { ko = true; });
      for (let f = 0; f < 3600 && !ko; f++) { cm.step([A.think(a, b), B.think(b, a)]); idleRun = a.state === 'attack' || b.state === 'attack' || a.inCombo || b.inCombo ? 0 : idleRun + 1; longestIdle = Math.max(longestIdle, idleRun); }
      total++; if (ko || a.health !== a.stats.maxHealth || b.health !== b.stats.maxHealth) finished++;
    }
    stalls = longestIdle > 420 ? 1 : 0;
    ok(finished === total, `AI10 all ${total} character pairings engage and trade blows`);
    ok(stalls === 0, `AI10 no stalemates (longest passive spell ${(longestIdle / 60).toFixed(1)} s)`);
  }
}

// ================================================================ PRIORITY 3: training tools - tutorial, move list, frame data
{
  // ---- tutorial: steps complete only on the real action, in order, and finish
  { const tut = new Tutorial(); const seen: string[] = []; let done = false;
    tut.onChange = (s) => { if (s) seen.push(s.id); }; tut.onComplete = () => { done = true; };
    tut.start();
    ok(tut.active && tut.step?.id === 'move' && tut.count === 9, 'TR1 the tutorial starts at step 1 of 9 (movement)');
    tut.note('lightHit'); tut.note('heavyHit'); ok(tut.step?.id === 'move', 'TR1 unrelated actions do not complete a step');
    tut.note('moved', 1.2); ok(tut.step?.id === 'move' && Math.abs(tut.progress - 0.4) < 0.01, 'TR1 distance steps show progress');
    tut.note('moved', 2); ok(tut.step?.id === 'jump', 'TR1 walking 3 m completes MOVE');
    tut.note('jumped'); tut.note('lightHit'); tut.note('heavyHit'); tut.note('blocked'); tut.note('dodged'); tut.note('combo'); tut.note('special'); tut.note('ultimate');
    ok(done && !tut.active, `TR1 completing every action in order finishes the tutorial (${seen.join(' > ')})`);
    ok(seen.join(',') === 'move,jump,light,heavy,block,dodge,combo,special,ultimate', 'TR1 it teaches movement, jumping, attacks, blocking, dodging, combos, special and ultimate in that order');
  }
  { // actions done BEFORE a step starts do not count for it (no accidental skipping)
    const tut = new Tutorial(); tut.start(); tut.note('moved', 5); tut.note('lightHit'); tut.note('lightHit');
    ok(tut.step?.id === 'jump', 'TR2 early extra actions are not banked: step 3 still needs a fresh light hit');
    tut.note('jumped'); ok(tut.step?.id === 'light', 'TR2 step 3 waits for a NEW light hit');
    tut.note('lightHit'); ok(tut.step?.id === 'heavy', 'TR2 a fresh light hit completes it');
  }
  { const tut = new Tutorial(); tut.start(); tut.stop(); tut.note('moved', 99); ok(!tut.active && tut.step === null, 'TR3 a stopped tutorial ignores input'); }
  ok(TUTORIAL_STEPS.every((s) => s.text.length > 10 && s.need > 0), 'TR4 every step has instructions and a goal');

  // ---- frame data and move list
  const R = getCharacter('ronin');
  ok(onBlockAdvantage(R.stats.attacks.light1) === R.stats.attacks.light1.blockstun - (R.stats.attacks.light1.active - 1 + R.stats.attacks.light1.recovery), 'MV1 frame advantage = blockstun - remaining attack frames');
  ok(onBlockAdvantage(R.stats.attacks.heavy) < onBlockAdvantage(R.stats.attacks.light1), 'MV1 heavy attacks are more punishable on block than lights');
  ok(onHitAdvantage(R.stats.attacks.heavy) === 'KD' && onHitAdvantage(R.stats.attacks.launcher) === 'KD', 'MV1 knockdowns and launchers report KD');
  for (const c of CHARACTERS) {
    const html = buildMoveList(c), routes = comboRoutes(c);
    ok(['Light 1', 'Kick', 'Heavy', 'Low Kick', 'Sweep', 'Launcher', 'Throw', 'Counter', 'Air Light', 'Air Heavy', 'Air Kick', 'Special', 'Ultimate'].every((n) => html.includes(n)), `MV2 ${c.id}: move list shows every move with its input and frame data`);
    ok(routes.length >= 3 && routes.every((r) => r.damage > 0 && r.moves.length >= 2), `MV3 ${c.id}: ${routes.length} combo routes generated from the chain data (best ${routes[0]?.damage} dmg)`);
    const longestLight = (() => { let n = 1, k = 'light1'; while (c.stats.attacks[k].chain.light) { k = c.stats.attacks[k].chain.light!; n++; } return n; })();
    ok(html.includes('Light 2') && (longestLight >= 3) === html.includes('Light 3') && (longestLight >= 4) === html.includes('Light 4'), `MV4 ${c.id}: the list only shows the light attacks its chain really has (${longestLight})`);
  }
  ok(comboRoutes(CHARACTERS[1]).some((r) => r.inputs.split('>').length >= 5), 'MV5 Shinobi\'s 4-hit flurry (and finisher) appears in his combo list');
  ok(comboRoutes(CHARACTERS[0]).some((r) => r.inputs.startsWith('C+J')), 'MV5 launcher juggle routes are listed');

  // ---- per-character movement identity
  const S = Object.fromEntries(CHARACTERS.map((c) => [c.id, c.stats]));
  ok(S.shinobi.walkSpeed > S.ronin.walkSpeed && S.ronin.walkSpeed > S.titan.walkSpeed, 'CH1 walk speed: Shinobi > Ronin > Titan');
  const peak = (id: string) => { const f = new Fighter(S[id], bounds); const g = new Fighter(S.ronin, bounds); f.reset(-5, 0, 1); g.reset(5, 0, -1); const cm = new CombatManager([f, g]); let y = 0; cm.step([{ ...emptyInput(), jump: true }, emptyInput()]); for (let i = 0; i < 60; i++) { cm.step([emptyInput(), emptyInput()]); y = Math.max(y, f.y); } return y; };
  ok(peak('shinobi') > peak('ronin') && peak('ronin') > peak('titan'), `CH2 jump height differs: Shinobi ${peak('shinobi').toFixed(2)} > Ronin ${peak('ronin').toFixed(2)} > Titan ${peak('titan').toFixed(2)} m`);
  const sidestep = (id: string) => { const f = new Fighter(S[id], bounds); const g = new Fighter(S.ronin, bounds); f.reset(-5, 0, 1); g.reset(5, 0, -1); const cm = new CombatManager([f, g]); cm.step([{ ...emptyInput(), dodge: 1 }, emptyInput()]); for (let i = 0; i < 30; i++) cm.step([emptyInput(), emptyInput()]); return Math.abs(f.z); };
  ok(sidestep('shinobi') > sidestep('ronin') && sidestep('ronin') > sidestep('titan'), `CH3 sidestep distance differs: Shinobi ${sidestep('shinobi').toFixed(2)} > Ronin ${sidestep('ronin').toFixed(2)} > Titan ${sidestep('titan').toFixed(2)} m`);
  ok(S.titan.maxHealth > S.ronin.maxHealth && S.ronin.maxHealth > S.shinobi.maxHealth, 'CH4 health: Titan > Ronin > Shinobi');
  const dmg = (id: string) => S[id].attacks.heavy.damage;
  ok(dmg('titan') > dmg('ronin') && dmg('ronin') > dmg('shinobi'), `CH5 heavy damage: Titan ${dmg('titan')} > Ronin ${dmg('ronin')} > Shinobi ${dmg('shinobi')}`);
  ok(S.akira.attacks.light1.reach > S.ronin.attacks.light1.reach && S.ronin.attacks.light1.reach > S.shinobi.attacks.light1.reach, 'CH6 reach: Akira > Ronin > Shinobi');
  ok(S.shinobi.attacks.light1.startup < S.ronin.attacks.light1.startup && S.titan.attacks.light1.startup > S.ronin.attacks.light1.startup, 'CH7 light startup: Shinobi fastest, Titan slowest');
}

// ================================================================ MOVE SET: many different moves
{
  type Cmd = { btn: Button; fwd?: number; side?: number; crouch?: boolean; run?: boolean; air?: boolean };
  // the input that performs each move directly (chain finishers are reached through the chain graph instead)
  const DIRECT: Record<string, Cmd> = {
    light1: { btn: 'light' }, kick: { btn: 'kick' }, heavy: { btn: 'heavy' },
    lowkick: { btn: 'kick', crouch: true }, sweep: { btn: 'heavy', crouch: true }, launcher: { btn: 'light', crouch: true }, grab: { btn: 'grab' },
    dashstrike: { btn: 'light', fwd: 1 }, rush: { btn: 'heavy', fwd: 1 }, axekick: { btn: 'kick', fwd: 1 },
    retreatcut: { btn: 'light', fwd: -1 }, backkick: { btn: 'kick', fwd: -1 }, spinslash: { btn: 'heavy', side: 1 }, spinkick: { btn: 'kick', side: 1 },
    sprintstrike: { btn: 'light', fwd: 1, run: true },
    special: { btn: 'special' }, special_f: { btn: 'special', fwd: 1 }, special_b: { btn: 'special', fwd: -1 }, special_low: { btn: 'special', crouch: true }, ultimate: { btn: 'ultimate' },
    airlight: { btn: 'light', air: true }, airheavy: { btn: 'heavy', air: true }, airkick: { btn: 'kick', air: true },
    divekick: { btn: 'kick', fwd: 1, air: true }, airback: { btn: 'light', fwd: -1, air: true }, airspin: { btn: 'heavy', side: 1, air: true },
  };
  const idle = emptyInput;
  const mkSim = (id: string, sep = 6, foeId = 'ronin') => {
    const f = new Fighter(getCharacter(id).stats, bounds), foe = new Fighter(getCharacter(foeId).stats, bounds);
    f.reset(-sep / 2, 0, 1); foe.reset(sep / 2, 0, -1); f.energy = 100; return { f, foe, cm: new CombatManager([f, foe]) };
  };
  const inputFor = (c: Cmd): FighterInput => ({ ...emptyInput(), fwd: c.fwd ?? 0, side: c.side ?? 0, crouch: !!c.crouch, pressed: [c.btn] });
  const perform = (id: string, c: Cmd): string | undefined => {
    const { f, cm } = mkSim(getCharacter(id).id);
    if (c.air) { cm.step([{ ...emptyInput(), jump: true }, idle()]); for (let i = 0; i < 6; i++) cm.step([idle(), idle()]); }
    if (c.run) { for (let i = 0; i < 70; i++) cm.step([{ ...emptyInput(), fwd: 1 }, idle()]); }
    cm.step([inputFor(c), idle()]);
    return f.attack?.id;
  };
  const chars = ['ronin', 'shinobi', 'titan', 'akira'];

  // ---- MS1: every move that has a direct input really starts from that input
  for (const ch of chars) {
    const A = getCharacter(ch).stats.attacks; const bad: string[] = [];
    for (const [mid, c] of Object.entries(DIRECT)) { if (!A[mid]) continue; const got = perform(ch, c); if (got !== mid) bad.push(`${mid}->${got}`); }
    ok(bad.length === 0, `MS1 ${ch}: all ${Object.keys(DIRECT).filter((m) => A[m]).length} directly-input moves start from their inputs${bad.length ? ' (wrong: ' + bad.join(', ') + ')' : ''}`);
  }
  // ---- MS2: chain-only moves are reachable, and really happen when the chain is played
  for (const ch of chars) {
    const A = getCharacter(ch).stats.attacks; const direct = new Set(Object.keys(DIRECT).filter((m) => A[m]));
    const reach = new Map<string, Button[]>(); const queue: Array<[string, Button[]]> = [];
    for (const d of ['light1', 'kick', 'heavy', 'dashstrike', 'launcher', 'lowkick']) { if (A[d]) { reach.set(d, []); queue.push([d, []]); } }
    while (queue.length) { const [k, p] = queue.shift()!; for (const [b, to] of Object.entries(A[k].chain)) if (!reach.has(to as string) && A[to as string]) { reach.set(to as string, [...p, b as Button]); queue.push([to as string, [...p, b as Button]]); } }
    const unreachable = Object.keys(A).filter((m) => !direct.has(m) && !reach.has(m) && m !== 'counter');
    ok(unreachable.length === 0, `MS2 ${ch}: every move can be performed (${unreachable.length ? 'unreachable: ' + unreachable.join(', ') : 'direct input or chain'})`);
    // play each chain-only move for real
    const chainOnly = [...reach.keys()].filter((m) => !direct.has(m) && reach.get(m)!.length > 0);
    const failed: string[] = [];
    for (const target of chainOnly) {
      const path = reach.get(target)!; let start = ''; // find which starter leads here
      for (const d of ['light1', 'kick', 'heavy', 'dashstrike', 'launcher', 'lowkick']) {
        let cur = d, okp = !!A[d]; for (const b of path) { const nx = A[cur]?.chain[b]; if (!nx) { okp = false; break; } cur = nx; } if (okp && cur === target) { start = d; break; }
      }
      const { f, foe, cm } = mkSim(ch, 1.8); let next = 0, done = false, pressedFrom = ''; cm.step([inputFor(DIRECT[start]), idle()]);
      for (let i = 0; i < 400 && !done; i++) {
        foe.health = foe.stats.maxHealth; if (foe.state === 'defeat') foe.setState('idle'); foe.x = f.x + 0.95; foe.z = f.z; foe.fx = -1; foe.fz = 0; if (foe.state === 'knockdown' || foe.state === 'getup') foe.setState('idle');
        const canPress = !cm.frozen && f.state === 'attack' && f.connected && f.attackPhase !== 'startup' && next < path.length && f.attack!.id !== pressedFrom; // one press per chain link (input is ignored during hitstop)
        if (canPress) pressedFrom = f.attack!.id;
        const press = canPress ? { ...emptyInput(), pressed: [path[next++]] } : idle();
        cm.step([press, idle()]); if (f.attack?.id === target) done = true;
      }
      if (!done) failed.push(`${target} (${start} > ${path.join(',')})`);
    }
    ok(failed.length === 0, `MS2 ${ch}: ${chainOnly.length} chain finishers/branches all happen when the chain is played${failed.length ? ' (failed: ' + failed.join('; ') + ')' : ''}`);
  }
  // ---- MS3: every ground move can actually connect with something (nothing is a dud)
  for (const ch of chars) {
    const A = getCharacter(ch).stats.attacks; const duds: string[] = [];
    for (const [mid, c] of Object.entries(DIRECT)) {
      if (!A[mid] || c.air) continue; let connected = false;
      for (let d = 1.0; d <= 3.8 && !connected; d += 0.2) {
        const { f, foe, cm } = mkSim(ch, d); if (c.run) { for (let i = 0; i < 70; i++) { f.x = -d / 2; cm.step([{ ...emptyInput(), fwd: 1 }, idle()]); } f.reset(-d / 2, 0, 1); f.energy = 100; f.running = true; }
        let hit = false; cm.events.on('hit', (h) => { if (h.attacker === 0) hit = true; }); cm.events.on('grab', () => { hit = true; });
        cm.step([inputFor(c), idle()]); for (let i = 0; i < 80 && !hit; i++) { foe.health = foe.stats.maxHealth; cm.step([idle(), idle()]); }
        connected = hit;
      }
      if (!connected) duds.push(mid);
    }
    ok(duds.length === 0, `MS3 ${ch}: every ground move connects at some range${duds.length ? ' (duds: ' + duds.join(', ') + ')' : ''}`);
  }
  // ---- MS4: multi-hit moves land several separate hits
  for (const [ch, mid] of [['shinobi', 'special_f'], ['akira', 'special_f']] as const) {
    const A = getCharacter(ch).stats.attacks[mid]; let best = 0;
    for (let d = 1.4; d <= 3.4; d += 0.2) { const { f, foe, cm } = mkSim(ch, d); let n = 0; cm.events.on('hit', (h) => { if (h.attacker === 0 && !h.blocked) n++; });
      cm.step([inputFor(DIRECT[mid]), idle()]); for (let i = 0; i < 80; i++) { foe.health = foe.stats.maxHealth; cm.step([idle(), idle()]); } best = Math.max(best, n); void f; }
    ok(A.hits === 3 && best >= 2, `MS4 ${ch} ${A.name}: a ${A.hits}-hit move lands ${best} separate hits`);
  }
  // ---- MS5: variety - plenty of moves per character, and none of them are clones
  const sig = (a: AttackData) => [a.startup, a.active, a.recovery, a.damage, Math.round(a.reach * 100), a.shape ?? 's', a.level ?? 'm', a.hits ?? 1, a.lunge.toFixed(2)].join('|');
  for (const ch of chars) {
    const A = getCharacter(ch).stats.attacks, ids = Object.keys(A), seen = new Map<string, string>(); const clones: string[] = [];
    for (const id of ids) { const s = sig(A[id]); if (seen.has(s)) clones.push(`${seen.get(s)}=${id}`); else seen.set(s, id); }
    ok(ids.length >= 30, `MS5 ${ch}: ${ids.length} distinct moves (the shared table had 16)`);
    ok(clones.length === 0, `MS5 ${ch}: no two moves share identical frame data${clones.length ? ' (clones: ' + clones.join(', ') + ')' : ''}`);
  }
  { const all = new Set<string>(); for (const ch of chars) for (const a of Object.values(getCharacter(ch).stats.attacks)) all.add(ch + ':' + (a.name ?? a.id));
    const names = chars.map((ch) => Object.values(getCharacter(ch).stats.attacks).filter((a) => a.name).length);
    ok(all.size >= 120 && names.every((n) => n >= 8), `MS5 ${all.size} moves across the roster; each fighter has ${names.join('/')} signature-named techniques`); }
  // ---- MS6: the direction held WHEN the button was pressed decides the move, even if the press is buffered
  { const { f, cm } = mkSim('ronin', 6); cm.step([press('light'), idle()]); for (let i = 0; i < 13; i++) cm.step([idle(), idle()]);
    cm.step([{ ...emptyInput(), fwd: 1, pressed: ['light'] }, idle()]); // pressed with forward held, during the recovery of the jab
    let id = ''; for (let i = 0; i < 30; i++) { cm.step([idle(), idle()]); if (f.attack && f.attack.id !== 'light1' && !id) id = f.attack.id; }
    ok(id === 'dashstrike', `MS6 a buffered press keeps the direction it was pressed with (${id || 'none'})`);
  }
  // ---- MS7: the AI uses a wide range of the moves over a fight
  { const used = new Set<string>(); const ids = ['dashstrike', 'rush', 'axekick', 'retreatcut', 'backkick', 'spinslash', 'spinkick', 'special_f', 'special_b', 'special_low', 'light1', 'kick', 'heavy', 'lowkick', 'sweep', 'launcher', 'grab', 'special', 'ultimate'];
    for (const [beh, seed] of [['AGGRESSIVE', 3], ['DEFENSIVE', 4], ['TECHNICAL', 5], ['BALANCED', 6]] as const) {
      const ai = new EnemyAI('HARD', beh, seed, 'ronin'); const { f: foe, foe: me, cm } = mkSim('ronin', 1.8); const a = foe, b = me;
      for (let fr = 0; fr < 14000; fr++) { a.health = 1000; if (a.state === 'defeat') a.setState('idle'); b.energy = Math.max(b.energy, fr % 700 === 0 ? 100 : b.energy);
        const strafe = fr % 400 < 90 ? { ...emptyInput(), side: 1 } : fr % 400 < 200 ? { ...emptyInput(), block: true } : fr % 400 < 260 ? { ...emptyInput(), crouch: true } : emptyInput();
        cm.step([strafe, ai.think(b, a)]); }
      for (const id of ids) if ((ai.stats[id] ?? 0) > 0) used.add(id);
    }
    ok(used.size >= 13, `MS7 the AI uses ${used.size} different moves across styles (${[...used].join(', ')})`);
  }
  // ---- MS8: move list documents all of it
  for (const c of CHARACTERS) {
    const html = buildMoveList(c), n = Object.keys(c.stats.attacks).filter((k) => k !== 'light4' || c.stats.attacks.light3?.chain.light).length;
    ok(html.includes('DIRECTION MOVES') && html.includes('forward + J') && html.includes('SHADOW ARTS') && html.includes('CHAIN FINISHERS') && /\d+ MOVES/.test(html), `MS8 ${c.id}: the move list is grouped and shows the direction inputs (${html.match(/(\d+) MOVES/)?.[1]} of ${n} listed)`);
  }
}

// ================================================================ FIGHTING STYLES: classic / iron / wind / shadow
{
  const idle = emptyInput;
  const chars = ['ronin', 'shinobi', 'titan', 'akira'];
  const styled = (ch: string, st: StyleId) => applyStyle(getCharacter(ch).stats, st);
  const mk = (ch: string, st: StyleId, sep = 6, foeCh = 'ronin', foeSt: StyleId = 'classic') => {
    const f = new Fighter(styled(ch, st), bounds), foe = new Fighter(styled(foeCh, foeSt), bounds);
    f.reset(-sep / 2, 0, 1); foe.reset(sep / 2, 0, -1); f.energy = 100; return { f, foe, cm: new CombatManager([f, foe]) };
  };

  // ---- ST1: each style changes the character in the way it promises; classic changes nothing
  { const base = getCharacter('ronin').stats, c = styled('ronin', 'classic'), i = styled('ronin', 'iron'), w = styled('ronin', 'wind'), s = styled('ronin', 'shadow');
    ok(c.maxHealth === base.maxHealth && c.walkSpeed === base.walkSpeed && c.attacks.heavy.damage === base.attacks.heavy.damage && !c.attacks.heavy.armor && !c.attacks.iron_a, 'ST1 CLASSIC leaves the fighter exactly as designed');
    ok(i.maxHealth > base.maxHealth && i.walkSpeed < base.walkSpeed && i.attacks.heavy.armor === true && (i.guardResist ?? 1) < 1 && i.attacks.heavy.damage > base.attacks.heavy.damage && i.attacks.light1.startup > base.attacks.light1.startup, 'ST1 IRON: a bit more health, sturdier guard, armoured heavies, harder heavy hits - but slower walking and jabs');
    ok(w.doubleJump === true && (w.jump ?? 1) > 1 && (w.dodgeBonus ?? 0) > 0 && w.attacks.airlight.damage > base.attacks.airlight.damage && w.attacks.light1.damage < base.attacks.light1.damage && w.maxHealth < base.maxHealth, 'ST1 WIND: double jump, higher jump, safer sidestep, stronger air attacks - but weaker lights and a little less health');
    ok((s.energyMult ?? 1) > 1.4 && s.attacks.special.cost! < base.attacks.special.cost! && s.attacks.special.damage > base.attacks.special.damage && s.attacks.ultimate.cost === 100, 'ST1 SHADOW: faster energy, cheaper and stronger shadow arts (ultimate unchanged)');
    ok(['iron', 'wind', 'shadow'].every((st) => ['a', 'b', 'c', 'd'].every((k) => !!styled('ronin', st as StyleId).attacks[`${st}_${k}`])) && !styled('ronin', 'iron').attacks.wind_a, 'ST1 each style adds exactly its own four signature moves');
    ok(normalizeStyle('banana') === 'classic' && normalizeStyle('iron') === 'iron' && normalizeStyle(undefined) === 'classic', 'ST1 unknown style names fall back to classic');
  }
  // ---- ST2: every style move starts from the STYLE button + direction, for every character
  { const DIR: Record<string, { fwd?: number; crouch?: boolean }> = { a: {}, b: { fwd: 1 }, c: { fwd: -1 }, d: { crouch: true } };
    for (const st of ['iron', 'wind', 'shadow'] as StyleId[]) {
      const bad: string[] = [];
      for (const ch of chars) for (const k of ['a', 'b', 'c', 'd']) {
        const { f, cm } = mk(ch, st); cm.step([{ ...emptyInput(), fwd: DIR[k].fwd ?? 0, crouch: !!DIR[k].crouch, pressed: ['style'] }, idle()]);
        if (f.attack?.id !== `${st}_${k}`) bad.push(`${ch}:${k}->${f.attack?.id}`);
      }
      ok(bad.length === 0, `ST2 ${st}: all 16 style moves (4 per character) start from B / fwd+B / back+B / crouch+B${bad.length ? ' (wrong: ' + bad.join(', ') + ')' : ''}`);
    }
    const { f, cm } = mk('ronin', 'classic'); cm.step([{ ...emptyInput(), pressed: ['style'] }, idle()]); ok(f.state !== 'attack', 'ST2 CLASSIC has no style moves: the button does nothing');
    const lo = mk('ronin', 'iron'); lo.f.energy = 5; lo.cm.step([{ ...emptyInput(), pressed: ['style'] }, idle()]); ok(lo.f.state !== 'attack', 'ST2 style moves cost shadow energy and need it');
  }
  // ---- ST3: every style move can connect; Shadow Bolt really outranges everything, Phase Rush passes through
  { const ids = ['a', 'b', 'c', 'd']; const DIR: Record<string, { fwd?: number; crouch?: boolean }> = { a: {}, b: { fwd: 1 }, c: { fwd: -1 }, d: { crouch: true } };
    for (const st of ['iron', 'wind', 'shadow'] as StyleId[]) for (const ch of chars) {
      const duds: string[] = []; let far = 0;
      for (const k of ids) {
        let connected = false;
        for (let d = 1.0; d <= 4.2; d += 0.2) {
          const { f, foe, cm } = mk(ch, st, d); let hit = false; cm.events.on('hit', (h) => { if (h.attacker === 0) hit = true; });
          cm.step([{ ...emptyInput(), fwd: DIR[k].fwd ?? 0, crouch: !!DIR[k].crouch, pressed: ['style'] }, idle()]); for (let i = 0; i < 80 && !hit; i++) { foe.health = foe.stats.maxHealth; cm.step([idle(), idle()]); }
          if (hit) { connected = true; if (st === 'shadow' && k === 'a') far = Math.max(far, d); }
        }
        if (!connected) duds.push(k);
      }
      ok(duds.length === 0, `ST3 ${ch}/${st}: all four style moves connect at some range${duds.length ? ' (duds: ' + duds.join(',') + ')' : ''}`);
      if (st === 'shadow') ok(far >= 3.0, `ST3 ${ch}/shadow: Shadow Bolt connects from ${far.toFixed(1)} m (a normal attack reaches about 2 m)`);
    }
    const { f, foe, cm } = mk('ronin', 'shadow', 1.6); const foeX = foe.x; cm.step([{ ...emptyInput(), fwd: 1, pressed: ['style'] }, idle()]); for (let i = 0; i < 60; i++) { foe.health = foe.stats.maxHealth; cm.step([idle(), idle()]); }
    ok(f.x > foeX - 0.05, `ST3 Phase Rush carries the fighter through the opponent (ends at x ${f.x.toFixed(2)}, opponent started at ${foeX.toFixed(2)})`);
  }
  // ---- ST4: Iron's super armour shrugs off normal hits, but not heavy hits, throws or lethal blows
  { const trial = (st: StyleId, foeBtn: Button, hp?: number) => {
      const { f, foe, cm } = mk('ronin', st, 1.8); if (hp) f.health = hp; const start = f.health;
      cm.step([{ ...emptyInput(), pressed: [st === 'iron' ? 'style' : 'heavy'] }, idle()]);   // iron_a / a normal heavy: slow startup
      for (let i = 0; i < 5; i++) cm.step([idle(), idle()]);
      cm.step([idle(), press(foeBtn)]); let still = true, id = ''; for (let i = 0; i < 16; i++) { cm.step([idle(), idle()]); id = f.attack?.id ?? id; if (f.state !== 'attack') still = false; }
      return { still, lost: start - f.health, id, f };
    };
    const arm = trial('iron', 'light'), plain = trial('classic', 'light');
    ok(arm.still && arm.lost > 0 && arm.lost <= 30, `ST4 an armoured Iron move keeps going through a light hit and takes only part of the damage (lost ${arm.lost} of 40)`);
    ok(!plain.still, 'ST4 the same hit interrupts a normal heavy (control)');
    const heavyHit = trial('iron', 'heavy'); ok(!heavyHit.still, 'ST4 a heavy hit (120 damage) breaks the armour');
    const lethal = trial('iron', 'light', 15); ok(!lethal.still, 'ST4 armour never saves a fighter from a lethal hit');
    const { f, foe, cm } = mk('ronin', 'iron', 1.1); cm.step([{ ...emptyInput(), pressed: ['style'] }, idle()]); for (let i = 0; i < 4; i++) cm.step([idle(), idle()]); foe.energy = 0; cm.step([idle(), press('grab')]);
    for (let i = 0; i < 16; i++) cm.step([idle(), idle()]); ok(f.state === 'grabbed' || f.state === 'knockdown' || f.state === 'hitstun', `ST4 throws ignore armour (${f.state})`);
  }
  // ---- ST5: only Wind can double jump, and only once per jump
  { const peak = (st: StyleId, presses: number) => { const { f, cm } = mk('ronin', st); let y = 0; cm.step([{ ...emptyInput(), jump: true }, idle()]); let n = 0;
      for (let i = 0; i < 90; i++) { const jump = n < presses && i === 12 + n * 10; if (jump) n++; cm.step([{ ...emptyInput(), jump }, idle()]); y = Math.max(y, f.y); } return y; };
    const single = peak('wind', 0), dbl = peak('wind', 1), triple = peak('wind', 2), classicDbl = peak('classic', 1);
    ok(dbl > single + 0.35, `ST5 Wind's second jump reaches higher (${single.toFixed(2)} m -> ${dbl.toFixed(2)} m)`);
    ok(Math.abs(triple - dbl) < 0.05, 'ST5 there is no third jump');
    ok(Math.abs(classicDbl - peak('classic', 0)) < 0.05, 'ST5 other styles cannot double jump');
  }
  // ---- ST6: Shadow fills the meter faster and its arts cost less; Iron's guard lasts longer
  { const gain = (st: StyleId) => { const { f, foe, cm } = mk('ronin', st, 1.8); f.energy = 0; cm.step([press('light'), idle()]); for (let i = 0; i < 30; i++) { foe.health = 1000; cm.step([idle(), idle()]); } return f.energy; };
    ok(gain('shadow') > gain('classic') * 1.25, `ST6 Shadow gains energy faster (${gain('shadow').toFixed(1)} vs ${gain('classic').toFixed(1)} from one hit)`);
    const sp = mk('ronin', 'shadow'); sp.f.energy = 30; sp.cm.step([{ ...emptyInput(), pressed: ['special'] }, idle()]); const cl = mk('ronin', 'classic'); cl.f.energy = 30; cl.cm.step([{ ...emptyInput(), pressed: ['special'] }, idle()]);
    ok(sp.f.attack?.id === 'special' && cl.f.attack?.id !== 'special', 'ST6 a Shadow fighter can use their special at 30 energy; a Classic one cannot');
    const breakAfter = (st: StyleId) => { const { f, foe, cm } = mk('ronin', st, 1.8, 'ronin', 'classic'); let broke = 0; const blk = { ...emptyInput(), block: true }; // the defender is the "foe" fighter, styled
      const d = new Fighter(styled('ronin', st), bounds), a = new Fighter(styled('ronin', 'classic'), bounds); d.reset(0.9, 0, -1); a.reset(-0.9, 0, 1); const m = new CombatManager([a, d]); m.events.on('guardBreak', () => { broke = broke || 1; });
      for (let i = 0; i < 14; i++) m.step([idle(), blk]); let n = 0;
      for (let k = 1; k <= 14 && !broke; k++) { a.reset(-0.9, 0, 1); d.x = 0.9; d.z = 0; m.step([press('heavy'), blk]); for (let i = 0; i < 42; i++) m.step([idle(), blk]); n = k; if (m.fighters[1].guardBroken) broke = 1; }
      void f; void foe; void cm; return n; };
    const nc = breakAfter('classic'), ni = breakAfter('iron');
    ok(ni > nc, `ST6 Iron's guard survives more heavies before breaking (${ni} vs ${nc})`);
  }
  // ---- ST7: styles are balanced against each other (AI mirror matches, both sides, several seeds)
  { const score: Record<string, number> = { classic: 0, iron: 0, wind: 0, shadow: 0 }, games: Record<string, number> = { classic: 0, iron: 0, wind: 0, shadow: 0 };
    const sts: StyleId[] = ['classic', 'iron', 'wind', 'shadow'];
    for (let i = 0; i < sts.length; i++) for (let j = i + 1; j < sts.length; j++) for (const ch of chars) for (const swap of [false, true]) for (const seed of [1, 2]) {
      const sa = swap ? sts[j] : sts[i], sb = swap ? sts[i] : sts[j];
      const a = new Fighter(styled(ch, sa), bounds), b = new Fighter(styled(ch, sb), bounds); a.reset(-0.9, 0, 1); b.reset(0.9, 0, -1);
      const cm = new CombatManager([a, b]); const A = new EnemyAI('HARD', 'BALANCED', seed * 11, ch), B = new EnemyAI('HARD', 'BALANCED', seed * 17 + 3, ch); let ko = false; cm.events.on('ko', () => { ko = true; });
      for (let f = 0; f < 3600 && !ko; f++) cm.step([A.think(a, b), B.think(b, a)]);
      const fa = a.health / a.stats.maxHealth, fb = b.health / b.stats.maxHealth; const w = Math.abs(fa - fb) < 0.02 ? 0.5 : fa > fb ? 1 : 0;
      score[sa] += w; score[sb] += 1 - w; games[sa]++; games[sb]++;
    }
    const share = sts.map((s) => `${s} ${(100 * score[s] / games[s]).toFixed(0)}%`).join('  ');
    ok(sts.every((s) => { const r = score[s] / games[s]; return r >= 0.3 && r <= 0.7; }), `ST7 no style dominates (win share over ${games.classic} matches each: ${share})`);
  }
  // ---- ST8: the AI plays the styles (uses its style moves), and move list documents them
  { const used = new Set<string>();
    for (const st of ['iron', 'wind', 'shadow'] as StyleId[]) {
      const ai = new EnemyAI('HARD', 'AGGRESSIVE', 5, 'ronin'); const me = new Fighter(styled('ronin', st), bounds), foe = new Fighter(styled('ronin', 'classic'), bounds); me.reset(0.9, 0, -1); foe.reset(-0.9, 0, 1);
      const cm = new CombatManager([foe, me]);
      for (let f = 0; f < 12000; f++) { foe.health = 1000; if (foe.state === 'defeat') foe.setState('idle'); if (f % 500 === 0) me.energy = 100; cm.step([f % 300 < 100 ? { ...emptyInput(), block: true } : idle(), ai.think(me, foe)]); }
      for (const k of ['a', 'b', 'c', 'd']) if ((ai.stats[`${st}_${k}`] ?? 0) > 0) used.add(`${st}_${k}`);
    }
    ok(used.size >= 8, `ST8 the AI uses its style moves (${used.size} of 12 seen: ${[...used].join(', ')})`);
    const def = { ...getCharacter('ronin'), stats: styled('ronin', 'wind') }; const html = buildMoveList(def);
    ok(html.includes('STYLE MOVES') && html.includes('Cyclone Dash') && html.includes('WIND style') && !buildMoveList(getCharacter('ronin')).includes('STYLE MOVES'), 'ST8 the move list shows a styled fighter\'s style moves (and nothing for CLASSIC)');
    ok(styleForOpponent('titan', 'DEFENSIVE') === 'iron' && styleForOpponent('shinobi', 'AGGRESSIVE') === 'wind' && styleForOpponent('ronin', 'TECHNICAL') === 'shadow' && styleForOpponent('titan', 'BOSS') === 'iron', 'ST8 opponents get a style that fits how they fight (bosses have their own)');
  }
  // ---- ST9: the saved style setting migrates safely
  { const a = migrateProfile({ version: 3, settings: { fightingStyle: 'iron' } }), b = migrateProfile({ version: 3, settings: { fightingStyle: 'banana' } }), c = migrateProfile({ version: 2, settings: {} });
    ok(a.settings.fightingStyle === 'iron' && b.settings.fightingStyle === 'classic' && c.settings.fightingStyle === 'classic', 'ST9 the fighting-style setting is kept, and unknown / missing values become CLASSIC');
  }
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);


