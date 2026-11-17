import type { FighterInput } from '../combat/types';

/** Anything that can drive the player fighter (keyboard, touch, gamepad later). */
export interface InputSource {
  enabled: boolean;
  /** @param towardSign +1 if the opponent is on the +X side, else -1 */
  poll(towardSign: number): FighterInput;
}

export function mergeInputs(a: FighterInput, b: FighterInput): FighterInput {
  return {
    fwd: Math.abs(a.fwd) >= Math.abs(b.fwd) ? a.fwd : b.fwd,
    jump: a.jump || b.jump,
    block: a.block || b.block,
    pressed: [...a.pressed, ...b.pressed],
    dodge: a.dodge || b.dodge,
    side: Math.abs(a.side ?? 0) >= Math.abs(b.side ?? 0) ? (a.side ?? 0) : (b.side ?? 0),
  };
}
