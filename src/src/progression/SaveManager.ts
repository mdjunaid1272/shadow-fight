import { defaultProfile, migrateProfile, type Profile } from './Profile';

const DB_NAME = 'shadowclash';
const DB_VERSION = 1;
const STORE = 'save';
const KEY = 'profile';
const LS_KEY = 'shadowclash.profile.backup';

/**
 * IndexedDB persistence for the player profile. Falls back to localStorage,
 * then memory, if IndexedDB is unavailable (private mode etc.) - and says so
 * in the console rather than silently losing progress.
 */
export class SaveManager {
  profile: Profile = defaultProfile();
  /** 'indexeddb' | 'localstorage' | 'memory' - where progress is actually persisted. */
  backend: 'indexeddb' | 'localstorage' | 'memory' = 'memory';
  private db: IDBDatabase | null = null;
  private pending: number | null = null;

  async load(): Promise<Profile> {
    let raw: unknown;
    try {
      // Never let a stuck/blocked IndexedDB prevent the game from starting.
      const openP = this.open();
      // If the open is merely slow (busy main thread at startup) adopt it when it finally succeeds.
      openP.then((db) => { if (!this.db) { this.db = db; this.backend = 'indexeddb'; } }).catch(() => undefined);
      this.db = await this.withTimeout(openP, 6000, 'IndexedDB open');
      raw = await this.withTimeout(this.get(), 6000, 'IndexedDB read');
      this.backend = 'indexeddb';
    } catch (e) {
      console.warn('[Save] IndexedDB unavailable, falling back:', e);
      try { raw = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'); this.backend = 'localstorage'; } catch { this.backend = 'memory'; }
    }
    if (!raw) { try { raw = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'); } catch { /* none */ } }
    this.profile = migrateProfile(raw);
    console.info(`[Save] loaded profile v${this.profile.version} via ${this.backend}`);
    return this.profile;
  }

  private withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  /** Wipe all progress (Settings > Reset). Caller reloads the page afterwards. */
  async reset(): Promise<void> {
    this.profile = defaultProfile();
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    await this.flush();
  }

  /** Debounced write; call freely after state changes. */
  save(): void {
    if (this.pending !== null) return;
    this.pending = window.setTimeout(() => { this.pending = null; void this.flush(); }, 300);
  }

  async flush(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.profile)) as Profile;
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot)); } catch { /* quota / private mode */ }
    if (!this.db) return;
    try { await this.put(snapshot); } catch (e) { console.warn('[Save] write failed:', e); }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  }

  private get(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const r = this.db!.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  }

  private put(value: Profile): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }
}
