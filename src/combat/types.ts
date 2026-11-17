export type Button = 'light' | 'heavy' | 'kick' | 'special' | 'ultimate' | 'grab';

export type FighterState =
  | 'idle' | 'walk' | 'jump' | 'block' | 'crouch' | 'dodge' | 'attack' | 'grabbed'
  | 'hitstun' | 'blockstun' | 'knockdown' | 'getup' | 'victory' | 'defeat';

/** One frame of controller output, already expressed relative to the fighter. */
export interface FighterInput {
  /** +1 = toward opponent, -1 = away. */
  fwd: number;
  jump: boolean;
  block: boolean;
  /** Edge-triggered presses for this simulation frame. */
  pressed: Button[];
  /** Edge-triggered sidestep along arena depth: +1 toward camera, -1 away, 0 none. */
  dodge: number;
  /**
   * Lateral walking (optional, 0 when absent): -1..1 along arena depth, +1 = toward the camera.
   * Combined with `fwd` this is a full local movement vector; pure lateral input orbits the opponent.
   */
  side?: number;
  /** Held: crouch. Crouching ducks high attacks and guards low ones; crouch + light/heavy/kick performs launcher/sweep/low kick. */
  crouch?: boolean;
}

export const emptyInput = (): FighterInput => ({ fwd: 0, jump: false, block: false, pressed: [], dodge: 0 });

/** Frame-data driven attack definition (60 simulation frames per second). */
export interface AttackData {
  id: string;
  button: Button;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  knockback: number;
  energyGain: number;
  /** Forward distance travelled over startup+active (meters). */
  lunge: number;
  /** Hitbox: reach from body centre, sphere radius and height above ground. */
  reach: number;
  radius: number;
  height: number;
  /** Frames at the start of recovery during which a chain cancel is allowed (on contact only). */
  cancelWindow: number;
  chain: Partial<Record<Button, string>>;
  knockdown: boolean;
  hitstop: number;
  /** Clip name played by the animation controller. */
  clip: string;
  /** Shadow energy required (and consumed) to start this attack. */
  cost?: number;
  /** Performed while airborne (gravity applies during the attack). */
  air?: boolean;
  /** Triggers the cinematic camera + big VFX. */
  cinematic?: boolean;
  /**
   * Hit-detection profile (default 'sphere'):
   *  - sphere: one ball at `reach` (fists, daggers, kicks)
   *  - thrust: a line of balls from `reachStart` out to `reach`, growing over the active frames (spear)
   *  - swing:  balls along a horizontal arc of `arc` degrees, sweeping across the active frames (sword)
   */
  shape?: HitShape;
  /** Where the attack hits: high (ducked by crouching), mid, low (must be crouch-guarded). Default mid. */
  level?: AttackLevel;
  /** Guard-meter damage when blocked (default: 15% of damage). 100 breaks the guard. */
  guardDamage?: number;
  /** Launches the victim into the air (initial upward speed, m/frame) so the combo can continue as a juggle. */
  launch?: number;
  /** Throw: ignores block, beats idle/guarding fighters, can be teched with the grab button. */
  grab?: boolean;
  /** Which key-pose pair the animation uses (defaults to clip), so a move can reuse another move's poses. */
  poseSet?: string;
  /** Frames of landing lag after an air attack touches down (halved if it connected). */
  landLag?: number;
  /** thrust: where the shaft starts (m from body centre; default 0.35). */
  reachStart?: number;
  /** swing: total horizontal sweep in degrees (default 80). */
  arc?: number;
}

export type HitShape = 'sphere' | 'thrust' | 'swing';
export type AttackLevel = 'high' | 'mid' | 'low';

/** One ball of an attack's collision shape (world space). */
export interface HitSample { x: number; y: number; z: number; r: number }

export interface CharacterStats {
  id?: string;
  name: string;
  maxHealth: number;
  walkSpeed: number;
  backSpeed: number;
  attacks: Record<string, AttackData>;
}

export const SIM_FPS = 60;
export const SIM_DT = 1 / SIM_FPS;


