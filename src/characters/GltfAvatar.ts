import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { JOINTS, type Joint } from './AnimationController';

/**
 * Wraps a loaded GLB as a drop-in visual for a fighter. Gameplay never touches
 * it: FighterModel asks for a clip by name and the avatar plays the matching
 * AnimationClip with an AnimationMixer (crossfaded).
 *
 * Honesty rules:
 *  - Clip names are normalised (e.g. "Light Attack 1" -> LIGHT1). A clip the GLB lacks is NEVER
 *    pretended to exist: the avatar plays IDLE instead and records the miss in report().
 *  - Bones are matched by common rig names (Mixamo etc.); unmatched joints are listed in report().
 */
export const BONE_ALIASES: Record<Joint, string[]> = {
  hips: ['hips', 'pelvis', 'mixamorighips'],
  torso: ['spine', 'spine1', 'chest', 'mixamorigspine', 'mixamorigspine1'],
  head: ['head', 'mixamorighead'],
  shL: ['leftarm', 'upperarml', 'upperarm_l', 'mixamorigleftarm', 'shoulderl', 'arm_l'],
  shR: ['rightarm', 'upperarmr', 'upperarm_r', 'mixamorigrightarm', 'shoulderr', 'arm_r'],
  elL: ['leftforearm', 'forearml', 'forearm_l', 'mixamorigleftforearm'],
  elR: ['rightforearm', 'forearmr', 'forearm_r', 'mixamorigrightforearm'],
  hpL: ['leftupleg', 'thighl', 'thigh_l', 'mixamorigleftupleg'],
  hpR: ['rightupleg', 'thighr', 'thigh_r', 'mixamorigrightupleg'],
  knL: ['leftleg', 'shinl', 'calf_l', 'mixamorigleftleg'],
  knR: ['rightleg', 'shinr', 'calf_r', 'mixamorigrightleg'],
};
const HAND_R = ['righthand', 'handr', 'hand_r', 'mixamorigrighthand', 'wrist_r'];

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9_]/g, '');

/** Common authoring names -> this game's clip names. */
const CLIP_ALIASES: Record<string, string> = {
  IDLE: 'IDLE', WALK: 'WALK', RUN: 'RUN', JUMP: 'JUMP', FALL: 'FALL', LAND: 'LAND', BLOCK: 'BLOCK',
  BACKWARD: 'BACKWARD', WALK_BACK: 'BACKWARD', WALKBACKWARD: 'BACKWARD',
  DODGE_LEFT: 'DODGE_LEFT', DODGE_RIGHT: 'DODGE_RIGHT',
  LIGHT_ATTACK_1: 'LIGHT1', LIGHTATTACK1: 'LIGHT1', LIGHT_1: 'LIGHT1', LIGHT1: 'LIGHT1',
  LIGHT_ATTACK_2: 'LIGHT2', LIGHTATTACK2: 'LIGHT2', LIGHT_2: 'LIGHT2', LIGHT2: 'LIGHT2',
  HEAVY_ATTACK: 'HEAVY', HEAVYATTACK: 'HEAVY', HEAVY: 'HEAVY', KICK: 'KICK', WEAPON_ATTACK: 'WEAPON_ATTACK',
  SPECIAL_ATTACK: 'SPECIAL', SPECIAL: 'SPECIAL', ULTIMATE: 'ULTIMATE', AIR_LIGHT: 'AIRLIGHT', AIRLIGHT: 'AIRLIGHT',
  HIT_FRONT: 'HIT_FRONT', HIT_BACK: 'HIT_BACK', HIT_HEAVY: 'HIT_HEAVY', STAGGER: 'STAGGER', LAUNCH: 'LAUNCH',
  KNOCKDOWN: 'KNOCKDOWN', GETUP: 'GETUP', GET_UP: 'GETUP', VICTORY: 'VICTORY', DEFEAT: 'DEFEAT',
};
export function normalizeClipName(name: string): string {
  const k = name.trim().toUpperCase().replace(/[\s.\-|:]+/g, '_');
  return CLIP_ALIASES[k] ?? CLIP_ALIASES[k.replace(/_/g, '')] ?? k;
}

export interface AvatarReport { mappedJoints: Joint[]; missingJoints: Joint[]; clips: string[]; handSocket: boolean }

export class GltfAvatar {
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly bones: Partial<Record<Joint, THREE.Bone>> = {};
  /** Right-hand bone, used as the weapon attachment point. */
  handSocket: THREE.Bone | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private warned = new Set<string>();

  constructor(gltf: GLTF) {
    this.root = gltf.scene;
    this.mixer = new THREE.AnimationMixer(this.root);
    const byName = new Map<string, THREE.Bone>();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.frustumCulled = false; }
      if ((o as THREE.Bone).isBone) byName.set(norm(o.name), o as THREE.Bone);
    });
    for (const j of JOINTS) for (const alias of BONE_ALIASES[j]) { const b = byName.get(norm(alias)); if (b) { this.bones[j] = b; break; } }
    for (const a of HAND_R) { const b = byName.get(norm(a)); if (b) { this.handSocket = b; break; } }
    for (const c of gltf.animations) this.clips.set(normalizeClipName(c.name), c);
  }

  static fromGltf(gltf: GLTF): GltfAvatar { return new GltfAvatar(gltf); }

  hasClip(name: string): boolean { return this.clips.has(name); }

  /** Which joints/clips were found - surfaced in the console so missing animation is never silent. */
  report(): AvatarReport {
    const mapped = JOINTS.filter((j) => this.bones[j]);
    return { mappedJoints: mapped, missingJoints: JOINTS.filter((j) => !this.bones[j]), clips: [...this.clips.keys()], handSocket: !!this.handSocket };
  }

  /** Play a clip by game name; falls back to IDLE (and warns once) when the GLB lacks it. Returns the clip actually used. */
  play(name: string, fade = 0.1): string {
    let use = name;
    if (!this.clips.has(use)) {
      if (!this.warned.has(name)) { this.warned.add(name); console.warn(`[Avatar] GLB has no clip "${name}" - using IDLE fallback`); }
      use = this.clips.has('IDLE') ? 'IDLE' : '';
    }
    if (!use) return '';
    if (use === this.currentName) return use;
    const next = this.mixer.clipAction(this.clips.get(use)!);
    const loops = /^(IDLE|WALK|BACKWARD|RUN|BLOCK|FALL|VICTORY|DEFEAT|KNOCKDOWN)$/.test(use);
    next.setLoop(loops ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); next.clampWhenFinished = !loops;
    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next; this.currentName = use;
    return use;
  }

  update(dt: number): void { this.mixer.update(dt); }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((x) => x.dispose());
    });
  }
}
