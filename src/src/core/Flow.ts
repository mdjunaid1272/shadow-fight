import type { Difficulty } from '../ai/EnemyAI';
import { ARENAS, getArena } from '../arenas/ArenaRegistry';
import { CHARACTERS, getCharacter } from '../characters/CharacterData';
import { AdManager, TestAdProvider } from '../monetization/AdManager';
import { PurchaseManager, TestPurchaseProvider } from '../monetization/PurchaseManager';
import { ACHIEVEMENTS, canClaimDaily, checkAchievements, claimDaily, claimMission, dayKey, ensureMissions, missionComplete, trackEvent } from '../progression/Missions';
import { applyMatch, characterLockReason } from '../progression/Profile';
import { buyItem, toggleEquip, upgradeWeapon } from '../progression/StoreData';
import { Screens } from '../UI/Screens';
import type { ResultButton } from '../UI/HUD';
import type { Game, MatchSummary } from './Game';
import { ModeManager, type Encounter, type ModeId } from './Modes';

/**
 * Menus, modes and progression glue: decides which screen is showing, starts encounters,
 * applies rewards/missions/achievements after a fight and runs ads/purchases (via their managers).
 * The battle runtime itself lives in Game.
 */
export class Flow {
  readonly screens: Screens;
  readonly modes = new ModeManager();
  readonly ads: AdManager;
  readonly purchases: PurchaseManager;
  private difficulty: Difficulty = 'NORMAL';
  private arena = 'temple';
  private playerId = 'ronin';
  private pauseOpen = false;

  constructor(private g: Game, private host: HTMLElement) {
    this.screens = new Screens(host);
    this.ads = new AdManager(() => g.profile);
    this.purchases = new PurchaseManager(() => g.profile);
    const q = new URLSearchParams(location.search);
    if (q.has('testads')) this.ads.setProvider(new TestAdProvider());
    if (q.has('devshop')) this.purchases.setProvider(new TestPurchaseProvider());
    g.onMatchEnd = (s) => this.onMatchEnd(s);
    g.hud.onPause = () => this.pause();
    g.hud.onTrainingExit = () => { g.abortMatch(); this.home(); };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { e.preventDefault(); if (this.pauseOpen) this.resume(); else this.pause(); }
      if (e.code === 'KeyF' && !e.repeat) { /* handled by Fullscreen module */ }
    });
  }

  // ------------------------------------------------------------------ start / home
  start(): void {
    const p = this.g.profile, s = p.settings;
    this.playerId = CHARACTERS.some((c) => c.id === s.lastCharacter) ? s.lastCharacter : 'ronin';
    this.arena = getArena(s.arena).id;
    if (s.difficulty === 'EASY' || s.difficulty === 'NORMAL' || s.difficulty === 'HARD') this.difficulty = s.difficulty;
    if (ensureMissions(p)) this.g.save.save();
    if (this.arena !== this.g.arena.id) this.g.setArena(this.arena);

    const q = new URLSearchParams(location.search);
    // Dev-only cheat for testing the store (compiled out of production builds).
    if (import.meta.env.DEV) { const gold = Number(q.get('gold')) || 0; if (gold > 0) { p.gold += gold; p.gems += Math.floor(gold / 50); } }
    const arenaParam = q.get('arena'); if (arenaParam) { this.arena = getArena(arenaParam).id; this.g.setArena(this.arena); }
    if (q.has('autostart')) { // dev shortcut: ignores character locks
      const c = q.get('autostart'); const char = CHARACTERS.some((x) => x.id === c) ? c! : 'ronin';
      this.beginMode((q.get('mode') as ModeId) || 'duel', char, Number(q.get('idx') ?? 0)); return;
    }
    const screen = q.get('screen');
    if (screen) { this.devScreen(screen); return; }
    if (q.has('select')) { this.home(); this.openSelect('duel'); return; }
    this.home();
  }

  private devScreen(name: string): void {
    this.g.enterMenuView();
    switch (name) {
      case 'store': this.storeScreen(); break;
      case 'missions': this.missionsScreen(); break;
      case 'story': this.storyScreen(); break;
      case 'weapons': this.weaponsScreen(); break;
      case 'profile': this.profileScreen(); break;
      case 'settings': this.settingsScreen(() => this.home()); break;
      case 'characters': this.openSelect('browse'); break;
      default: this.home();
    }
  }

  private persist(): void {
    const st = this.g.profile.settings;
    st.arena = this.arena; st.difficulty = this.difficulty; st.lastCharacter = this.playerId;
    this.g.save.save();
  }

  private claimable(): number {
    const p = this.g.profile;
    return [...p.missions.daily.list, ...p.missions.weekly.list].filter((m) => missionComplete(m) && !m.claimed).length;
  }

  home(): void {
    const p = this.g.profile;
    this.g.enterMenuView();
    if (ensureMissions(p)) this.g.save.save();
    this.screens.home({
      profile: p, difficulty: this.difficulty, arena: this.arena, arenas: ARENAS.map((a) => ({ id: a.id, name: a.name })),
      playerName: getCharacter(this.playerId).name, claimableMissions: this.claimable(), dailyAvailable: canClaimDaily(p),
      onMode: (m) => this.pickMode(m),
      onNav: (n) => this.nav(n),
      onDifficulty: (d) => { this.difficulty = d; this.persist(); },
      onArena: (id) => { this.arena = id; this.g.setArena(id); this.persist(); },
      onDaily: () => void this.claimDailyFlow(),
    });
  }

  private nav(n: 'characters' | 'weapons' | 'store' | 'missions' | 'profile' | 'settings'): void {
    switch (n) {
      case 'characters': this.openSelect('browse'); break;
      case 'weapons': this.weaponsScreen(); break;
      case 'store': this.storeScreen(); break;
      case 'missions': this.missionsScreen(); break;
      case 'profile': this.profileScreen(); break;
      case 'settings': this.settingsScreen(() => this.home()); break;
    }
  }

  // ------------------------------------------------------------------ mode selection
  private pickMode(m: ModeId): void {
    if (m === 'story') this.storyScreen(); else this.openSelect(m);
  }

  private storyScreen(): void {
    this.g.enterMenuView();
    this.screens.storyMap({ profile: this.g.profile, onBack: () => this.home(), onPick: (idx) => this.openSelect('story', idx) });
  }

  private openSelect(mode: ModeId | 'browse', storyIdx = 0): void {
    this.screens.clear();
    this.g.hud.showSelect(CHARACTERS, {
      selected: this.playerId,
      confirmLabel: mode === 'browse' ? 'SELECT' : mode === 'training' ? 'TRAIN' : 'FIGHT',
      onPreview: (id) => this.g.previewCharacter(id),
      onConfirm: (id) => {
        this.g.hud.hideSelect();
        if (mode === 'browse') { this.playerId = id; this.persist(); this.home(); } else this.beginMode(mode, id, storyIdx);
      },
      onBack: () => { this.g.hud.hideSelect(); if (mode === 'story') this.storyScreen(); else this.home(); },
      lockReason: (id) => characterLockReason(this.g.profile, id),
      levelOf: (id) => this.g.profile.characters[id]?.level ?? 1,
      extra: mode === 'browse' ? 'Select your main fighter' : undefined,
    });
  }

  // ------------------------------------------------------------------ encounters
  private beginMode(mode: ModeId, charId: string, storyIdx: number): void {
    this.playerId = charId; this.persist();
    let enc: Encounter;
    switch (mode) {
      case 'story': enc = this.modes.startStory(charId, storyIdx); break;
      case 'tournament': enc = this.modes.startTournament(charId, this.difficulty); break;
      case 'survival': enc = this.modes.startSurvival(charId, this.difficulty); break;
      case 'training': enc = this.modes.startTraining(charId, this.arena); break;
      default: enc = this.modes.startDuel(charId, this.difficulty, this.arena);
    }
    this.run(enc);
  }

  private tag(e: Encounter): string {
    switch (this.modes.mode) {
      case 'story': return `STORY ${Math.floor((e.storyIndex ?? 0) / 3) + 1}-${((e.storyIndex ?? 0) % 3) + 1}`;
      case 'tournament': return e.title;
      case 'survival': return `WAVE ${this.modes.waveNumber}`;
      case 'training': return 'TRAINING';
      default: return 'DUEL';
    }
  }

  private run(e: Encounter): void {
    this.screens.clear(); this.g.hud.hideSelect(); this.g.hud.hideResult();
    const mode = this.modes.mode;
    this.g.startEncounter({
      playerId: this.playerId, enemyId: e.enemyId, arena: e.arena, difficulty: e.difficulty, behavior: e.behavior,
      healthMult: e.healthMult, roundsToWin: e.roundsToWin, practice: !!e.practice, startHealthFrac: e.startHealthFrac,
      enemyName: e.displayName, enemyPalette: e.palette, boss: e.boss, modeTag: this.tag(e),
      title: mode === 'duel' || mode === 'training' ? undefined : e.title, subtitle: e.subtitle,
    });
  }

  // ------------------------------------------------------------------ after a fight
  private onMatchEnd(s: MatchSummary): void {
    const p = this.g.profile, enc = this.modes.current, mode = this.modes.mode, charId = this.playerId;
    const applied = applyMatch(p, charId, {
      won: s.won, maxCombo: s.maxCombo, damage: s.damage, roundsWon: s.wins[0], difficulty: enc.difficulty,
      rewardMult: enc.rewardMult, mode, specials: s.specials, perfectDodges: s.perfectDodges, perfectRounds: s.perfectRounds, boss: enc.boss && mode === 'story',
    });
    const outcome = this.modes.finish(s.won, p, s.playerHealthFrac);

    // missions
    trackEvent(p, 'match_played'); if (s.won) { trackEvent(p, 'match_won'); trackEvent(p, `win_with:${charId}`); }
    trackEvent(p, 'combo', s.maxCombo); trackEvent(p, 'damage', Math.round(s.damage));
    trackEvent(p, 'special', s.specials); trackEvent(p, 'perfect_dodge', s.perfectDodges); trackEvent(p, 'perfect_round', s.perfectRounds);
    if (mode === 'story' && s.won && outcome.bonusGold > 0) trackEvent(p, 'story_cleared');
    if (mode === 'story' && s.won && enc.boss) trackEvent(p, 'boss_defeated');
    if (mode === 'survival' && s.won) trackEvent(p, 'survival_wave', this.modes.waveNumber - 1);
    if (outcome.title === 'CHAMPION!') trackEvent(p, 'tournament_won');
    const ach = checkAchievements(p);
    this.persist(); void this.g.save.flush();

    const lines = [...outcome.lines];
    if (outcome.bonusGold) lines.push(`Bonus: +${outcome.bonusGold} gold`);
    for (const it of outcome.rewardItems) lines.push(`NEW ITEM: ${it.name}`);
    for (const a of ach) lines.push(`ACHIEVEMENT: ${a.title}`);

    const buttons: ResultButton[] = [];
    if (this.ads.canShowRewarded(false) && applied.rewards.gold > 0) {
      buttons.push({ label: `DOUBLE REWARDS${this.ads.isTest ? ' (TEST AD)' : ''}`, keepOpen: true, onClick: () => void this.doubleRewards(applied.rewards.gold, applied.rewards.xp) });
    }
    if (outcome.kind === 'continue' && outcome.next) { const nx = outcome.next; buttons.push({ label: `NEXT: ${nx.title}`, primary: true, onClick: () => this.run(nx) }); }
    else if (outcome.kind === 'retry') buttons.push({ label: 'RETRY', primary: true, onClick: () => this.run(this.modes.current) });
    else if (mode === 'duel') buttons.push({ label: 'REMATCH', primary: true, onClick: () => { this.modes.startDuel(charId, this.difficulty, this.arena, enc.enemyId); this.run(this.modes.current); } });
    else if (mode === 'survival' && this.ads.canShowRewarded(false) && this.modes.revives < 1) {
      buttons.push({ label: `REVIVE${this.ads.isTest ? ' (TEST AD)' : ''}`, primary: true, onClick: () => void this.revive() });
    }
    buttons.push({ label: 'MENU', primary: buttons.every((b) => !b.primary), onClick: () => void this.leave() });

    this.g.hud.setVisible(false);
    this.g.hud.showResult({
      title: outcome.title, won: s.won, duration: s.durationSec, maxCombo: s.maxCombo, damage: s.damage, rounds: s.wins,
      sub: mode === 'duel' ? undefined : `${this.tag(enc)} - ROUNDS ${s.wins[0]} - ${s.wins[1]}`, lines,
      rewards: {
        ...applied.rewards, levelsGained: applied.levelsGained, newLevel: applied.newLevel,
        charName: getCharacter(charId).name, unlocked: applied.unlocked.map((id) => getCharacter(id).name),
      },
    }, buttons);
  }

  private async doubleRewards(gold: number, xp: number): Promise<void> {
    if (!(await this.ads.showRewarded('double_reward', this.host, false))) { this.screens.toast('Ad not completed - no bonus'); return; }
    const p = this.g.profile;
    p.gold += gold;
    const cp = (p.characters[this.playerId] ??= { xp: 0, level: 1, wins: 0, losses: 0 });
    cp.xp += xp; // level-ups from the bonus are applied on the next match via addXp thresholds
    this.persist(); void this.g.save.flush(); this.screens.toast(`Bonus: +${gold} gold, +${xp} XP`);
  }

  private async revive(): Promise<void> {
    if (!(await this.ads.showRewarded('revive', this.host, false))) { this.screens.toast('Ad not completed - no revive'); await this.leave(); return; }
    this.run(this.modes.revive());
  }

  /** Back to the menu after a session; may show an interstitial (never in combat). */
  private async leave(): Promise<void> {
    this.g.hud.hideResult(); this.g.hud.setVisible(false);
    await this.ads.sessionEnded(this.host, false); this.g.save.save();
    this.home();
  }

  // ------------------------------------------------------------------ pause
  private pause(): void {
    const g = this.g;
    if (this.pauseOpen || g.match.phase === 'menu' || g.match.phase === 'matchEnd' || this.screens.open) return;
    this.pauseOpen = true; g.setPaused(true);
    this.screens.pause({
      onResume: () => this.resume(),
      onSettings: () => this.settingsScreen(() => this.pause2()),
      onQuit: () => { this.pauseOpen = false; this.screens.clear(); g.abortMatch(); this.home(); },
    });
  }
  private pause2(): void { this.pauseOpen = false; this.pause(); }
  private resume(): void { this.pauseOpen = false; this.screens.clear(); this.g.setPaused(false); }

  // ------------------------------------------------------------------ other screens
  private storeScreen(): void {
    const g = this.g;
    g.previewCharacter(this.playerId);
    this.screens.store({
      profile: g.profile, char: this.playerId, iapAvailable: this.purchases.available, iapTest: this.purchases.isTest, iapProvider: this.purchases.providerName,
      buy: (id) => { const r = buyItem(g.profile, id); if (r.ok) { g.save.save(); void g.save.flush(); } return r; },
      equip: (c, id) => { const r = toggleEquip(g.profile, c, id); if (r.ok) g.save.save(); return r; },
      buyProduct: async (sku) => { const r = await this.purchases.buy(sku, this.host); g.save.save(); void g.save.flush(); return r; },
      onPreview: (item, char) => g.previewCharacter(char, item ?? undefined),
      onBack: () => this.home(),
    });
  }

  private weaponsScreen(): void {
    const g = this.g;
    this.screens.weapons({
      profile: g.profile,
      upgrade: (kind) => { const r = upgradeWeapon(g.profile, kind as never); if (r.ok) { g.save.save(); } return r; },
      onPreview: (id) => g.previewCharacter(id),
      onBack: () => this.home(),
    });
  }

  private missionsScreen(): void {
    const g = this.g, p = g.profile;
    ensureMissions(p);
    this.screens.missions({
      profile: p, adsAvailable: this.ads.canShowRewarded(false),
      claim: (id) => { const r = claimMission(p, id); if (r) { g.save.save(); checkAchievements(p); } return !!r; },
      claimDaily: (double) => this.claimDailyReward(double),
      onBack: () => this.home(),
    });
  }

  private async claimDailyReward(double: boolean): Promise<boolean> {
    const p = this.g.profile;
    if (double && !(await this.ads.showRewarded('daily_bonus', this.host, false))) { this.screens.toast('Ad not completed - no bonus'); return false; }
    const r = claimDaily(p, double ? 2 : 1);
    if (!r) return false;
    this.g.save.save(); void this.g.save.flush();
    this.screens.toast(`Daily reward: +${r.gold} gold${r.gems ? `, +${r.gems} gems` : ''} (day ${r.streak})`);
    return true;
  }

  /** Home-screen daily reward button: offers the optional x2 ad when a provider exists. */
  private async claimDailyFlow(): Promise<void> {
    let double = false;
    if (this.ads.canShowRewarded(false)) double = await this.screens.confirm('DAILY REWARD', 'Watch an ad to double today\'s reward?', 'WATCH AD (x2)', 'CLAIM NORMALLY');
    await this.claimDailyReward(double);
    this.home();
  }

  private profileScreen(): void { this.g.enterMenuView(); this.screens.profile({ profile: this.g.profile, onBack: () => this.home() }); }

  private settingsScreen(back: () => void): void {
    const g = this.g;
    this.screens.settings({
      profile: g.profile, touch: !!g.touch, adsProvider: `${this.ads.providerName}${this.ads.isTest ? ' (TEST)' : ''}`, iapProvider: `${this.purchases.providerName}${this.purchases.isTest ? ' (TEST)' : ''}`,
      onChange: () => { g.applySettings(); g.save.save(); },
      onReset: async () => { await g.save.reset(); location.reload(); },
      onFullscreen: () => { const d = document; if (d.fullscreenElement) void d.exitFullscreen(); else void d.documentElement.requestFullscreen?.().catch(() => undefined); },
      onBack: () => { g.save.save(); back(); },
    });
  }
}

void dayKey; void ACHIEVEMENTS;
