import type { Button, FighterInput } from '../combat/types';
import type { InputSource } from './InputSource';

type Action = Button | 'jump' | 'dodge' | 'crouch';
interface BtnDef { action: Action; label: string; cls: string }

const BUTTONS: BtnDef[] = [
  { action: 'light', label: 'LIGHT', cls: 'light' },
  { action: 'heavy', label: 'HEAVY', cls: 'heavy' },
  { action: 'kick', label: 'KICK', cls: 'kick' },
  { action: 'jump', label: 'JUMP', cls: 'jump' },
  { action: 'dodge', label: 'DODGE', cls: 'dodge' },
  { action: 'grab', label: 'GRAB', cls: 'grab' },
  { action: 'crouch', label: 'DUCK', cls: 'crouch' },
  { action: 'special', label: 'SPECIAL', cls: 'special' },
  { action: 'ultimate', label: 'ULT', cls: 'ultimate' },
];

const SCALE_KEY = 'shadowclash.touchScale';
const STICK_RADIUS = 56;

/** Detects whether the device primarily uses touch (or ?touch is in the URL for testing). */
export const isTouchDevice = (): boolean =>
  new URLSearchParams(location.search).has('touch') || window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;

/**
 * Multi-touch controller. Pointer events with per-pointer ownership, so the
 * joystick and any number of buttons work simultaneously without conflicts.
 *  - Stick left/right = move, up/down = walk around the opponent (depth), pull back = auto-block; JUMP is a button
 *  - DODGE sidesteps toward the camera; hold the stick up while tapping to sidestep away.
 *  - Button size is adjustable with the small +/- control (persisted).
 */
export class TouchControls implements InputSource {
  enabled = true;
  readonly root = document.createElement('div');
  private stick = { id: -1, cx: 0, cy: 0, x: 0, y: 0 };
  private held = new Set<Action>();
  private owners = new Map<number, Action>();
  private queue: Button[] = [];
  private dodgeQueued = false;
  private jumpArmed = true;
  private jumpQueued = false;
  private base = document.createElement('div');
  private thumb = document.createElement('div');
  private scale = 1;

  constructor(parent: HTMLElement) {
    this.root.className = 'touch';
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    const zone = document.createElement('div'); zone.className = 'touch-stick-zone';
    this.base.className = 'stick-base'; this.thumb.className = 'stick-thumb'; this.base.append(this.thumb); zone.append(this.base);
    zone.addEventListener('pointerdown', this.stickDown);
    zone.addEventListener('pointermove', this.stickMove);
    zone.addEventListener('pointerup', this.stickUp);
    zone.addEventListener('pointercancel', this.stickUp);
    this.root.append(zone);

    const pad = document.createElement('div'); pad.className = 'touch-buttons';
    for (const b of BUTTONS) {
      const el = document.createElement('button'); el.className = `tbtn ${b.cls}`; el.textContent = b.label; el.type = 'button';
      el.addEventListener('pointerdown', (e) => this.btnDown(e, b.action, el));
      const up = (e: PointerEvent) => this.btnUp(e, el);
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
      pad.append(el);
    }
    this.root.append(pad);

    const size = document.createElement('div'); size.className = 'touch-size';
    const mk = (t: string, d: number) => { const s = document.createElement('button'); s.textContent = t; s.type = 'button'; s.onclick = () => this.setScale(this.scale + d); return s; };
    size.append(mk('−', -0.1), mk('+', 0.1)); this.root.append(size);

    try { this.scale = Number(localStorage.getItem(SCALE_KEY)) || 1; } catch { /* storage unavailable */ }
    this.setScale(this.scale);
    parent.append(this.root);
  }

  setScale(s: number): void {
    this.scale = Math.min(1.5, Math.max(0.7, s));
    this.root.style.setProperty('--ts', String(this.scale));
    try { localStorage.setItem(SCALE_KEY, String(this.scale)); } catch { /* ignore */ }
  }

  show(v: boolean): void { this.root.style.display = v ? '' : 'none'; }

  // ---- joystick
  private stickDown = (e: PointerEvent): void => {
    if (this.stick.id !== -1) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = this.base.getBoundingClientRect();
    this.stick = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, x: 0, y: 0 };
    this.stickMove(e);
  };
  private stickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stick.id) return;
    let dx = e.clientX - this.stick.cx, dy = e.clientY - this.stick.cy;
    const len = Math.hypot(dx, dy), max = STICK_RADIUS * this.scale;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    this.stick.x = dx / max; this.stick.y = dy / max;
    this.thumb.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  private stickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stick.id) return;
    this.stick.id = -1; this.stick.x = this.stick.y = 0; this.thumb.style.transform = ''; this.jumpArmed = true;
  };

  // ---- buttons
  private btnDown(e: PointerEvent, action: Action, el: HTMLElement): void {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    this.owners.set(e.pointerId, action);
    el.classList.add('down');
    if (action === 'crouch') this.held.add('crouch');
    else if (action === 'jump') { if (this.enabled) this.jumpQueued = true; }
    else if (action === 'dodge') this.dodgeQueued = true;
    else if (this.enabled) this.queue.push(action);
  }
  private btnUp(e: PointerEvent, el: HTMLElement): void {
    const a = this.owners.get(e.pointerId);
    if (!a) return;
    this.owners.delete(e.pointerId);
    el.classList.remove('down');
    if (a === 'crouch') this.held.delete('crouch');
  }

  poll(towardSign: number): FighterInput {
    const sx = Math.abs(this.stick.x) > 0.25 ? this.stick.x : 0;
    const sy = Math.abs(this.stick.y) > 0.3 ? this.stick.y : 0; // vertical stick = depth (+ down = toward the camera)
    const up = this.stick.y < -0.3;
    const inp: FighterInput = {
      fwd: this.enabled ? sx * towardSign : 0,
      jump: this.enabled && this.jumpQueued,
      block: false,
      crouch: this.enabled && this.held.has('crouch'),
      pressed: this.enabled ? this.queue : [],
      dodge: this.enabled && this.dodgeQueued ? (up ? -1 : 1) : 0,
      side: this.enabled ? sy : 0,
    };
    this.queue = []; this.dodgeQueued = false; this.jumpQueued = false;
    return inp;
  }
}
