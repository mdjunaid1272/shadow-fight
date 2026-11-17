/**
 * Touch anywhere -> fullscreen. Browsers only allow fullscreen from a user
 * gesture, so this listens for the touch release and requests it then.
 * - Touch devices: any tap enters fullscreen (and tries to lock landscape).
 * - Desktop: press F to toggle (mouse clicks are left alone).
 * Not supported on iPhone Safari (no Fullscreen API for elements); there it silently does nothing.
 */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = document as FsDoc;
const isFullscreen = (): boolean => !!(document.fullscreenElement ?? doc.webkitFullscreenElement);

async function enter(): Promise<void> {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return;
    // Landscape suits the game; only works in fullscreen on Android Chrome, so ignore failures.
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch { /* denied or unsupported - try again on the next gesture */ }
}

async function exit(): Promise<void> {
  try { if (document.exitFullscreen) await document.exitFullscreen(); else await doc.webkitExitFullscreen?.(); } catch { /* ignore */ }
}

export function installFullscreenOnTouch(): void {
  // pointerup counts as a user activation for fullscreen; touch only, so mouse play isn't hijacked.
  window.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch' && !isFullscreen()) void enter(); }, { capture: true });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.repeat) { e.preventDefault(); void (isFullscreen() ? exit() : enter()); }
  });
}
