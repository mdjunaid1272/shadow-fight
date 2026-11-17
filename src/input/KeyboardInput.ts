import type { Button, FighterInput } from '../combat/types';

const GAME_KEYS = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyC', 'KeyG', 'KeyQ', 'KeyE', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'Space', 'ShiftLeft', 'ShiftRight',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * Desktop keyboard controller. Presses are queued as edge events and drained
 * once per fixed simulation step, so input timing is independent of render FPS.
 *
 *  A/D or ←/→  move (hold back = auto-block)     W/Space/↑ jump     S/↓ step toward camera     Shift step away
 *  J light   K heavy   L kick    G grab/throw    C crouch (+J launcher, +K sweep, +L low kick)    Q/E sidestep
 */
export class KeyboardInput {
  private down = new Set<string>();
  private queue: Button[] = [];
  private dodgeQueue = 0;
  private jumpQueued = false;
  enabled = true;

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', () => this.down.clear());
  }

  private onDown = (e: KeyboardEvent): void => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    if (!this.enabled) return;
    if (e.code === 'KeyJ') this.queue.push('light');
    else if (e.code === 'KeyK') this.queue.push('heavy');
    else if (e.code === 'KeyL') this.queue.push('kick');
    else if (e.code === 'KeyG') this.queue.push('grab');
    else if (e.code === 'KeyU') this.queue.push('special');
    else if (e.code === 'KeyI') this.queue.push('ultimate');
    else if (e.code === 'KeyQ') this.dodgeQueue = 1;
    else if (e.code === 'KeyE') this.dodgeQueue = -1;
    else if (e.code === 'KeyW' || e.code === 'Space' || e.code === 'ArrowUp') this.jumpQueued = true;
  };

  private onUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };

  private held(...codes: string[]): boolean { return codes.some((c) => this.down.has(c)); }

  /** @param towardSign +1 if the opponent is on the +X side, else -1 */
  poll(towardSign: number): FighterInput {
    const world = (this.held('KeyD', 'ArrowRight') ? 1 : 0) - (this.held('KeyA', 'ArrowLeft') ? 1 : 0);
    const inp: FighterInput = {
      fwd: this.enabled ? world * towardSign : 0,
      jump: this.enabled && this.jumpQueued,
      crouch: this.enabled && this.held('KeyC'),
      block: false, // no block button: holding back blocks automatically (see Fighter.stepNeutral)
      side: this.enabled ? (this.held('KeyS', 'ArrowDown') ? 1 : 0) - (this.held('ShiftLeft', 'ShiftRight') ? 1 : 0) : 0, // depth walk: S/Down toward the camera, Shift away
      pressed: this.enabled ? this.queue : [],
      dodge: this.enabled ? this.dodgeQueue : 0,
    };
    this.queue = []; this.dodgeQueue = 0; this.jumpQueued = false;
    return inp;
  }

  dispose(target: Window = window): void {
    target.removeEventListener('keydown', this.onDown);
    target.removeEventListener('keyup', this.onUp);
  }
}
