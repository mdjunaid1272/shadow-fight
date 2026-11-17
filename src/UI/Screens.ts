import type { Difficulty } from '../ai/EnemyAI';
import { CHAPTERS, STORY, type ModeId } from '../core/Modes';
import { CHARACTERS, type CharacterDef } from '../characters/CharacterData';
import { ACHIEVEMENTS, DAILY_POOL, WEEKLY_POOL, canClaimDaily, dailyRewardAmount, missionComplete, missionDef } from '../progression/Missions';
import { MAX_LEVEL, characterLockReason, xpForNextLevel, type Profile } from '../progression/Profile';
import { ITEMS, MAX_WEAPON_TIER, dailyOffers, fitsCharacter, isEquipped, isPurchasable, owns, priceOf, weaponUpgradeCost, type StoreCategory, type StoreItem } from '../progression/StoreData';
import { PRODUCTS } from '../monetization/PurchaseManager';
import { el } from './HUD';

type Price = { gold?: number; gems?: number };
const priceHtml = (p: Price, full?: Price): string => {
  const one = (v: number | undefined, cls: string, sym: string, f?: number) =>
    v === undefined ? '' : `<span class="price ${cls}">${f !== undefined && f !== v ? `<span class="old">${f}</span>` : ''}${sym} ${v}</span>`;
  return [one(p.gold, '', '&#9679;', full?.gold), one(p.gems, 'gem', '&#9670;', full?.gems)].filter(Boolean).join(' ') || '<span class="price">FREE</span>';
};
const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`;

// ---------------------------------------------------------------- contexts (all behaviour is injected by Flow)
export interface HomeCtx {
  profile: Profile; difficulty: Difficulty; arena: string; arenas: Array<{ id: string; name: string }>;
  playerName: string; claimableMissions: number; dailyAvailable: boolean;
  onMode: (m: ModeId) => void; onNav: (n: 'characters' | 'weapons' | 'store' | 'missions' | 'profile' | 'settings') => void;
  onDifficulty: (d: Difficulty) => void; onArena: (id: string) => void; onDaily: () => void;
}
export interface StoryCtx { profile: Profile; onPick: (index: number) => void; onBack: () => void }
export interface StoreCtx {
  profile: Profile; char: string; tab?: StoreCategory | 'gems'; iapAvailable: boolean; iapTest: boolean; iapProvider: string;
  buy: (id: string) => { ok: boolean; reason?: string };
  equip: (char: string, id: string) => { ok: boolean; equipped?: boolean; reason?: string };
  buyProduct: (sku: string) => Promise<{ status: string; message?: string }>;
  onPreview: (item: StoreItem | null, char: string) => void;
  onBack: () => void;
}
export interface WeaponsCtx { profile: Profile; upgrade: (kind: string) => { ok: boolean; reason?: string }; onPreview: (charId: string) => void; onBack: () => void }
export interface MissionsCtx {
  profile: Profile; adsAvailable: boolean;
  claim: (id: string) => boolean; claimDaily: (double: boolean) => Promise<boolean>; onBack: () => void;
}
export interface ProfileCtx { profile: Profile; onBack: () => void }
export interface SettingsCtx {
  profile: Profile; touch: boolean; adsProvider: string; iapProvider: string;
  onChange: () => void; onReset: () => void; onFullscreen: () => void; onBack: () => void;
}
export interface PauseCtx { onResume: () => void; onQuit: () => void; onSettings: () => void }

/** Renders every full-screen menu. Contains no game rules - everything is injected through contexts. */
export class Screens {
  private current: HTMLElement | null = null;
  constructor(private host: HTMLElement) {}

  clear(): void { this.current?.remove(); this.current = null; }
  get open(): boolean { return !!this.current; }

  private mount(cls = ''): HTMLElement {
    this.clear();
    const s = el('div', `screen ${cls}`); this.host.append(s); this.current = s; return s;
  }

  private header(title: string, profile: Profile, onBack: () => void): HTMLElement {
    const h = el('div', 'sc-head');
    const back = el('button', 'btn', '<span>BACK</span>'); back.onclick = onBack;
    h.append(back, el('h2', 'title', title), el('div', 'grow'), this.wallet(profile));
    return h;
  }
  private wallet(p: Profile): HTMLElement {
    const w = el('div', 'wallet'); w.style.position = 'static';
    w.innerHTML = `<span class="gold">&#9679; ${p.gold}</span><span class="gem">&#9670; ${p.gems}</span>`; return w;
  }

  toast(msg: string): void {
    const t = el('div', 'toast', msg); this.host.append(t); window.setTimeout(() => t.remove(), 2200);
  }

  confirm(title: string, html: string, yes = 'CONFIRM', no = 'CANCEL'): Promise<boolean> {
    return new Promise((resolve) => {
      const m = el('div', 'modal'); const box = el('div', 'box', `<h3>${title}</h3><p>${html}</p>`);
      const row = el('div', 'btnrow'); row.style.marginTop = '12px';
      const n = el('button', 'btn', `<span>${no}</span>`); const y = el('button', 'btn primary', `<span>${yes}</span>`);
      const done = (v: boolean) => { m.remove(); resolve(v); };
      n.onclick = () => done(false); y.onclick = () => done(true);
      row.append(n, y); box.append(row); m.append(box); this.host.append(m); y.focus();
    });
  }

  // ---------------------------------------------------------------- home
  home(c: HomeCtx): void {
    const s = this.mount('home');
    const p = c.profile;
    const w = el('div', 'wallet', `<span class="gold">&#9679; ${p.gold}</span><span class="gem">&#9670; ${p.gems}</span><span class="lvl">${c.playerName} LV ${p.characters[p.settings.lastCharacter]?.level ?? 1}</span>`);
    s.append(w);
    if (c.dailyAvailable) {
      const d = el('button', 'mini', '&#127873; DAILY REWARD'); d.style.cssText = 'position:absolute;top:14px;left:18px;'; d.onclick = c.onDaily; s.append(d);
    }
    s.append(el('h1', 'logo', 'SHADOW<br>CLASH'), el('div', 'tag', 'THE ART OF COMBAT. THE POWER OF SHADOWS.'));

    const modes = el('div', 'modes');
    for (const [id, label] of [['duel', 'DUEL'], ['story', 'STORY'], ['tournament', 'TOURNAMENT'], ['survival', 'SURVIVAL'], ['training', 'TRAINING']] as const) {
      const b = el('button', 'btn' + (id === 'duel' ? ' primary' : ''), `<span>${label}</span>`); b.onclick = () => c.onMode(id); modes.append(b);
    }
    const diff = el('div', 'btnrow small');
    (['EASY', 'NORMAL', 'HARD'] as Difficulty[]).forEach((d) => {
      const b = el('button', 'btn' + (d === c.difficulty ? ' sel' : ''), `<span>${d}</span>`);
      b.onclick = () => { c.onDifficulty(d); diff.querySelectorAll('.btn').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); };
      diff.append(b);
    });
    const arenas = el('div', 'btnrow small');
    for (const a of c.arenas) {
      const b = el('button', 'btn' + (a.id === c.arena ? ' sel' : ''), `<span>${a.name}</span>`);
      b.onclick = () => { c.onArena(a.id); arenas.querySelectorAll('.btn').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); };
      arenas.append(b);
    }
    const navs = el('div', 'navs');
    for (const [id, label] of [['characters', 'CHARACTERS'], ['weapons', 'WEAPONS'], ['store', 'STORE'], ['missions', 'MISSIONS'], ['profile', 'PROFILE'], ['settings', 'SETTINGS']] as const) {
      const b = el('button', 'btn', `<span>${label}</span>`); b.onclick = () => c.onNav(id);
      if (id === 'missions' && c.claimableMissions > 0) b.append(el('span', 'badge', String(c.claimableMissions)));
      navs.append(b);
    }
    s.append(modes, diff, arenas, navs);
    s.append(el('div', 'controls-card', '<b>MOVE</b> A / D &nbsp; <b>JUMP</b> W &nbsp; <b>BLOCK</b> S &nbsp; <b>SIDESTEP</b> Q / E &nbsp; <b>LIGHT</b> J &nbsp; <b>HEAVY</b> K &nbsp; <b>KICK</b> L &nbsp; <b>SPECIAL</b> U &nbsp; <b>ULTIMATE</b> I &nbsp; <b>PAUSE</b> Esc &nbsp; <b>FULLSCREEN</b> F'));
  }

  // ---------------------------------------------------------------- story map
  storyMap(c: StoryCtx): void {
    const s = this.mount();
    s.append(this.header(`STORY &middot; ${c.profile.story.cleared}/15`, c.profile, c.onBack));
    const sc = el('div', 'scroll');
    CHAPTERS.forEach((ch, ci) => {
      const box = el('div', 'story-ch'); box.append(el('h3', '', `CHAPTER ${ci + 1}: ${ch.title.toUpperCase()}`), el('p', '', ch.blurb));
      const grid = el('div', 'encs');
      for (let k = 0; k < 3; k++) {
        const idx = ci * 3 + k, e = STORY[idx];
        const cleared = idx < c.profile.story.cleared, locked = idx > c.profile.story.cleared, next = idx === c.profile.story.cleared;
        const enemy = CHARACTERS.find((x) => x.id === e.enemyId)?.name ?? e.enemyId.toUpperCase();
        const b = el('button', `enc${e.boss ? ' boss' : ''}${cleared ? ' cleared' : ''}${locked ? ' locked' : ''}${next ? ' next' : ''}`,
          `<b>${e.title}${cleared ? '<span class="st">&#10003;</span>' : locked ? '<span class="st">&#128274;</span>' : ''}</b><small>vs ${e.displayName ?? enemy} &middot; ${e.difficulty}${e.boss ? ' &middot; BOSS' : ''}</small>`);
        if (!locked) b.onclick = () => c.onPick(idx); else b.disabled = true;
        grid.append(b);
      }
      box.append(grid); sc.append(box);
    });
    s.append(sc);
  }

  // ---------------------------------------------------------------- store
  store(c: StoreCtx): void {
    const s = this.mount('clear');
    let tab: StoreCategory | 'gems' = c.tab ?? 'daily', char = c.char, sel: StoreItem | null = null;
    const render = () => {
      s.innerHTML = '';
      const p = c.profile;
      s.append(this.header('STORE', p, c.onBack));
      const tabs = el('div', 'tabs');
      for (const [id, label] of [['daily', 'DAILY OFFERS'], ['characters', 'CHARACTERS'], ['skins', 'SKINS'], ['armor', 'ARMOR'], ['weapons', 'WEAPONS'], ['effects', 'EFFECTS'], ['gems', 'GEMS']] as const) {
        const t = el('button', 'tab' + (tab === id ? ' sel' : ''), label); t.onclick = () => { tab = id; sel = null; c.onPreview(null, char); render(); }; tabs.append(t);
      }
      s.append(tabs);
      if (tab !== 'gems' && tab !== 'characters') {
        const pick = el('div', 'charpick', '<small>DRESS</small>');
        for (const ch of CHARACTERS) {
          const b = el('button', 'tab' + (ch.id === char ? ' sel' : ''), ch.name); b.onclick = () => { char = ch.id; sel = null; c.onPreview(null, char); render(); }; pick.append(b);
        }
        s.append(pick);
      }
      const body = el('div', 'body'); const list = el('div', 'scroll'); const panel = el('div', 'panel');
      body.append(list, panel); s.append(body);

      if (tab === 'gems') { this.gemsTab(c, list, panel, render); return; }

      let items: StoreItem[];
      if (tab === 'daily') items = dailyOffers(p);
      else items = ITEMS.filter((i) => i.category === tab && (tab === 'characters' || fitsCharacter(i, char)));
      if (tab === 'daily') list.append(el('div', 'note', 'Three rotating offers, 30% off. They refresh every day.'));
      const grid = el('div', 'grid');
      for (const it of items) {
        const owned = owns(p, it.id) || (it.unlocksCharacter ? characterLockReason(p, it.unlocksCharacter) === null : false);
        const eq = isEquipped(p, char, it.id);
        const cls = `icard${sel?.id === it.id ? ' sel' : ''}${eq ? ' equipped' : owned ? ' owned' : ''}`;
        const price = priceOf(p, it);
        const tag = eq ? 'EQUIPPED' : owned ? 'OWNED' : it.reward ? 'STORY' : '';
        const b = el('button', cls, `${tag ? `<span class="tagx">${tag}</span>` : ''}<b>${it.name}</b><small>${it.character ? it.character.toUpperCase() : tab === 'characters' ? 'CHARACTER' : 'ALL FIGHTERS'}</small>${owned || it.reward ? '' : priceHtml(price, it.price)}`);
        b.onclick = () => { sel = it; c.onPreview(it.category === 'characters' ? null : it, it.character ?? char); if (it.character) char = it.character; renderPanel(); list.querySelectorAll('.icard').forEach((n) => n.classList.remove('sel')); b.classList.add('sel'); };
        grid.append(b);
      }
      list.append(grid);
      if (!items.length) list.append(el('div', 'note', 'Nothing here for this fighter yet.'));

      const renderPanel = () => {
        panel.innerHTML = '';
        if (!sel) { panel.append(el('div', 'note', 'Select an item to preview it on your fighter.')); return; }
        const it = sel;
        const owned = owns(p, it.id) || (it.unlocksCharacter ? characterLockReason(p, it.unlocksCharacter) === null : false);
        const eq = isEquipped(p, char, it.id);
        panel.append(el('h2', 'title', it.name), el('div', 'note', it.desc));
        if (it.character) panel.append(el('div', 'note', `Fits: ${it.character.toUpperCase()}`));
        panel.append(el('div', 'note warn', it.category === 'characters' ? 'Characters can also be unlocked by winning matches.' : 'Cosmetic only - never changes combat.'));
        const row = el('div', 'btnrow'); row.style.justifyContent = 'flex-start';
        if (it.category === 'characters') {
          if (owned) row.append(el('div', 'note', 'Unlocked'));
          else row.append(this.actionBtn(`BUY ${priceHtml(priceOf(p, it), it.price)}`, true, async () => { if (await this.confirm('CONFIRM PURCHASE', `Unlock <b>${it.name}</b>?`, 'BUY')) { const r = c.buy(it.id); this.toast(r.ok ? `Unlocked ${it.name}!` : r.reason ?? 'Failed'); render(); } }));
        } else if (owned) {
          row.append(this.actionBtn(eq ? 'UNEQUIP' : 'EQUIP', true, () => { const r = c.equip(char, it.id); this.toast(r.ok ? (r.equipped ? 'Equipped' : 'Unequipped') : r.reason ?? 'Failed'); c.onPreview(null, char); render(); }));
        } else if (it.reward) {
          row.append(el('div', 'note warn', 'Earn this by progressing through the Story.'));
        } else if (isPurchasable(it)) {
          row.append(this.actionBtn(`BUY ${priceHtml(priceOf(p, it), it.price)}`, true, async () => { if (await this.confirm('CONFIRM PURCHASE', `Buy <b>${it.name}</b> for ${priceHtml(priceOf(p, it), it.price)}?`, 'BUY')) { const r = c.buy(it.id); this.toast(r.ok ? `Bought ${it.name}!` : r.reason ?? 'Failed'); render(); } }));
        }
        panel.append(row);
      };
      renderPanel();
    };
    render();
  }

  private actionBtn(html: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'btn' + (primary ? ' primary' : ''), `<span>${html}</span>`); b.onclick = onClick; return b;
  }

  private gemsTab(c: StoreCtx, list: HTMLElement, panel: HTMLElement, rerender: () => void): void {
    list.append(el('div', 'note', c.iapAvailable
      ? (c.iapTest ? '<b>TEST MODE</b> - purchases are a development mock, no real money is charged.' : 'Purchases are processed by your store account.')
      : 'In-app purchases are not available in this build (no payment provider configured). Gems are also earned by levelling up and completing missions.'));
    for (const p of PRODUCTS) {
      const row = el('div', 'row');
      row.append(el('div', 'grow', `<b>${p.title}</b><small>${p.desc}</small>`));
      const b = el('button', 'mini', `${p.price}${c.iapTest ? ' (TEST)' : ''}`); b.disabled = !c.iapAvailable;
      b.onclick = async () => { const r = await c.buyProduct(p.sku); this.toast(r.status === 'success' ? 'Purchase complete' : r.message ?? (r.status === 'cancelled' ? 'Cancelled' : 'Unavailable')); rerender(); };
      row.append(b); list.append(row);
    }
    panel.append(el('div', 'note', 'Cosmetics never affect combat, so gems cannot buy an advantage.'));
  }

  // ---------------------------------------------------------------- weapons
  weapons(c: WeaponsCtx): void {
    const s = this.mount('clear');
    let selId = CHARACTERS[0].id;
    const render = () => {
      s.innerHTML = '';
      s.append(this.header('WEAPONS', c.profile, c.onBack));
      const body = el('div', 'body'); const list = el('div', 'scroll'); const panel = el('div', 'panel');
      body.append(list, panel); s.append(body);
      for (const ch of CHARACTERS) {
        const tier = c.profile.weaponTier[ch.weapon] ?? 1;
        const b = el('button', 'icard' + (ch.id === selId ? ' sel' : ''), `<b>${ch.weaponName}</b><small>${ch.name} &middot; TIER ${tier}/${MAX_WEAPON_TIER}</small>`);
        b.style.cssText = 'display:block;width:100%;margin-bottom:8px;';
        b.onclick = () => { selId = ch.id; render(); }; list.append(b);
      }
      const ch = CHARACTERS.find((x) => x.id === selId) as CharacterDef;
      const a = ch.stats.attacks, tier = c.profile.weaponTier[ch.weapon] ?? 1;
      const progress = c.profile.characters[ch.id];
      panel.append(el('h2', 'title', ch.weaponName.toUpperCase()), el('div', 'note', `Wielded by ${ch.name}. ${ch.style}.`));
      panel.append(el('div', 'sgrid', `<div><b>${a.light1.damage}</b>LIGHT DMG</div><div><b>${a.heavy.damage}</b>HEAVY DMG</div><div><b>${a.light1.reach.toFixed(2)}</b>REACH</div><div><b>${a.light1.startup}f</b>LIGHT STARTUP</div>`));
      panel.append(el('div', 'note', `MASTERY: ${ch.name} level ${progress?.level ?? 1}`));
      panel.append(el('div', 'note', `Glow tier ${tier}/${MAX_WEAPON_TIER}`), (() => { const pb = el('div', 'pbar'); pb.innerHTML = `<i style="width:${(tier / MAX_WEAPON_TIER) * 100}%"></i>`; return pb; })());
      panel.append(el('div', 'note warn', 'Upgrades are cosmetic (weapon glow). They never change damage, speed or reach.'));
      const up = el('button', 'btn primary', `<span>${tier >= MAX_WEAPON_TIER ? 'MAX TIER' : `UPGRADE &#9679; ${weaponUpgradeCost(tier)}`}</span>`);
      up.disabled = tier >= MAX_WEAPON_TIER;
      up.onclick = () => { const r = c.upgrade(ch.weapon); this.toast(r.ok ? 'Weapon upgraded!' : r.reason ?? 'Failed'); render(); };
      const row = el('div', 'btnrow'); row.style.justifyContent = 'flex-start'; row.append(up); panel.append(row);
      c.onPreview(ch.id);
    };
    render();
  }

  // ---------------------------------------------------------------- missions & achievements
  missions(c: MissionsCtx): void {
    const s = this.mount();
    let tab: 'daily' | 'weekly' | 'ach' = 'daily';
    const render = () => {
      s.innerHTML = '';
      const p = c.profile;
      s.append(this.header('MISSIONS', p, c.onBack));
      const count = (set: Profile['missions']['daily']) => set.list.filter((m) => missionComplete(m) && !m.claimed).length;
      const tabs = el('div', 'tabs');
      for (const [id, label, badge] of [['daily', 'DAILY', count(p.missions.daily)], ['weekly', 'WEEKLY', count(p.missions.weekly)], ['ach', 'ACHIEVEMENTS', 0]] as const) {
        const t = el('button', 'tab' + (tab === id ? ' sel' : ''), `${label}${badge ? `<span class="badge">${badge}</span>` : ''}`); t.onclick = () => { tab = id; render(); }; tabs.append(t);
      }
      s.append(tabs);
      const list = el('div', 'scroll'); s.append(list);
      if (tab === 'daily') {
        const r = dailyRewardAmount(p.dailyReward.streak + 1), can = canClaimDaily(p);
        const row = el('div', 'row' + (can ? '' : ' done'));
        row.append(el('div', 'grow', `<b>Daily login reward</b><small>Streak ${p.dailyReward.streak} &middot; next: &#9679; ${r.gold}${r.gems ? ` &#9670; ${r.gems}` : ''}</small>`));
        const b = el('button', 'mini', can ? 'CLAIM' : 'CLAIMED'); b.disabled = !can; b.onclick = async () => { await c.claimDaily(false); render(); };
        row.append(b);
        if (c.adsAvailable && can) { const b2 = el('button', 'mini alt', 'CLAIM x2 (AD)'); b2.onclick = async () => { await c.claimDaily(true); render(); }; row.append(b2); }
        list.append(row);
      }
      if (tab === 'daily' || tab === 'weekly') {
        const set = tab === 'daily' ? p.missions.daily : p.missions.weekly;
        for (const m of set.list) {
          const def = missionDef(m.id); if (!def) continue;
          const done = missionComplete(m);
          const row = el('div', 'row' + (m.claimed ? ' done' : ''));
          row.append(el('div', 'grow', `<b>${def.title}</b><small>${Math.min(m.progress, def.target)} / ${def.target} &middot; reward &#9679; ${def.reward.gold}${def.reward.gems ? ` &#9670; ${def.reward.gems}` : ''}</small><div class="pbar"><i style="width:${pct(m.progress, def.target)}"></i></div>`));
          const b = el('button', 'mini', m.claimed ? 'CLAIMED' : 'CLAIM'); b.disabled = m.claimed || !done;
          b.onclick = () => { if (c.claim(m.id)) this.toast(`+${def.reward.gold} gold${def.reward.gems ? `, +${def.reward.gems} gems` : ''}`); render(); };
          row.append(b); list.append(row);
        }
        list.append(el('div', 'note', tab === 'daily' ? 'Daily missions refresh at midnight.' : 'Weekly missions refresh every Monday.'));
        void DAILY_POOL; void WEEKLY_POOL;
      } else {
        const got = Object.keys(p.achievements).length;
        list.append(el('div', 'note', `${got} / ${ACHIEVEMENTS.length} unlocked`));
        for (const a of ACHIEVEMENTS) {
          const has = !!p.achievements[a.id];
          list.append(el('div', 'row' + (has ? ' done' : ' locked'), `<div class="grow"><b>${has ? '&#10003; ' : ''}${a.title}</b><small>${a.desc} &middot; reward &#9679; ${a.reward.gold}${a.reward.gems ? ` &#9670; ${a.reward.gems}` : ''}</small></div>`));
        }
      }
    };
    render();
  }

  // ---------------------------------------------------------------- profile
  profile(c: ProfileCtx): void {
    const s = this.mount();
    const p = c.profile;
    s.append(this.header('PROFILE', p, c.onBack));
    const sc = el('div', 'scroll'); s.append(sc);
    const rate = p.stats.matches ? Math.round((p.stats.wins / p.stats.matches) * 100) : 0;
    sc.append(el('div', 'sgrid', `<div><b>${p.stats.matches}</b>MATCHES</div><div><b>${p.stats.wins}</b>WINS</div><div><b>${rate}%</b>WIN RATE</div><div><b>${p.stats.maxCombo}</b>BEST COMBO</div><div><b>${p.stats.damageDealt}</b>TOTAL DAMAGE</div><div><b>${p.story.cleared}/15</b>STORY</div><div><b>${p.records.tournamentWins}</b>TOURNAMENTS WON</div><div><b>${p.records.survivalBest}</b>SURVIVAL BEST</div><div><b>${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}</b>ACHIEVEMENTS</div><div><b>${p.inventory.length}</b>ITEMS OWNED</div>`));
    sc.append(el('h3', '', 'CHARACTER MASTERY')); (sc.lastChild as HTMLElement).style.cssText = 'font-weight:400;letter-spacing:.1em;color:var(--amber);margin:10px 0 6px';
    for (const ch of CHARACTERS) {
      const cp = p.characters[ch.id] ?? { xp: 0, level: 1, wins: 0, losses: 0 };
      const lock = characterLockReason(p, ch.id);
      const need = cp.level >= MAX_LEVEL ? 1 : xpForNextLevel(cp.level);
      sc.append(el('div', 'row' + (lock ? ' locked' : ''), `<div class="grow"><b>${ch.name} &middot; LV ${cp.level}</b><small>${lock ? 'Locked' : `${cp.wins} wins / ${cp.losses} losses`} &middot; ${ch.weaponName}</small><div class="pbar"><i style="width:${cp.level >= MAX_LEVEL ? 100 : (cp.xp / need) * 100}%"></i></div></div>`));
    }
  }

  // ---------------------------------------------------------------- settings
  settings(c: SettingsCtx): void {
    const s = this.mount();
    const st = c.profile.settings;
    s.append(this.header('SETTINGS', c.profile, c.onBack));
    const sc = el('div', 'scroll'); s.append(sc);
    const slider = (label: string, value: number, min: number, max: number, step: number, on: (v: number) => void) => {
      const d = el('div', 'slider', `<span>${label}</span>`); const i = el('input'); i.type = 'range'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value);
      i.oninput = () => { on(Number(i.value)); c.onChange(); }; d.append(i); sc.append(d);
    };
    slider('MUSIC', st.musicVol, 0, 1, 0.05, (v) => { st.musicVol = v; });
    slider('SOUND FX', st.sfxVol, 0, 1, 0.05, (v) => { st.sfxVol = v; });
    if (c.touch) slider('TOUCH BUTTON SIZE', st.touchScale, 0.7, 1.5, 0.05, (v) => { st.touchScale = v; });
    const q = el('div', 'slider', '<span>GRAPHICS QUALITY</span>'); const seg = el('div', 'seg');
    for (const v of ['low', 'medium', 'high'] as const) {
      const b = el('button', st.quality === v ? 'sel' : '', v.toUpperCase());
      b.onclick = () => { st.quality = v; seg.querySelectorAll('button').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); c.onChange(); }; seg.append(b);
    }
    q.append(seg); sc.append(q);
    const cs = el('div', 'slider', '<span>CAMERA STYLE</span>'); const cseg = el('div', 'seg');
    for (const [v, label] of [['hybrid', 'HYBRID'], ['calm', 'CALM'], ['dynamic', 'DYNAMIC']] as const) {
      const b = el('button', st.cameraStyle === v ? 'sel' : '', label);
      b.onclick = () => { st.cameraStyle = v; cseg.querySelectorAll('button').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); c.onChange(); }; cseg.append(b);
    }
    cs.append(cseg); sc.append(cs);
    sc.append(el('div', 'note', 'Hybrid (default): elevated 3/4 view that follows smoothly and rotates a little with depth movement. Calm: steady side-on view. Dynamic: the livelier older camera with lead room and strong hit kicks.'));
    slider('CAMERA DISTANCE', st.cameraDistance, 0.8, 1.8, 0.05, (v) => { st.cameraDistance = v; });
    slider('CINEMATIC INTENSITY', st.cinematicIntensity, 0.3, 1.5, 0.05, (v) => { st.cinematicIntensity = v; });
    const cin = el('div', 'slider', '<span>CINEMATIC MOMENTS</span>'); const cb = el('button', 'mini alt', st.cinematics ? 'ON' : 'OFF');
    cb.onclick = () => { st.cinematics = !st.cinematics; cb.textContent = st.cinematics ? 'ON' : 'OFF'; c.onChange(); }; cin.append(cb); sc.append(cin);
    sc.append(el('div', 'note', 'Ultimate / KO / victory camera moves, letterbox bars and slow motion. Turn off for a camera that only ever frames the fight.'));
    const perf = el('div', 'slider', '<span>PERFORMANCE OVERLAY</span>'); const pb = el('button', 'mini alt', st.perfOverlay ? 'ON' : 'OFF');
    pb.onclick = () => { st.perfOverlay = !st.perfOverlay; pb.textContent = st.perfOverlay ? 'ON' : 'OFF'; c.onChange(); }; perf.append(pb); sc.append(perf);
    const fs = el('div', 'slider', '<span>FULLSCREEN</span>'); const fb = el('button', 'mini alt', 'TOGGLE'); fb.onclick = c.onFullscreen; fs.append(fb); sc.append(fs);
    sc.append(el('div', 'note', `Ads: ${c.adsProvider}<br>In-app purchases: ${c.iapProvider}<br>Audio: synthesized placeholder sounds (no recorded assets yet).`));
    const reset = el('div', 'slider', '<span>SAVE DATA</span>'); const rb = el('button', 'mini', 'RESET PROGRESS');
    rb.onclick = async () => {
      if (await this.confirm('RESET PROGRESS?', 'This permanently deletes your gold, gems, levels, unlocks and purchases on this device.', 'CONTINUE') &&
          await this.confirm('ARE YOU SURE?', 'This cannot be undone.', 'DELETE EVERYTHING')) c.onReset();
    };
    reset.append(rb); sc.append(reset);
  }

  // ---------------------------------------------------------------- pause
  pause(c: PauseCtx): void {
    const s = this.mount('home');
    s.append(el('h1', 'logo', 'PAUSED'));
    const row = el('div', 'btnrow');
    const r = el('button', 'btn primary', '<span>RESUME</span>'); r.onclick = c.onResume;
    const st = el('button', 'btn', '<span>SETTINGS</span>'); st.onclick = c.onSettings;
    const q = el('button', 'btn', '<span>QUIT TO MENU</span>'); q.onclick = c.onQuit;
    row.append(r, st, q); s.append(row, el('div', 'controls-card', 'Quitting a fight gives no rewards.'));
    r.focus();
  }
}
