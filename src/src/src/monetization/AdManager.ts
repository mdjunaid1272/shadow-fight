import type { Profile } from '../progression/Profile';

/**
 * Ad abstraction. No real ad network is configured, so the default provider
 * reports "unavailable" and every ad-dependent UI element stays hidden - an ad
 * view or reward is NEVER faked. A clearly-labelled TEST provider exists for
 * development only (enabled with ?testads). A native provider (e.g. AdMob via
 * Capacitor) plugs in by implementing AdProvider and calling setProvider().
 */
export type AdKind = 'rewarded' | 'interstitial';
export type AdPlacement = 'double_reward' | 'daily_bonus' | 'revive' | 'between_sessions';

export interface AdProvider {
  readonly name: string;
  /** True for development mocks. The UI labels these as TEST. */
  readonly isTest: boolean;
  isAvailable(kind: AdKind): boolean;
  /** Resolves `completed: true` only if the user actually finished a rewarded ad. */
  show(kind: AdKind, placement: AdPlacement, host: HTMLElement): Promise<{ completed: boolean }>;
}

export class NullAdProvider implements AdProvider {
  readonly name = 'none (not configured)'; readonly isTest = false;
  isAvailable(): boolean { return false; }
  async show(): Promise<{ completed: boolean }> { return { completed: false }; }
}

/** Development-only mock: shows an obvious TEST overlay. Never enabled in normal play. */
export class TestAdProvider implements AdProvider {
  readonly name = 'TEST ads (development mock)'; readonly isTest = true;
  isAvailable(): boolean { return true; }
  show(kind: AdKind, placement: AdPlacement, host: HTMLElement): Promise<{ completed: boolean }> {
    return new Promise((resolve) => {
      const o = document.createElement('div');
      o.className = 'overlay ad-test'; o.style.zIndex = '50';
      let left = kind === 'rewarded' ? 3 : 2;
      o.innerHTML = `<h1 class="logo" style="font-size:clamp(40px,8vw,90px)">TEST AD</h1><div class="tag">THIS IS A DEVELOPMENT MOCK - NOT A REAL AD (${placement})</div><div class="ad-count"></div><div class="btnrow"></div>`;
      const count = o.querySelector('.ad-count') as HTMLElement, row = o.querySelector('.btnrow') as HTMLElement;
      const close = (completed: boolean) => { clearInterval(iv); o.remove(); resolve({ completed }); };
      const cancel = document.createElement('button'); cancel.className = 'btn'; cancel.innerHTML = '<span>CLOSE EARLY</span>'; cancel.onclick = () => close(false);
      row.append(cancel);
      const tick = () => { count.textContent = left > 0 ? `Reward in ${left}...` : 'Done'; if (left <= 0) close(true); left--; };
      const iv = window.setInterval(tick, 1000); tick();
      host.append(o);
    });
  }
}

export class AdManager {
  private provider: AdProvider = new NullAdProvider();
  constructor(private getProfile: () => Profile) {}

  setProvider(p: AdProvider): void { this.provider = p; console.info(`[Ads] provider: ${p.name}${p.isTest ? ' (TEST)' : ''}`); }
  get providerName(): string { return this.provider.name; }
  get isTest(): boolean { return this.provider.isTest; }

  /** Rewarded ads: only if a provider is configured. Never offered mid-combat (caller passes `inCombat`). */
  canShowRewarded(inCombat: boolean): boolean { return !inCombat && this.provider.isAvailable('rewarded'); }

  /** Interstitials: never during combat, never if ads were removed, and only every few sessions. */
  canShowInterstitial(inCombat: boolean): boolean {
    const p = this.getProfile();
    return !inCombat && !p.ads.removed && p.ads.sessionsSinceInterstitial >= 3 && this.provider.isAvailable('interstitial');
  }

  async showRewarded(placement: AdPlacement, host: HTMLElement, inCombat = false): Promise<boolean> {
    if (!this.canShowRewarded(inCombat)) return false;
    return (await this.provider.show('rewarded', placement, host)).completed;
  }

  /** Call when a game session (a match/run) ends; may show an interstitial on the way back to the menu. */
  async sessionEnded(host: HTMLElement, inCombat = false): Promise<void> {
    const p = this.getProfile();
    p.ads.sessionsSinceInterstitial++;
    if (this.canShowInterstitial(inCombat)) { await this.provider.show('interstitial', 'between_sessions', host); p.ads.sessionsSinceInterstitial = 0; }
  }
}
