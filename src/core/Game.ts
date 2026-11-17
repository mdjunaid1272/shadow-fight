import * as THREE from 'three';
import { EnemyAI, type Behavior, type Difficulty } from '../ai/EnemyAI';
import type { Arena } from '../arenas/Arena';
import { getArena } from '../arenas/ArenaRegistry';
import { AudioManager } from '../audio/AudioManager';
import { normalizeCameraStyle, tuningFor } from '../camera/CameraConfig';
import { FightingCamera } from '../camera/FightingCamera';
import { getCharacter, type CharacterDef, type Palette } from '../characters/CharacterData';
import { loadGltf, loadManifest } from '../characters/AssetLoader';
import { FighterModel } from '../characters/FighterModel';
import { GltfAvatar } from '../characters/GltfAvatar';
import { CombatManager } from '../combat/CombatManager';
import { Fighter } from '../combat/Fighter';
import { emptyInput, SIM_DT, type FighterInput } from '../combat/types';
import { mergeInputs } from '../input/InputSource';
import { KeyboardInput } from '../input/KeyboardInput';
import { isTouchDevice, TouchControls } from '../input/TouchControls';
import { glowBoost, resolvePalette, type StoreItem } from '../progression/StoreData';
import { SaveManager } from '../progression/SaveManager';
import { HUD } from '../UI/HUD';
import { Flow } from './Flow';
import { Match } from './Match';
import { VFX } from './VFX';

const START_X = 2.3;
const MAX_STEPS_PER_FRAME = 5;
const PRACTICE_HEALTH = 99999;

/** Everything the battle runtime needs to start one fight (built by Flow from an Encounter). */
export interface StartOpts {
  playerId: string; enemyId: string; arena: string;
  difficulty: Difficulty; behavior: Behavior;
  healthMult: number; roundsToWin: number; practice: boolean;
  startHealthFrac?: number;
  enemyName?: string; enemyPalette?: Partial<Palette>;
  boss?: boolean; modeTag: string; title?: string; subtitle?: string;
}

export interface MatchSummary {
  won: boolean; wins: [number, number]; durationSec: number; maxCombo: number; damage: number;
  specials: number; perfectDodges: number; perfectRounds: number; playerHealthFrac: number;
}

export type DummyMode = 'idle' | 'block' | 'attack' | 'ai';

/** Battle runtime: renderer, scene, fixed-timestep loop, fighters and effects. Menus/progression live in Flow. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  arena: Arena = getArena('temple').create();
  readonly save = new SaveManager();
  readonly cam: FightingCamera;
  fighters!: [Fighter, Fighter];
  private models!: [FighterModel, FighterModel];
  private defs!: [CharacterDef, CharacterDef];
  private combat!: CombatManager;
  readonly match!: Match;
  private ai = new EnemyAI('NORMAL', 'BALANCED');
  private dummyAi = new EnemyAI('HARD', 'AGGRESSIVE');
  private dummyMode: DummyMode = 'idle';
  private keyboard = new KeyboardInput();
  touch: TouchControls | null = null;
  readonly hud: HUD;
  readonly fx: VFX;
  readonly audio = new AudioManager();
  readonly flow: Flow;

  /** Called when a fight (all rounds) ends. */
  onMatchEnd: (s: MatchSummary) => void = () => {};

  private opts: StartOpts | null = null;
  private lastX: [number, number] = [0, 0];
  private stepCounter: [number, number] = [0, 0];
  private airborneDown: [boolean, boolean] = [false, false];
  private playerId = 'ronin';
  private enemyId = 'shinobi';
  private previewItem: StoreItem | undefined;
  private previewing = false;
  private previewAngle = 0;
  private paused = false;
  /** Per-match counters reported to missions/achievements. */
  private counters = { specials: 0, perfectDodges: 0, perfectRounds: 0 };
  private trainingCombo = { hits: 0, damage: 0, best: 0, last: 0 };
  /** Dev-only: freeze a fighter in a given attack frame (?pose=char:attackId:frame). */
  private fixedPose = false;
  /** Dev-only: ?bots lets an AI drive the player as well (soak-testing combat VFX). */
  private bot: EnemyAI | null = null;

  private acc = 0; private last = performance.now(); private time = 0;
  private fps = 60; private lowFpsTime = 0; private pixelRatio: number; private pixelCap = 2;
  private perfTimer = 0;
  private timeScale = 1; private slowScale = 1; private slowLeft = 0;
  /** Settings > Cinematic moments: camera moves, letterbox and slow-mo on ultimates / KO / victory. */
  private cinematics = true;
  private cineIntensity = 1;
  private camDebug = import.meta.env.DEV && new URLSearchParams(location.search).has('camdebug');
  private camDebugT = 0;
  /** Dev-only: ?speed=N runs the simulation N times faster (soak tests). */
  private simSpeed = Math.max(1, Math.min(12, Number(new URLSearchParams(location.search).get('speed')) || 1));
  private raf = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.append(this.renderer.domElement);

    this.arena.build(this.scene, this.renderer);
    this.cam = new FightingCamera(this.arena.bounds, window.innerWidth / window.innerHeight);
    this.fx = new VFX(this.scene);
    this.hud = new HUD(host, ['RONIN', 'SHINOBI']);
    this.hud.onMute = () => this.audio.toggleMute();
    this.hud.setMuteLabel(this.audio.muted);
    this.hud.onDummy = (m) => { this.dummyMode = m; this.dummyAi.reset(); };
    this.hud.onTrainingReset = () => this.resetTraining();
    if (isTouchDevice()) {
      this.touch = new TouchControls(host); this.touch.show(false); host.classList.add('has-touch');
      this.cam.setInsets({ bottom: 0.14 }); // lift the framing so on-screen buttons don't cover the fighters
    }

    this.setupFighters(this.playerId, this.enemyId);
    this.wireEvents();
    this.resetRound();
    this.setControlsEnabled(false);
    this.flow = new Flow(this, host);
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this; // dev-only: lets test tools inspect the camera

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') this.hud.setMuteLabel(this.audio.toggleMute()); });
    host.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.btn, .card, .tab, .mini, .icard, .enc')) this.audio.play('ui'); });
    this.onResize();
    this.raf = requestAnimationFrame(this.frame);
    void this.init();
  }

  get profile() { return this.save.profile; }
  get isPaused(): boolean { return this.paused; }
  get inCombat(): boolean { return this.match.phase === 'fight' || this.match.phase === 'intro' || this.match.phase === 'roundEnd'; }
  get currentEnemyId(): string { return this.enemyId; }
  get currentPlayerId(): string { return this.playerId; }

  private async init(): Promise<void> {
    await this.save.load();
    this.applySettings();
    const pose = new URLSearchParams(location.search).get('pose');
    if (pose) { this.debugPose(...(pose.split(':') as [string, string, string])); return; }
    this.flow.start();
  }

  /** Apply persisted settings: quality, volumes, perf overlay, touch size. */
  applySettings(): void {
    const s = this.save.profile.settings;
    this.pixelCap = s.quality === 'low' ? 1 : s.quality === 'medium' ? 1.5 : 2;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.pixelCap);
    this.renderer.setPixelRatio(this.pixelRatio); this.onResize();
    this.fx.density = s.quality === 'low' ? 0.5 : s.quality === 'medium' ? 0.8 : 1;
    this.audio.setVolumes(s.musicVol, s.sfxVol);
    Object.assign(this.cam.tuning, tuningFor(normalizeCameraStyle(s.cameraStyle), s.cinematicIntensity, s.cameraDistance));
    this.cinematics = s.cinematics; this.cineIntensity = s.cinematicIntensity;
    this.cam.setLimits(this.arena.cameraLimits ?? {});
    this.touch?.setScale(s.touchScale);
    if (!s.perfOverlay) this.hud.setPerf(null);
  }

  // ------------------------------------------------------------------ dev tools
  private debugPose(charId: string, attackId: string, frame: string): void {
    this.previewing = true; this.fixedPose = true;
    this.playerId = charId;
    this.setupFighters(charId, 'ronin');
    const f = this.fighters[0]; f.reset(0, 0, 1);
    if (attackId && attackId !== 'idle' && f.stats.attacks[attackId]) { f.setState('attack'); f.attack = f.stats.attacks[attackId]; f.attackFrame = Number(frame) || 0; }
    this.models[0].root.visible = true; this.models[1].root.visible = false;
    this.hud.setVisible(false);
    this.cam.cinematic(f, 99999, 0.9, { zoom: 0.4 }); // previews keep their close-up
    // dev: ?fx=hit|knock|blocked|special|ultimate|slam|charge|dash loops an effect so it can be inspected
    const kind = new URLSearchParams(location.search).get('fx');
    if (kind) {
      const glow = this.defs[0].palette.glow;
      window.setInterval(() => {
        const x = 0.9, y = 1.2;
        if (kind === 'hit') this.fx.hit({ x, y, z: 0, dx: 1, dz: 0, color: glow, strength: 0.8, blocked: false, knockdown: false });
        else if (kind === 'knock') this.fx.hit({ x, y, z: 0, dx: 1, dz: 0, color: glow, strength: 1.1, blocked: false, knockdown: true });
        else if (kind === 'blocked') this.fx.hit({ x, y, z: 0, dx: 1, dz: 0, color: glow, strength: 0.5, blocked: true, knockdown: false });
        else if (kind === 'special') this.fx.burst(0, 1, 0, glow, false);
        else if (kind === 'ultimate') this.fx.burst(0, 1, 0, glow, true);
        else if (kind === 'slam') this.fx.groundSlam(0.9, 0, glow, 3.6);
      }, 500);
      if (kind === 'charge') window.setInterval(() => this.fx.chargeWisps(0, 1, 0, glow, 2), 16);
      if (kind === 'dash') window.setInterval(() => this.fx.dashTrail(0, 1, 0, glow), 16);
    }
  }

  // ------------------------------------------------------------------ public API used by Flow
  /** Swap the active arena (menus only). Old arena GPU resources are disposed. */
  setArena(id: string): void {
    if (this.arena.id === id) return;
    this.arena.dispose(this.scene);
    this.arena = getArena(id).create();
    this.arena.build(this.scene, this.renderer); this.cam.setLimits(this.arena.cameraLimits ?? {});
    this.setupFighters(this.playerId, this.enemyId);
    this.models[0].root.visible = false; this.models[1].root.visible = false;
  }

  /** Menu background: no fighters shown. */
  enterMenuView(): void {
    this.previewing = false; this.fixedPose = false; this.previewItem = undefined;
    this.cam.cinematic(this.fighters[0], 0); this.cam.setMenuMode(true);
    this.models[0].root.visible = false; this.models[1].root.visible = false;
    this.hud.setVisible(false); this.hud.showTraining(false);
    this.touch?.show(false);
  }

  /** Show one fighter on the turntable (character select / store preview), optionally wearing an unowned item. */
  previewCharacter(id: string, item?: StoreItem): void {
    this.previewing = true; this.previewItem = item; this.cam.setMenuMode(false);
    this.playerId = id;
    this.setupFighters(id, this.enemyId);
    this.fighters[0].reset(0, 0, 1); this.fighters[1].reset(0, 0, 1);
    this.models[1].root.visible = false; this.models[0].root.visible = true;
    this.cam.cinematic(this.fighters[0], 99999, 1, { zoom: 0.4 }); // character/store preview close-up
    this.hud.setVisible(false);
  }

  startEncounter(o: StartOpts): void {
    this.previewing = false; this.previewItem = undefined; this.fixedPose = false; this.paused = false;
    this.slowLeft = 0; this.timeScale = 1; this.cam.setMenuMode(false);
    this.opts = o;
    this.playerId = o.playerId; this.enemyId = o.enemyId;
    if (this.arena.id !== o.arena) { this.arena.dispose(this.scene); this.arena = getArena(o.arena).create(); this.arena.build(this.scene, this.renderer); this.cam.setLimits(this.arena.cameraLimits ?? {}); }
    this.setupFighters(o.playerId, o.enemyId, o);
    this.models[0].root.visible = true; this.models[1].root.visible = true;
    this.ai = new EnemyAI(o.difficulty, o.behavior);
    this.ai.onPhase = (ph) => { this.hud.showBanner(ph === 3 ? 'ENRAGED!' : `PHASE ${ph}`, ph === 3 ? 'FINAL PHASE' : 'THE BOSS GROWS STRONGER', 1.6); this.cam.addShake(0.2); this.audio.play('special'); };
    this.dummyMode = 'idle'; this.dummyAi = new EnemyAI('HARD', 'AGGRESSIVE');
    this.counters = { specials: 0, perfectDodges: 0, perfectRounds: 0 };
    this.trainingCombo = { hits: 0, damage: 0, best: 0, last: 0 };
    this.bot = new URLSearchParams(location.search).has('bots') ? new EnemyAI('HARD', 'AGGRESSIVE') : null;
    this.match.configure({ roundsToWin: o.roundsToWin, practice: o.practice });
    this.hud.setRoundPips(o.roundsToWin >= 2 ? 2 : 1);
    this.hud.setModeTag(o.modeTag);
    this.hud.setVisible(true); this.hud.showTraining(o.practice);
    this.hud.setTrainingInfo('Hit the dummy.<br>Combo: 0 hits');
    this.audio.startMusic();
    this.match.startMatch();
  }

  /** Abort the running fight without rewards (pause menu / training exit). */
  abortMatch(): void {
    this.paused = false; this.slowLeft = 0; this.timeScale = 1; this.match.abort(); this.audio.stopMusic(); this.setControlsEnabled(false);
    this.hud.hideCombo(); this.hud.showTraining(false);
  }

  setPaused(p: boolean): void { this.paused = p; if (p) { this.keyboard.poll(1); } }

  resetTraining(): void {
    if (!this.opts?.practice) return;
    this.fighters[0].reset(-START_X, 0, 1); this.fighters[1].reset(START_X, 0, -1);
    this.trainingCombo = { hits: 0, damage: 0, best: 0, last: 0 };
    this.hud.setTrainingInfo('Hit the dummy.<br>Combo: 0 hits'); this.cam.snap(this.fighters[0], this.fighters[1]);
  }

  // ------------------------------------------------------------------ setup
  /** Palette a character is drawn with (equipped cosmetics), optionally previewing an unowned item. */
  private paletteFor(def: CharacterDef, isPlayer: boolean, o?: StartOpts): Palette {
    if (!isPlayer) return { ...def.palette, ...(o?.enemyPalette ?? {}) };
    return resolvePalette(this.save.profile, def.id, def.palette, this.previewItem);
  }

  /** (Re)create both fighters + their models for the chosen characters. */
  private setupFighters(playerId: string, enemyId: string, o?: StartOpts): void {
    this.models?.forEach((m) => m.dispose(this.scene));
    const base: [CharacterDef, CharacterDef] = [getCharacter(playerId), getCharacter(enemyId)];
    const practice = !!o?.practice;
    const defs: [CharacterDef, CharacterDef] = [
      { ...base[0], palette: this.paletteFor(base[0], true, o), stats: practice ? { ...base[0].stats, maxHealth: PRACTICE_HEALTH } : base[0].stats },
      { ...base[1], name: o?.enemyName ?? base[1].name, palette: this.paletteFor(base[1], false, o), stats: { ...base[1].stats, maxHealth: practice ? PRACTICE_HEALTH : Math.round(base[1].stats.maxHealth * (o?.healthMult ?? 1)) } },
    ];
    this.defs = defs;
    this.fighters = [new Fighter(defs[0].stats, this.arena.bounds), new Fighter(defs[1].stats, this.arena.bounds)];
    const tier = this.save.profile.weaponTier[defs[0].weapon] ?? 1;
    this.models = [new FighterModel(defs[0], this.scene, glowBoost(tier)), new FighterModel(defs[1], this.scene, 1)];
    if (this.combat) this.combat.setFighters(this.fighters); else { this.combat = new CombatManager(this.fighters); (this as { match: Match }).match = new Match(this.combat); }
    this.hud?.setNames([defs[0].name, defs[1].name]);
    this.stepCounter = [0, 0];
    void this.loadAvatars(this.models, defs);
  }

  /** Lazily swap in GLB characters listed in assets/manifest.json; everything else keeps its procedural model. */
  private async loadAvatars(models: [FighterModel, FighterModel], defs: [CharacterDef, CharacterDef]): Promise<void> {
    const manifest = await loadManifest();
    for (let i = 0; i < 2; i++) {
      const path = manifest.characters?.[defs[i].id];
      if (!path) continue;
      try {
        const gltf = await loadGltf(path, this.renderer);
        if (this.models !== models) return; // fighters were rebuilt while loading
        models[i].attachGltf(GltfAvatar.fromGltf(gltf));
      } catch (e) { console.warn(`[Assets] could not load ${path}; using the procedural ${defs[i].name} model`, e); }
    }
  }

  private wireEvents(): void {
    // Combat events are bound once; CombatManager keeps its emitter across setFighters().
    const ev = this.combat.events;
    ev.on('hit', (h) => {
      const att = this.fighters[h.attacker], def = this.fighters[h.defender];
      let dx = def.x - att.x, dz = def.z - att.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      this.fx.hit({ x: h.x, y: h.y, z: h.z, dx, dz, color: this.defs[h.attacker].palette.glow, strength: h.damage / 110, blocked: h.blocked, knockdown: h.knockdown });
      this.cam.addShake(h.blocked ? 0.06 : h.knockdown ? 0.3 : 0.14);
      this.cam.kick(dx, h.blocked ? 0.15 : h.knockdown ? 0.8 : 0.45); // small impulse along the blow's direction
      if (h.knockdown && this.cinematics) this.cam.lowAngle(0.3, 0.9); // subtle low-angle accent on a knockdown
      if (!h.blocked && this.cinematics) { // impact slow motion: knockdowns and big hits briefly stretch time
        if (h.knockdown) { this.slowMo(0.4, 0.3); this.cam.zoomPulse(-0.1, 0.35, 0.08, 0.5); }
        else if (h.damage >= 90) { this.slowMo(0.55, 0.18); this.cam.zoomPulse(-0.06, 0.2, 0.07, 0.4); }
      }
      if (h.blocked) this.audio.play('block');
      else if (['kick', 'lowkick', 'airkick', 'sweep'].includes(h.attackId)) this.audio.play('impact_kick');
      else this.audio.play(this.defs[h.attacker].weapon === 'gauntlets' ? 'impact_punch' : 'impact_sword', { rate: h.knockdown ? 0.8 : 1 });
      if (this.opts?.practice && h.attacker === 0 && !h.blocked) { this.trainingCombo.damage += h.damage; this.trainingCombo.hits++; this.updateTrainingInfo(); }
    });
    ev.on('attackStart', ({ id, startup }) => {
      const heavy = ['heavy', 'special', 'ultimate', 'sweep', 'airheavy', 'counter', 'launcher'].includes(id);
      if (id === 'special' || id === 'ultimate') return; // dedicated sound on the 'special' event
      setTimeout(() => this.audio.play(heavy ? 'swing_heavy' : 'swing_light'), (startup * 0.55 / 60) * 1000);
    });
    ev.on('state', ({ who, from, to }) => {
      if (to === 'jump' && from !== 'attack') this.audio.play('jump', { vol: 0.5 });
      else if (from === 'jump' && to === 'idle') { this.audio.play('land'); this.fx.dust(this.fighters[who].x, this.fighters[who].z, 7, 0.28, 1.2); }
      else if (to === 'dodge') { this.audio.play('dodge'); const f = this.fighters[who]; this.fx.dust(f.x, f.z, 6, 0.26, 1); }
    });
    ev.on('special', (s) => {
      const ult = s.cinematic;
      if (s.who === 0) this.counters.specials++;
      this.audio.play(ult ? 'ultimate' : 'special');
      this.fx.burst(s.x, s.y, s.z, this.defs[s.who].palette.glow, ult);
      this.cam.addShake(ult ? 0.2 : 0.1);
      if (ult && this.cinematics) { this.cam.cinematic(this.fighters[s.who], 1.3, 1, { zoom: Math.min(0.14, 0.09 * this.cineIntensity) }); this.slowMo(0.5, 0.7); this.hud.letterbox(1.5); this.cam.zoomPulse(-0.12, 0.9, 0.25, 0.9); }
      else if (!ult && this.cinematics) { this.cam.cinematic(this.fighters[s.who], 0.7, 0.3); this.cam.zoomPulse(-0.07, 0.35, 0.12, 0.5); } // a gentle pan toward the attacker
      if (s.who === 0) this.hud.showBanner(this.defs[0].abilities[ult ? 1 : 0].toUpperCase(), '', 0.8);
    });
    ev.on('ko', ({ loser }) => { const lf = this.fighters[loser]; this.fx.burst(lf.x, lf.y + 1, lf.z, 0xffffff, true); this.audio.play('ko'); if (this.cinematics) { this.cam.cinematic(this.fighters[loser], 1.1, 0.75, { low: 0.5 }); this.slowMo(0.3, 1.1); this.hud.letterbox(2.2); this.cam.zoomPulse(-0.1, 1.1, 0.6, 1.2); } });
    ev.on('perfectDodge', ({ who }) => { const df = this.fighters[who]; this.fx.perfectDodge(df.x, df.y + 1, df.z); if (this.cinematics) { this.slowMo(0.55, 0.3); this.cam.zoomPulse(-0.06, 0.3, 0.1, 0.4); } if (who === 0) { this.counters.perfectDodges++; this.hud.showBanner('PERFECT DODGE', '', 0.6); } });
    // ---- defensive events: parry (timed block), guard break, throws
    ev.on('parry', ({ who, x, y, z }) => {
      const pf = this.fighters[who];
      this.fx.burst(x, y, z, 0xffffff, false); this.fx.perfectDodge(pf.x, pf.y + 1, pf.z);
      this.audio.play('block', { rate: 1.8 }); this.cam.addShake(0.1);
      if (this.cinematics) { this.slowMo(0.5, 0.25); this.cam.zoomPulse(-0.05, 0.25, 0.08, 0.4); }
      if (who === 0) this.hud.showBanner('PARRY', '', 0.6);
    });
    ev.on('guardBreak', ({ who }) => {
      const f = this.fighters[who];
      this.fx.burst(f.x, f.y + 1.1, f.z, 0xffb43a, true); this.audio.play('impact_punch', { rate: 0.7 }); this.cam.addShake(0.28);
      if (this.cinematics) this.slowMo(0.45, 0.3);
      this.hud.showBanner(who === 0 ? 'GUARD BROKEN' : 'GUARD BREAK', '', 0.8);
    });
    ev.on('grab', ({ attacker }) => { const f = this.fighters[attacker]; this.audio.play('impact_kick', { rate: 0.8 }); this.fx.dust(f.x, f.z, 5, 0.2, 0.8); });
    ev.on('tech', ({ who }) => { this.audio.play('dodge'); if (who === 0) this.hud.showBanner('TECH', '', 0.5); });
    ev.on('combo', ({ owner, count }) => { if (count >= 4 && count % 4 === 0 && this.cinematics) { this.slowMo(0.5, 0.22); this.cam.zoomPulse(-0.05, 0.25, 0.08, 0.4); } /* combo milestone */ if (owner === 0) { this.hud.showCombo(count); if (this.opts?.practice) { this.trainingCombo.last = count; this.trainingCombo.best = Math.max(this.trainingCombo.best, count); this.updateTrainingInfo(); } } });
    ev.on('comboEnd', ({ owner }) => { if (owner === 0) { setTimeout(() => this.hud.hideCombo(), 600); if (this.opts?.practice) { this.trainingCombo.hits = 0; this.trainingCombo.damage = 0; } } });

    this.match.events.on('roundIntro', ({ round }) => {
      this.resetRound();
      this.cam.intro();
      this.setControlsEnabled(false);
      this.hud.setRounds(this.match.wins);
      const o = this.opts;
      if (round === 1 && o?.title) this.hud.showBanner(o.boss ? `BOSS: ${(o.enemyName ?? this.defs[1].name)}` : o.title, o.subtitle ?? 'GET READY', 1.6);
      else this.hud.showBanner(`ROUND ${round}`, round === 3 ? 'FINAL ROUND' : 'GET READY', 1.1);
    });
    this.match.events.on('fightStart', () => { this.hud.showBanner('FIGHT!', '', 0.9); this.setControlsEnabled(true); });
    this.match.events.on('roundEnd', ({ winner, reason, wins }) => {
      this.setControlsEnabled(false); this.hud.setRounds(wins);
      const p = this.fighters[0];
      if (winner === 0 && p.health >= p.stats.maxHealth) this.counters.perfectRounds++;
      if (winner >= 0 && !this.opts?.practice && this.cinematics) { // gentle winner pan after the KO moment (or right away on a timeout)
        const w = this.fighters[winner];
        window.setTimeout(() => { if (this.match.phase === 'roundEnd') { this.cam.cinematic(w, 2.6, 0.7, { orbit: 0.1 }); this.cam.zoomPulse(0.1, 2.2, 1.0, 1.2); } }, reason === 'ko' ? 1200 : 0);
      }
      this.hud.showBanner(winner === -1 ? 'DRAW' : reason === 'ko' ? 'K.O.' : 'TIME UP', winner === 0 ? 'YOU WIN THE ROUND' : winner === 1 ? 'ROUND LOST' : '', 2.4);
    });
    this.match.events.on('matchEnd', ({ winner, wins }) => {
      this.touch?.show(false);
      this.audio.stopMusic(); this.audio.play(winner === 0 ? 'victory' : 'defeat');
      const p = this.fighters[0];
      this.onMatchEnd({
        won: winner === 0, wins, durationSec: this.match.durationFrames / 60, maxCombo: this.combat.maxCombo[0], damage: this.combat.damageDealt[0],
        specials: this.counters.specials, perfectDodges: this.counters.perfectDodges, perfectRounds: this.counters.perfectRounds,
        playerHealthFrac: p.health / p.stats.maxHealth,
      });
    });
  }

  /** Brief slow motion for drama (real-time duration). Never during menus/previews. */
  private slowMo(scale: number, seconds: number): void {
    if (this.previewing || this.simSpeed > 1) return;
    this.slowScale = this.slowLeft > 0 ? Math.min(this.slowScale, scale) : scale; // overlapping effects keep the deeper slow-down
    this.slowLeft = Math.max(this.slowLeft, seconds);
  }

  private updateTrainingInfo(): void {
    const t = this.trainingCombo;
    this.hud.setTrainingInfo(`Combo: <b>${t.hits}</b> hits &middot; <b>${Math.round(t.damage)}</b> dmg<br>Last: ${t.last} &middot; Best: ${t.best}`);
  }

  private setControlsEnabled(on: boolean): void {
    this.keyboard.enabled = on;
    if (this.touch) { this.touch.enabled = on; this.touch.show(this.match.phase !== 'menu' && this.match.phase !== 'matchEnd' && !this.previewing); }
  }

  private resetRound(): void {
    const [p, e] = this.fighters;
    p.reset(-START_X, 0, 1); e.reset(START_X, 0, -1);
    if (this.match.round <= 1 && this.opts?.startHealthFrac !== undefined && !this.opts.practice) p.health = Math.max(1, Math.round(p.stats.maxHealth * this.opts.startHealthFrac));
    this.ai.reset();
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('energy')) { p.energy = 100; e.energy = 100; } // dev: test ultimates quickly
    this.hud.hideCombo();
    this.lastX = [p.x, e.x];
    this.cam.snap(p, e);
  }

  private onResize = (): void => {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w / h);
  };

  /** One fixed 60 Hz simulation step. */
  private simulate(): void {
    if (this.paused || this.previewing || (this.match.phase === 'menu' && !this.models[0].root.visible)) return;
    this.match.step();
    const [p, e] = this.fighters;
    let pin: FighterInput, ein: FighterInput;
    if (this.match.fighting && !this.combat.frozen) {
      const sign = Math.sign(e.x - p.x) || 1;
      pin = this.bot ? this.bot.think(p, e) : this.touch ? mergeInputs(this.keyboard.poll(sign), this.touch.poll(sign)) : this.keyboard.poll(sign);
      if (this.opts?.practice) ein = this.dummyInput(e, p);
      else ein = this.ai.think(e, p);
    } else { pin = emptyInput(); ein = emptyInput(); } // hitstop: key presses stay queued and apply afterwards
    this.combat.step([pin, ein]);
    if (this.opts?.practice) { p.health = p.stats.maxHealth; e.health = e.stats.maxHealth; p.energy = 100; }
    // footsteps on a fixed cadence while walking
    this.fighters.forEach((f, i) => {
      if (f.state === 'walk' && !this.combat.frozen) {
        if (++this.stepCounter[i] % (f.running ? 13 : 20) === 8) { this.audio.play('footstep', { vol: i === 0 ? 0.5 : 0.3 }); this.fx.dust(f.x - f.fx * 0.25, f.z - f.fz * 0.25, f.running ? 3 : 2, 0.18, 0.5); }
      } else this.stepCounter[i] = 0;
    });
    this.combatVfx();
  }

  private dummyInput(e: Fighter, p: Fighter): FighterInput {
    switch (this.dummyMode) {
      case 'block': return { ...emptyInput(), block: true };
      case 'attack': case 'ai': return this.dummyAi.think(e, p);
      default: return emptyInput();
    }
  }

  /** Attack-driven effects, run on the fixed sim clock so they never double-fire at high refresh rates. */
  private combatVfx(): void {
    if (this.combat.frozen) return;
    this.fighters.forEach((f, i) => {
      const a = f.attack, glow = this.defs[i].palette.glow;
      // landing after a launch / knockdown
      const down = (f.state === 'knockdown' || f.state === 'defeat');
      if (down && !f.grounded) this.airborneDown[i] = true;
      else if (down && this.airborneDown[i] && f.grounded) {
        this.airborneDown[i] = false; this.fx.groundSlam(f.x, f.z, 0xd8c8b0, 2.2); this.cam.addShake(0.15); this.audio.play('land', { vol: 1 });
      } else if (!down) this.airborneDown[i] = false;
      if (f.state !== 'attack' || !a) return;
      const phase = f.attackPhase;
      if (a.cost && phase === 'startup') this.fx.chargeWisps(f.x, f.y + 1, f.z, glow, a.cinematic ? 2 : 1);
      if (a.cost && a.lunge > 1.5 && phase !== 'recovery' && f.attackFrame > a.startup * 0.6) this.fx.dashTrail(f.x - f.fx * 0.3, f.y + 1, f.z - f.fz * 0.3, glow);
      if (f.attackFrame === a.startup) { // the strike frame
        const fx = f.x + f.fx * 0.9, fz = f.z + f.fz * 0.9, w = this.defs[i].weapon;
        if (a.id === 'heavy') { this.cam.kick(f.fx, 0.15); this.fx.dust(fx, fz, 5, 0.34, 1.4); if (w === 'gauntlets') this.fx.groundSlam(fx, fz, glow, 1.7); }
        else if (a.id === 'special' && w === 'gauntlets') { this.fx.groundSlam(fx, fz, glow, 3.6); this.cam.addShake(0.25); }
        else if (a.id === 'ultimate') { this.fx.groundSlam(fx, fz, glow, 4.6); this.cam.addShake(0.3); }
        else if (a.id === 'special') this.fx.dust(f.x, f.z, 8, 0.32, 1.8);
      }
    });
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const rawDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now; this.time += rawDt;
    // slow motion (ultimates, KO, perfect dodge): eases in/out, scales sim + animation + particles but not camera/UI
    this.slowLeft = Math.max(0, this.slowLeft - rawDt);
    this.timeScale += ((this.slowLeft > 0 ? this.slowScale : 1) - this.timeScale) * (1 - Math.exp(-10 * rawDt));
    const gdt = rawDt * this.timeScale;
    this.acc += gdt * this.simSpeed;
    let steps = 0; const maxSteps = MAX_STEPS_PER_FRAME * this.simSpeed;
    while (this.acc >= SIM_DT && steps < maxSteps) { this.simulate(); this.acc -= SIM_DT; steps++; }
    if (steps === maxSteps) this.acc = 0; // drop backlog instead of spiralling

    const [p, e] = this.fighters;
    if (this.previewing && !this.fixedPose) { // slow turntable for select / store preview
      this.previewAngle += rawDt * 0.9;
      p.fx = Math.sin(this.previewAngle); p.fz = Math.cos(this.previewAngle);
    }
    const frozen = this.combat.frozen || this.paused;
    const pBack = (p.x - this.lastX[0]) * Math.sign(e.x - p.x) < -0.001;
    const eBack = (e.x - this.lastX[1]) * Math.sign(p.x - e.x) < -0.001;
    const speed = Math.max(Math.abs(p.x - this.lastX[0]), Math.abs(e.x - this.lastX[1])) / Math.max(rawDt, 0.001);
    this.lastX = [p.x, e.x];
    this.models[0].update(gdt, p, pBack, frozen);
    this.models[1].update(gdt, e, eBack, frozen);
    // camera context: who is attacking (lead room), how fast things move, current combo
    let actionDir = 0;
    for (const f of this.fighters) if (f.state === 'attack' && f.attackPhase !== 'recovery') actionDir += f.fx >= 0 ? 1 : -1;
    this.cam.setHints({ actionDir: this.previewing ? 0 : actionDir, speed: this.previewing ? 0 : speed / Math.max(this.timeScale, 0.2) });
    this.cam.update(p, this.previewing ? p : e, rawDt);
    if (this.camDebug && (this.camDebugT += rawDt) > 0.1) { this.camDebugT = 0; this.hud.setCamDebug(this.camDebugText()); }
    this.arena.update(rawDt, this.time);
    this.fx.update(gdt, this.cam.camera, this.renderer);

    const practice = !!this.opts?.practice && this.match.phase !== 'menu';
    this.hud.setHealth(0, practice ? 1 : p.health / p.stats.maxHealth); this.hud.setHealth(1, practice ? 1 : e.health / e.stats.maxHealth);
    this.hud.setEnergy(0, p.energy); this.hud.setEnergy(1, e.energy);
    this.hud.setGuard(0, p.guard, p.guardBroken); this.hud.setGuard(1, e.guard, e.guardBroken);
    this.hud.setTimer(this.match.timerSeconds, practice);
    this.hud.tick(rawDt);
    this.adaptResolution(rawDt);
    this.updatePerf(rawDt);

    this.renderer.render(this.scene, this.cam.camera);
  };

  /** Responsive resolution scaling: back off pixel ratio if FPS stays low. */
  private adaptResolution(dt: number): void {
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    this.hud.setFps(this.fps);
    if (this.fps < 40) this.lowFpsTime += dt; else this.lowFpsTime = 0;
    if (this.lowFpsTime > 2 && this.pixelRatio > 0.7) {
      this.pixelRatio = Math.max(0.7, this.pixelRatio - 0.2);
      this.renderer.setPixelRatio(this.pixelRatio); this.onResize(); this.lowFpsTime = 0;
      this.fx.density = Math.max(0.5, this.fx.density - 0.2); // fewer particles on weak devices
    }
  }

  /** Dev-only (?camdebug): live readout of the camera state. */
  private camDebugText(): string {
    const d = this.cam.debugInfo(), f = (n: number, k = 2) => n.toFixed(k);
    return [
      `CAMERA ${d.mode}   style ${this.save.profile.settings.cameraStyle}`,
      `pos   ${d.pos.map((v) => f(v)).join(', ')}`,
      `yaw ${f(d.yawDeg, 1)}  pitch ${f(d.pitchDeg, 1)}  (target yaw ${f(d.yawTargetDeg, 1)})`,
      `dist ${f(d.distance)}  target ${f(d.targetDistance)}  guard x${f(d.guardScale, 3)}`,
      `fov ${f(d.fov, 1)}   fighter separation ${f(d.separation)}`,
    ].join('\n');
  }

  /** Optional on-screen profiler (Settings > Performance overlay) for measuring real devices. */
  private updatePerf(dt: number): void {
    if (!this.save.profile.settings.perfOverlay) return;
    this.perfTimer += dt; if (this.perfTimer < 0.5) return; this.perfTimer = 0;
    const i = this.renderer.info; const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this.hud.setPerf([
      `fps ${this.fps.toFixed(0)}  dpr ${this.pixelRatio.toFixed(2)}`,
      `draw calls ${i.render.calls}  tris ${i.render.triangles}`,
      `geometries ${i.memory.geometries}  textures ${i.memory.textures}`,
      `particles ${this.fx.particleCount}  density ${this.fx.density.toFixed(1)}`,
      mem ? `js heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : 'js heap n/a',
    ].join('\n'));
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.keyboard.dispose();
    this.models.forEach((m) => m.dispose(this.scene));
    this.audio.dispose();
    this.fx.dispose(); this.arena.dispose(this.scene); this.renderer.dispose();
  }
}
