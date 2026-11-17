/**
 * Reusable pose-based animation controller.
 *
 * A Pose is a flat array of joint rotations (radians) plus root offsets.
 * Clips are functions (time, ctx) -> Pose. Procedural clips are the
 * *temporary fallback* until GLB AnimationClips replace them; every clip is
 * registered with a `source` so missing / fallback animation is never hidden.
 */
export const JOINTS = ['hips', 'torso', 'head', 'shL', 'shR', 'elL', 'elR', 'hpL', 'hpR', 'knL', 'knR'] as const;
export type Joint = (typeof JOINTS)[number];
export type V3 = [number, number, number];
/** Sparse pose in DEGREES for readability; `rootY` meters, `tilt` degrees about the feet. */
export type PoseDef = Partial<Record<Joint, V3>> & { rootY?: number; tilt?: number; rootZ?: number };

export const IDX_ROOTY = JOINTS.length * 3;
export const IDX_TILT = IDX_ROOTY + 1;
/** Forward body shift in model space (meters) - sells lunges and weight transfer. */
export const IDX_ROOTZ = IDX_ROOTY + 2;
export const POSE_SIZE = JOINTS.length * 3 + 3;
export type Pose = Float32Array;
const D2R = Math.PI / 180;

export function makePose(def: PoseDef, base?: Pose): Pose {
  const p = new Float32Array(POSE_SIZE);
  if (base) p.set(base);
  JOINTS.forEach((j, i) => {
    const v = def[j];
    if (v) { p[i * 3] = v[0] * D2R; p[i * 3 + 1] = v[1] * D2R; p[i * 3 + 2] = v[2] * D2R; }
  });
  if (def.rootY !== undefined) p[IDX_ROOTY] = def.rootY;
  if (def.tilt !== undefined) p[IDX_TILT] = def.tilt * D2R;
  if (def.rootZ !== undefined) p[IDX_ROOTZ] = def.rootZ;
  return p;
}

export function mixPose(a: Pose, b: Pose, t: number, out: Pose = new Float32Array(POSE_SIZE)): Pose {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

export interface ClipContext {
  /** Seconds since the clip started (for looping clips). */
  time: number;
  /** Simulation frame within the current state/attack. */
  frame: number;
}
export type ClipFn = (ctx: ClipContext) => Pose;
export interface ClipInfo { fn: ClipFn; blend: number; source: 'procedural-fallback' | 'gltf' }

export class AnimationController {
  private clips = new Map<string, ClipInfo>();
  private current = '';
  private startTime = 0;
  private clock = 0;
  private from: Pose = new Float32Array(POSE_SIZE);
  private blendT = 1;
  private blendDur = 0.1;
  readonly output: Pose = new Float32Array(POSE_SIZE);
  private missingWarned = new Set<string>();

  register(name: string, fn: ClipFn, blend = 0.12, source: ClipInfo['source'] = 'procedural-fallback'): void {
    this.clips.set(name, { fn, blend, source });
  }

  has(name: string): boolean { return this.clips.has(name); }

  /** Register 
ame as an explicit alias of an existing clip (still reported, never silent). */
  alias(name: string, existing: string): boolean {
    const c = this.clips.get(existing); if (!c) return false;
    this.clips.set(name, { ...c }); return true;
  }

  /** Human-readable list of which clips are fallbacks, for debug UI / console. */
  report(): string[] {
    return [...this.clips].map(([n, c]) => `${n}: ${c.source}`);
  }

  /** Switch clip (no-op if unchanged) and evaluate the blended pose. */
  update(dt: number, name: string, frame: number): Pose {
    this.clock += dt;
    let clip = this.clips.get(name);
    if (!clip) {
      if (!this.missingWarned.has(name)) {
        this.missingWarned.add(name);
        console.warn(`[Animation] clip "${name}" is missing - using IDLE fallback`);
      }
      name = 'IDLE'; clip = this.clips.get('IDLE');
    }
    if (!clip) return this.output;
    if (name !== this.current) {
      this.from.set(this.output);
      this.current = name; this.startTime = this.clock;
      this.blendT = 0; this.blendDur = Math.max(0.001, clip.blend);
    }
    const target = clip.fn({ time: this.clock - this.startTime, frame });
    this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
    const k = this.blendT * this.blendT * (3 - 2 * this.blendT);
    mixPose(this.from, target, k, this.output);
    return this.output;
  }
}
