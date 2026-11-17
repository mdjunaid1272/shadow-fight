import { Howl, Howler } from 'howler';
import { generateSoundUris } from './Synth';

export type SoundName =
  | 'swing_light' | 'swing_heavy' | 'impact_punch' | 'impact_kick' | 'impact_sword' | 'block' | 'dodge'
  | 'footstep' | 'jump' | 'land' | 'special' | 'ultimate' | 'ko' | 'victory' | 'defeat' | 'ui';

const MUTE_KEY = 'shadowclash.muted';

/**
 * Howler-based audio. Sounds are registered by name from a URL, so real
 * assets can replace the synthesized placeholders via register().
 */
export class AudioManager {
  private sounds = new Map<string, Howl>();
  private musicHowl: Howl | null = null;
  private lastPlay = new Map<string, number>();
  muted = false;
  private musicVol = 1; private sfxVol = 1;
  private baseVol = new Map<string, number>();
  /** True while the synthesized placeholder set is in use. */
  readonly placeholder = true;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage unavailable */ }
    Howler.mute(this.muted);
    const uris = generateSoundUris();
    for (const [name, src] of Object.entries(uris)) {
      if (name === 'music') this.musicHowl = new Howl({ src: [src], loop: true, volume: 0.28 });
      else this.register(name, src);
    }
    console.info('[Audio] using synthesized PLACEHOLDER sounds (no recorded audio assets yet)');
  }

  register(name: string, src: string, volume = 0.7): void {
    this.baseVol.set(name, volume);
    this.sounds.set(name, new Howl({ src: [src], volume: volume * this.sfxVol, pool: 6 }));
  }

  play(name: SoundName, opts: { rate?: number; vol?: number; jitter?: number } = {}): void {
    const h = this.sounds.get(name);
    if (!h) { console.warn(`[Audio] missing sound "${name}"`); return; }
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? 0) < 35) return; // avoid stacking identical sounds in one frame
    this.lastPlay.set(name, now);
    const id = h.play();
    const j = opts.jitter ?? 0.08;
    h.rate((opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j), id);
    h.volume((opts.vol ?? this.baseVol.get(name) ?? 0.7) * this.sfxVol, id);
  }

  /** Master volume sliders (0-1) from Settings. */
  setVolumes(music: number, sfx: number): void {
    this.musicVol = Math.max(0, Math.min(1, music)); this.sfxVol = Math.max(0, Math.min(1, sfx));
    this.musicHowl?.volume(0.28 * this.musicVol);
    for (const [n, h] of this.sounds) h.volume((this.baseVol.get(n) ?? 0.7) * this.sfxVol);
  }

  startMusic(): void { if (this.musicHowl && !this.musicHowl.playing()) this.musicHowl.play(); }
  stopMusic(): void { this.musicHowl?.stop(); }

  setMuted(m: boolean): void {
    this.muted = m; Howler.mute(m);
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  }
  toggleMute(): boolean { this.setMuted(!this.muted); return this.muted; }

  dispose(): void { this.sounds.forEach((h) => h.unload()); this.musicHowl?.unload(); }
}
