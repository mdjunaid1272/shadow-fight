import type { Profile } from '../progression/Profile';

/**
 * In-app purchase abstraction. With no payment provider configured every
 * purchase reports 'unavailable' and the UI says so - success is NEVER faked.
 * A clearly-labelled TEST provider (?devshop) lets developers exercise the
 * flow; native billing (Google Play via Capacitor) plugs in through PurchaseProvider.
 */
export interface Product { sku: string; title: string; desc: string; price: string; gems?: number; removeAds?: boolean }

export const PRODUCTS: Product[] = [
  { sku: 'gems_small', title: '100 Gems', desc: 'A handful of gems for cosmetics.', price: '$0.99', gems: 100 },
  { sku: 'gems_medium', title: '550 Gems', desc: 'Best for a couple of premium skins.', price: '$4.99', gems: 550 },
  { sku: 'gems_large', title: '1200 Gems', desc: 'Stock up on skins and effects.', price: '$9.99', gems: 1200 },
  { sku: 'remove_ads', title: 'Remove Ads', desc: 'No more interstitial ads. Rewarded ads stay optional.', price: '$2.99', removeAds: true },
];

export type PurchaseStatus = 'success' | 'cancelled' | 'unavailable' | 'error';
export interface PurchaseResult { status: PurchaseStatus; test?: boolean; message?: string }

export interface PurchaseProvider {
  readonly name: string; readonly isTest: boolean;
  isAvailable(): boolean;
  purchase(product: Product, host: HTMLElement): Promise<PurchaseResult>;
}

export class NullPurchaseProvider implements PurchaseProvider {
  readonly name = 'none (not configured)'; readonly isTest = false;
  isAvailable(): boolean { return false; }
  async purchase(): Promise<PurchaseResult> { return { status: 'unavailable', message: 'In-app purchases are not available (no payment provider configured).' }; }
}

/** Development-only: asks for confirmation with an obvious TEST banner; no money is involved. */
export class TestPurchaseProvider implements PurchaseProvider {
  readonly name = 'TEST purchases (development mock)'; readonly isTest = true;
  isAvailable(): boolean { return true; }
  purchase(product: Product, host: HTMLElement): Promise<PurchaseResult> {
    return new Promise((resolve) => {
      const o = document.createElement('div'); o.className = 'overlay'; o.style.zIndex = '50';
      o.innerHTML = `<h1 class="logo" style="font-size:clamp(36px,7vw,80px)">TEST PURCHASE</h1><div class="tag">DEVELOPMENT MOCK - NO REAL MONEY - ${product.title} (${product.price})</div><div class="btnrow"></div>`;
      const row = o.querySelector('.btnrow') as HTMLElement;
      const mk = (label: string, primary: boolean, status: PurchaseStatus) => {
        const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.innerHTML = `<span>${label}</span>`;
        b.onclick = () => { o.remove(); resolve({ status, test: true }); }; row.append(b);
      };
      mk('CANCEL', false, 'cancelled'); mk('GRANT TEST PURCHASE', true, 'success');
      host.append(o);
    });
  }
}

export class PurchaseManager {
  private provider: PurchaseProvider = new NullPurchaseProvider();
  constructor(private getProfile: () => Profile) {}
  setProvider(p: PurchaseProvider): void { this.provider = p; console.info(`[IAP] provider: ${p.name}${p.isTest ? ' (TEST)' : ''}`); }
  get available(): boolean { return this.provider.isAvailable(); }
  get isTest(): boolean { return this.provider.isTest; }
  get providerName(): string { return this.provider.name; }

  /** Runs the purchase flow; the profile is only changed on a genuine 'success'. */
  async buy(sku: string, host: HTMLElement): Promise<PurchaseResult> {
    const product = PRODUCTS.find((p) => p.sku === sku);
    if (!product) return { status: 'error', message: 'Unknown product' };
    const res = await this.provider.purchase(product, host);
    if (res.status === 'success') {
      const p = this.getProfile();
      if (product.gems) p.gems += product.gems;
      if (product.removeAds) p.ads.removed = true;
    }
    return res;
  }
}
