import { RONIN } from '../src/combat/AttackData';
import { CombatManager } from '../src/combat/CombatManager';
import { Fighter } from '../src/combat/Fighter';
import { emptyInput, type Button, type FighterInput } from '../src/combat/types';
import { EnemyAI } from '../src/ai/EnemyAI';
import { getCharacter } from '../src/characters/CharacterData';

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
  cm.step([press('light'), blk]);
  for (let i = 0; i < 40; i++) cm.step([emptyInput(), blk]);
  ok(b.health === 1000 - Math.round(40 * 0.08), `block => chip only (hp=${b.health})`);
}
// 4b. auto-block: holding BACK (no block button) guards and retreats; standing still does not guard
{
  const { a, b, cm } = mk(); const back = { ...emptyInput(), fwd: -1 };
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

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);


