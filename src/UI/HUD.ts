import './hud.css';
import type { CharacterDef } from '../characters/CharacterData';

export interface ResultRewards { xp: number; gold: number; gems: number; levelsGained: number; newLevel: number; charName: string; unlocked: string[] }
export interface ResultStats {
  title: string; won: boolean; duration: number; maxCombo: number; damage: number; rounds: [number, number];
  rewards?: ResultRewards; lines?: string[]; sub?: string;
}
/** keepOpen: the result screen stays up and the button disables itself (e.g. 'double rewards'). */
export interface ResultButton { label: string; primary?: boolean; keepOpen?: boolean; onClick: () => void }

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
};

/** DOM battle HUD, character select and result screen. Contains no game logic. */
export class HUD {
  readonly root = el('div', 'hud');
  private bars: Array<{ fill: HTMLElement; lag: HTMLElement; bar: HTMLElement; energy: HTMLElement; efill: HTMLElement; guard: HTMLElement; gfill: HTMLElement; pips: HTMLElement[] }> = [];
  private timer = el('div', 'timer', '60');
  private combo = el('div', 'combo');
  private banner = el('div', 'banner');
  private bannerH = el('h1'); private bannerP = el('p');
  private select = el('div', 'overlay hidden');
  private result = el('div', 'overlay hidden');
  private fps = el('div', 'fps');
  private perf = el('div', 'perf');
  private camDbg = el('div', 'camdbg');
  private bannerTimer = 0;
  private comboTimer = 0;
  private nameEls: HTMLElement[] = [];
  private muteBtn = el('button', 'mute-btn', 'SOUND ON');
  private pauseBtn = el('button', 'pause-btn', '&#10074;&#10074;');
  private training = el('div', 'training hidden');
  private trainingInfo = el('div', 'tinfo');
  private modeTag = el('div', 'mode-tag');
  private letterEl = el('div', 'letterbox', '<i></i><i></i>');
  private letterT = 0;
  onMute: () => boolean = () => false;
  onPause: () => void = () => {};
  onDummy: (m: 'idle' | 'block' | 'attack' | 'ai') => void = () => {};
  onTrainingReset: () => void = () => {};
  onTrainingExit: () => void = () => {};

  constructor(parent: HTMLElement, names: [string, string]) {
    const top = el('div', 'hud-top');
    for (let i = 0; i < 2; i++) {
      const box = el('div', 'fighter-hud' + (i ? ' right' : ''));
      const nameEl = el('div', 'name'); this.nameEls.push(nameEl); box.append(nameEl);
      const bar = el('div', 'bar'); const lag = el('div', 'lag'); const fill = el('div', 'fill');
      bar.append(lag, fill); box.append(bar);
      const energy = el('div', 'energy'); const efill = el('div', 'fill'); energy.append(efill); box.append(energy);
      const guard = el('div', 'guard'); const gfill = el('div', 'fill'); guard.append(gfill); box.append(guard);
      const pips = [el('div', 'pip'), el('div', 'pip')];
      const rp = el('div', 'round-pips'); rp.style.cssText = `margin-top:8px;${i ? 'justify-content:flex-end' : ''}`; rp.append(...pips); box.append(rp);
      this.bars.push({ fill, lag, bar, energy, efill, guard, gfill, pips });
      top.append(box);
      if (i === 0) { const c = el('div', 'center'); c.append(this.timer, this.modeTag); top.append(c); }
    }
    this.setNames(names);
    this.muteBtn.onclick = () => { this.setMuteLabel(this.onMute()); };
    this.pauseBtn.onclick = () => this.onPause();
    this.combo.innerHTML = '<span class="n">0</span><small>HIT COMBO</small>';
    this.banner.append(this.bannerH, this.bannerP);

    this.training.innerHTML = '<div class="tt">TRAINING</div>';
    this.training.append(this.trainingInfo);
    const dm = el('div', 'dm', '<small>DUMMY</small>');
    for (const [label, mode] of [['IDLE', 'idle'], ['BLOCK', 'block'], ['ATTACK', 'attack'], ['AI', 'ai']] as const) {
      const b = el('button', 'tbtn2', label); b.onclick = () => { dm.querySelectorAll('button').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); this.onDummy(mode); };
      if (mode === 'idle') b.classList.add('sel');
      dm.append(b);
    }
    const reset = el('button', 'tbtn2', 'RESET'); reset.onclick = () => this.onTrainingReset();
    const exit = el('button', 'tbtn2 danger', 'EXIT'); exit.onclick = () => this.onTrainingExit();
    this.training.append(dm, reset, exit);

    const hint = el('div', 'hint', '<b>A/D</b>move <b>W</b>jump <b>Hold back</b>block (tap = parry) <b>C</b>crouch <b>G</b>grab <b>S/Shift</b>walk around <b>Q/E</b>sidestep <b>J</b>light <b>K</b>heavy <b>L</b>kick <b>U</b>special <b>I</b>ultimate <b>Esc</b>pause');
    this.root.append(this.letterEl, top, this.combo, this.banner, hint, this.fps, this.perf, this.camDbg, this.muteBtn, this.pauseBtn, this.training);
    parent.append(this.root, this.select, this.result);
  }

  setNames(names: [string, string]): void {
    this.nameEls[0].innerHTML = `${names[0]} <small>YOU</small>`;
    this.nameEls[1].textContent = names[1];
  }
  setMuteLabel(muted: boolean): void { this.muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON'; }
  /** Small caption under the timer, e.g. "STORY 2-3" or "WAVE 4". */
  setModeTag(text: string): void { this.modeTag.textContent = text; }
  /** Dev-only camera readout (?camdebug). */
  setCamDebug(text: string | null): void { this.camDbg.style.display = text ? 'block' : 'none'; if (text) this.camDbg.textContent = text; }
  setPerf(text: string | null): void { this.perf.style.display = text ? 'block' : 'none'; if (text) this.perf.textContent = text; }
  showTraining(on: boolean): void { this.training.classList.toggle('hidden', !on); this.pauseBtn.style.display = on ? 'none' : ''; }
  setTrainingInfo(html: string): void { this.trainingInfo.innerHTML = html; }

  setHealth(i: 0 | 1, frac: number): void {
    const b = this.bars[i]; const p = `${Math.max(0, frac) * 100}%`;
    b.fill.style.width = p; b.lag.style.width = p; b.bar.classList.toggle('low', frac < 0.25 && frac > 0);
  }
  setEnergy(i: 0 | 1, v: number): void {
    const b = this.bars[i]; b.efill.style.width = `${v}%`; b.energy.classList.toggle('full', v >= 100);
  }
  /** Guard meter (0..100): green = safe, orange = nearly broken, red flash = guard broken. */
  setGuard(i: 0 | 1, v: number, broken: boolean): void {
    const b = this.bars[i]; b.gfill.style.width = `${Math.min(100, v)}%`;
    b.guard.classList.toggle('hot', v >= 70); b.guard.classList.toggle('broken', broken);
  }
  setTimer(sec: number, infinite = false): void {
    const s = Math.max(0, Math.ceil(sec)); this.timer.textContent = infinite ? '∞' : String(s); this.timer.classList.toggle('low', !infinite && s <= 10);
  }
  setRounds(wins: [number, number]): void {
    this.bars.forEach((b, i) => b.pips.forEach((p, k) => p.classList.toggle('won', k < wins[i])));
  }
  /** Number of round pips shown (best-of format). */
  setRoundPips(n: number): void { this.bars.forEach((b) => b.pips.forEach((p, k) => { p.style.display = k < n ? '' : 'none'; })); }
  setFps(fps: number): void { this.fps.textContent = `${Math.round(fps)} fps`; }

  showCombo(count: number): void {
    this.combo.querySelector('.n')!.textContent = String(count);
    this.combo.classList.add('on'); this.combo.classList.remove('pop'); void this.combo.offsetWidth; this.combo.classList.add('pop');
    this.comboTimer = 1.4;
  }
  hideCombo(): void { this.combo.classList.remove('on'); }

  showBanner(title: string, sub = '', seconds = 1.4): void {
    this.bannerH.textContent = title; this.bannerP.textContent = sub;
    this.banner.classList.remove('on'); void this.banner.offsetWidth; this.banner.classList.add('on');
    this.bannerTimer = seconds;
  }

  /** Real-time housekeeping for transient UI (banner/combo fade). */
  /** Cinematic black bars for `seconds` (ultimates, KO). Purely visual. */
  letterbox(seconds: number): void { this.letterT = Math.max(this.letterT, seconds); this.letterEl.classList.add('on'); }

  tick(dt: number): void {
    if (this.letterT > 0 && (this.letterT -= dt) <= 0) this.letterEl.classList.remove('on');
    if (this.bannerTimer > 0 && (this.bannerTimer -= dt) <= 0) this.banner.classList.remove('on');
    if (this.comboTimer > 0 && (this.comboTimer -= dt) <= 0) this.hideCombo();
  }

  /** Whole battle HUD on/off (hidden behind menus). */
  setVisible(v: boolean): void { this.root.style.visibility = v ? '' : 'hidden'; }

  /** Character select: list on the left, details on the right, live 3D preview in the centre. */
  showSelect(chars: CharacterDef[], cb: {
    onPreview: (id: string) => void; onConfirm: (id: string) => void; onBack: () => void;
    lockReason?: (id: string) => string | null; levelOf?: (id: string) => number; confirmLabel?: string; selected?: string; extra?: string;
  }): void {
    this.setVisible(false);
    this.select.classList.remove('hidden'); this.select.classList.add('select'); this.select.innerHTML = '';
    const list = el('div', 'sel-list'); const detail = el('div', 'sel-detail');
    let current = cb.selected && chars.some((c) => c.id === cb.selected) ? cb.selected : chars[0].id;
    const bar = (label: string, v: number) => `<div class="stat"><span>${label}</span><i><b style="width:${v * 10}%"></b></i></div>`;
    const render = (id: string) => {
      current = id; const c = chars.find((x) => x.id === id)!;
      const lock = cb.lockReason?.(id) ?? null;
      list.querySelectorAll('.card').forEach((n) => n.classList.toggle('sel', (n as HTMLElement).dataset.id === id));
      detail.innerHTML = `<h2>${c.name}</h2><div class="sub">${c.style}${cb.levelOf ? ` &middot; LV ${cb.levelOf(id)}` : ''}</div><p>${c.blurb}</p>
        <div class="wp"><small>WEAPON</small> ${c.weaponName}</div>
        <div class="wp"><small>SPECIAL</small> ${c.abilities[0]}</div><div class="wp"><small>ULTIMATE</small> ${c.abilities[1]}</div>
        <div class="stats-bars">${bar('POWER', c.ratings.power)}${bar('SPEED', c.ratings.speed)}${bar('RANGE', c.ratings.range)}${bar('DEFENSE', c.ratings.defense)}</div>
        <div class="stat-line">HEALTH ${c.stats.maxHealth}${cb.extra ? ` &middot; ${cb.extra}` : ''}</div>${lock ? `<div class="lock-note">LOCKED &mdash; ${lock}</div>` : ''}`;
      const go = el('button', 'btn primary', `<span>${lock ? 'LOCKED' : cb.confirmLabel ?? 'FIGHT'}</span>`);
      if (lock) go.disabled = true; else go.onclick = () => cb.onConfirm(current);
      const back = el('button', 'btn', '<span>BACK</span>'); back.onclick = () => cb.onBack();
      const row = el('div', 'btnrow'); row.append(back, go); detail.append(row);
      cb.onPreview(id);
    };
    for (const c of chars) {
      const lock = cb.lockReason?.(c.id);
      const card = el('button', 'card' + (lock ? ' locked' : ''), `<b>${c.name}${lock ? ' &#128274;' : ''}</b><small>${c.weaponName}</small>`); card.dataset.id = c.id;
      card.onclick = () => render(c.id); card.onmouseenter = () => { if (!matchMedia('(pointer: coarse)').matches) render(c.id); };
      list.append(card);
    }
    this.select.append(list, detail);
    render(current);
  }

  hideSelect(): void { this.select.classList.add('hidden'); this.select.classList.remove('select'); }

  showResult(s: ResultStats, buttons: ResultButton[]): void {
    this.result.classList.remove('hidden'); this.result.innerHTML = '';
    const t = el('h1', 'logo', s.title);
    const tag = el('div', 'tag', s.sub ?? `ROUNDS ${s.rounds[0]} - ${s.rounds[1]}`);
    const st = el('div', 'stats');
    st.innerHTML = `<div><b>${s.duration.toFixed(1)}s</b>DURATION</div><div><b>${s.maxCombo}</b>HIGHEST COMBO</div><div><b>${Math.round(s.damage)}</b>DAMAGE DEALT</div>`;
    this.result.append(t, tag, st);
    if (s.rewards) {
      const r = s.rewards;
      const rw = el('div', 'stats rewards');
      rw.innerHTML = `<div><b>+${r.xp}</b>XP</div><div><b>+${r.gold}</b>GOLD</div><div><b>+${r.gems}</b>GEMS</div>`;
      this.result.append(rw);
      const notes: string[] = [...(s.lines ?? [])];
      if (r.levelsGained > 0) notes.push(`LEVEL UP! ${r.charName} is now level ${r.newLevel}`);
      for (const u of r.unlocked) notes.push(`UNLOCKED: ${u}`);
      if (notes.length) this.result.append(el('div', 'notes', notes.join('<br>')));
    } else if (s.lines?.length) this.result.append(el('div', 'notes', s.lines.join('<br>')));
    const row = el('div', 'btnrow');
    let first: HTMLButtonElement | null = null;
    for (const b of buttons) {
      const btn = el('button', 'btn' + (b.primary ? ' primary' : ''), `<span>${b.label}</span>`);
      btn.onclick = () => { if (btn.disabled) return; if (b.keepOpen) btn.disabled = true; else this.hideResult(); b.onClick(); };
      row.append(btn); if (b.primary && !first) first = btn;
    }
    this.result.append(row);
    first?.focus();
  }
  hideResult(): void { this.result.classList.add('hidden'); }
}
