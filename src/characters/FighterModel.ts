import * as THREE from 'three';
import { AnimationController, IDX_ROOTY, IDX_ROOTZ, IDX_TILT, JOINTS, type Joint, type Pose } from './AnimationController';
import type { AttackData } from '../combat/types';
import { registerClips } from './ProceduralClips';
import type { GltfAvatar } from './GltfAvatar';
import { Fighter } from '../combat/Fighter';
import type { CharacterDef, Palette, WeaponKind } from './CharacterData';

const std = (color: number, rough = 0.7, metal = 0.05) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/**
 * Temporary articulated stylized warrior (procedural, no cubes as limbs).
 * Real GLB models can replace this by providing the same joint map
 * (see `joints`) - gameplay code only touches Fighter + FighterModel API.
 */
/**
 * A rigged GLB is authored in its own stance (the Titan model stands in a wide crouch), so the procedural pose is applied as a
 * damped delta on top of it: leg bends and the root drop are reduced so the stance does not stack into a deep squat.
 */
const GLB_POSE_SCALE: Partial<Record<Joint, number>> = { hpL: 0.45, hpR: 0.45, knL: 0.4, knR: 0.4, hips: 0.7 };
const GLB_ROOTY_SCALE = 0.4;

export class FighterModel {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private joints = {} as Record<Joint, THREE.Object3D>;
  readonly anim = new AnimationController();
  private bladeBase = new THREE.Object3D();
  private bladeTip = new THREE.Object3D();
  private trail: WeaponTrail;
  private disposables: Array<{ dispose(): void }> = [];
  /** When set, a loaded GLB replaces the procedural body (see attachGltf). */
  avatar: GltfAvatar | null = null;

  /** @param glowBoost cosmetic weapon-tier multiplier for the weapon's emissive glow. */
  constructor(def: CharacterDef, scene: THREE.Scene, private glowBoost = 1) {
    const attacks: Record<string, AttackData> = def.stats.attacks;
    this.build(def.palette, def.weapon);
    this.tilt.scale.setScalar(def.scale);
    registerClips(this.anim, def);
    this.trail = new WeaponTrail(scene, def.palette.glow);
    this.root.add(this.tilt);
    scene.add(this.root);
  }

  private mat(color: number, rough = 0.7, metal = 0.05): THREE.MeshStandardMaterial {
    const m = std(color, rough, metal); this.disposables.push(m); return m;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, y = 0, x = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true;
    this.disposables.push(geo);
    parent.add(m); return m;
  }

  private pivot(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
  }

  /** Capsule hanging down from its pivot. */
  private limb(parent: THREE.Object3D, len: number, r: number, mat: THREE.Material): void {
    this.mesh(new THREE.CapsuleGeometry(r, len - r * 2, 6, 12), mat, parent, -len / 2);
  }

  private build(p: Palette, weapon: WeaponKind): void {
    const skin = this.mat(p.skin, 0.6), cloth = this.mat(p.cloth, 0.85), dark = this.mat(p.clothDark, 0.9);
    const accent = this.mat(p.accent, 0.5), hair = this.mat(p.hair, 0.8);
    const metal = this.mat(p.metal, 0.25, 0.9);
    const glow = new THREE.MeshStandardMaterial({ color: p.glow, emissive: p.glow, emissiveIntensity: 1.6 * this.glowBoost });
    this.disposables.push(glow);

    const hips = this.pivot(this.tilt, 0, 0.97, 0); this.joints.hips = hips;
    this.mesh(new THREE.CapsuleGeometry(0.17, 0.08, 6, 12), dark, hips).rotation.z = Math.PI / 2;
    const sash = this.mesh(new THREE.TorusGeometry(0.19, 0.04, 8, 20), accent, hips, 0.1);
    sash.rotation.x = Math.PI / 2; sash.scale.set(1, 0.85, 1);
    // sash tails
    for (const s of [-1, 1]) { const t = this.mesh(new THREE.CapsuleGeometry(0.03, 0.3, 4, 8), accent, hips, -0.12, 0.1 * s, -0.18); t.rotation.x = 0.2; }

    // legs (hakama-style wide trousers)
    for (const side of [-1, 1] as const) {
      const hp = this.pivot(hips, 0.12 * side, -0.02, 0); this.joints[side < 0 ? 'hpR' : 'hpL'] = hp;
      this.limb(hp, 0.46, 0.11, dark);
      const kn = this.pivot(hp, 0, -0.46, 0); this.joints[side < 0 ? 'knR' : 'knL'] = kn;
      this.limb(kn, 0.46, 0.095, cloth);
      this.mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 8), dark, kn, -0.46, 0, 0.07).rotation.x = Math.PI / 2;
    }

    // torso
    const torso = this.pivot(hips, 0, 0.05, 0); this.joints.torso = torso;
    this.mesh(new THREE.CapsuleGeometry(0.2, 0.3, 8, 14), cloth, torso, 0.3).scale.set(1, 1, 0.75);
    const chestWrap = this.mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), accent, torso, 0.32);
    chestWrap.rotation.set(Math.PI / 2, 0, 0.5); chestWrap.scale.set(1, 0.8, 1);
    const collar = this.mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16, Math.PI), dark, torso, 0.56);
    collar.rotation.set(0, 0, Math.PI);

    // arms
    for (const side of [-1, 1] as const) {
      const sh = this.pivot(torso, 0.27 * side, 0.52, 0); this.joints[side < 0 ? 'shR' : 'shL'] = sh;
      this.mesh(new THREE.SphereGeometry(0.11, 12, 8), dark, sh).scale.set(1.2, 0.8, 1.1);
      this.limb(sh, 0.3, 0.07, cloth);
      const el = this.pivot(sh, 0, -0.3, 0); this.joints[side < 0 ? 'elR' : 'elL'] = el;
      this.limb(el, 0.3, 0.06, skin);
      this.mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), dark, el, -0.2); // bracer
      const hand = this.mesh(new THREE.SphereGeometry(0.065, 10, 8), skin, el, -0.32);
      this.buildWeapon(weapon, side, hand, { metal, accent, glow, dark });
    }

    // head
    const head = this.pivot(torso, 0, 0.62, 0); this.joints.head = head;
    this.mesh(new THREE.SphereGeometry(0.13, 16, 14), skin, head, 0.13).scale.set(0.95, 1.05, 1);
    this.mesh(new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, head, 0.16, 0, -0.015);
    const tail = this.mesh(new THREE.CapsuleGeometry(0.045, 0.28, 4, 8), hair, head, 0.12, 0, -0.18); tail.rotation.x = -0.5;
    const band = this.mesh(new THREE.TorusGeometry(0.135, 0.022, 6, 20), accent, head, 0.2); band.rotation.x = Math.PI / 2;
    // lower-face mask
    this.mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), dark, head, 0.13, 0, 0.005);
    for (const s of [-1, 1]) this.mesh(new THREE.SphereGeometry(0.02, 6, 6), glow, head, 0.15, 0.05 * s, 0.12);

    for (const j of JOINTS) if (!this.joints[j]) throw new Error(`rig missing joint ${j}`);
  }

  /** Attach the character's weapon. Right hand (side < 0) drives the trail anchor points. */
  private buildWeapon(kind: WeaponKind, side: number, hand: THREE.Object3D, m: { metal: THREE.Material; accent: THREE.Material; glow: THREE.Material; dark: THREE.Material }): void {
    const right = side < 0;
    const g = new THREE.Group(); hand.add(g);
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.castShadow = true;
      g.add(mesh); this.disposables.push(geo); return mesh;
    };
    const R = Math.PI / 2;
    if (kind === 'katana') {
      if (!right) return;
      part(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), m.dark, 0, 0, 0.02, R);
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 12), m.accent, 0, 0, 0.18, R);
      part(new THREE.BoxGeometry(0.012, 0.045, 0.85), m.metal, 0, 0, 0.6);
      part(new THREE.BoxGeometry(0.006, 0.008, 0.83), m.glow, 0, -0.022, 0.6);
      this.setTrail(g, 0.25, 1.02);
    } else if (kind === 'daggers') {
      part(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), m.dark, 0, 0, 0, R);
      part(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 10), m.accent, 0, 0, 0.09, R);
      part(new THREE.BoxGeometry(0.01, 0.04, 0.38), m.metal, 0, 0, 0.29);
      part(new THREE.BoxGeometry(0.005, 0.008, 0.36), m.glow, 0, -0.02, 0.29);
      if (right) this.setTrail(g, 0.12, 0.48);
    } else if (kind === 'gauntlets') {
      part(new THREE.SphereGeometry(0.135, 14, 10), m.metal, 0, 0, 0.04).scale.set(1, 1, 1.1);
      part(new THREE.CylinderGeometry(0.105, 0.12, 0.2, 12), m.metal, 0, 0.17, 0, 0);
      part(new THREE.TorusGeometry(0.11, 0.02, 6, 16), m.glow, 0, 0.1, 0, R);
      part(new THREE.BoxGeometry(0.06, 0.06, 0.05), m.accent, 0, 0, 0.17);
      if (right) this.setTrail(g, 0.0, 0.3);
    } else {
      if (!right) return;
      // spear: shaft along +z, gripped a third from the butt
      part(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 8), m.dark, 0, 0, 0.6, R);
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), m.accent, 0, 0, 1.4, R);
      part(new THREE.ConeGeometry(0.05, 0.38, 6), m.metal, 0, 0, 1.72, R);
      part(new THREE.ConeGeometry(0.02, 0.3, 4), m.glow, 0, 0, 1.7, R).scale.set(1.6, 1, 1);
      part(new THREE.CapsuleGeometry(0.03, 0.2, 4, 8), m.accent, 0, -0.1, 1.38, 0);
      this.setTrail(g, 1.5, 1.95);
    }
  }

  private setTrail(g: THREE.Object3D, base: number, tip: number): void {
    this.bladeBase.position.z = base; this.bladeTip.position.z = tip;
    g.add(this.bladeBase, this.bladeTip);
  }

  /**
   * Swap the procedural body for a loaded GLB. Gameplay code is unaffected: update() still maps the
   * fighter state to a clip name, which the avatar plays (or falls back to its IDLE, reported in the console).
   * Weapon trails are disabled for GLB avatars until trail sockets are authored; cosmetic palettes apply to procedural bodies only.
   */
  attachGltf(avatar: GltfAvatar): void {
    this.avatar?.root.removeFromParent();
    this.tilt.children.forEach((c) => { c.visible = false; });
    this.tilt.add(avatar.root); avatar.root.visible = true;
    this.avatar = avatar;
    const r = avatar.report();
    console.info(`[Avatar] GLB attached: ${r.mappedJoints.length}/11 joints mapped, clips: ${r.clips.join(', ') || 'none'}${r.missingJoints.length ? ` (unmapped joints: ${r.missingJoints.join(', ')})` : ''}`);
  }

  /** Map fighter simulation state to a clip name. */
  static clipFor(f: Fighter): string {
    switch (f.state) {
      case 'idle': return f.landTimer > 0 ? 'LAND' : 'IDLE';
      case 'walk': return f.running ? 'RUN' : 'WALK'; // direction decided by caller via backward flag
      case 'jump': return f.vy < 0 ? 'FALL' : 'JUMP';
      case 'block': return 'BLOCK';
      case 'crouch': return 'CROUCH';
      case 'grabbed': return 'HIT_HEAVY';
      case 'blockstun': return f.stunFrames >= 18 ? 'STAGGER' : 'BLOCK';
      case 'dodge': return f.dodgeDir > 0 ? 'DODGE_RIGHT' : 'DODGE_LEFT';
      case 'attack': return f.attack?.clip ?? 'IDLE';
      case 'hitstun': return f.guardBroken || f.stagger ? 'STAGGER' : f.hitFromBack ? 'HIT_BACK' : f.stunFrames >= 28 ? 'HIT_HEAVY' : f.hitsTaken % 2 ? 'HIT_FRONT' : 'HIT_FRONT_B';
      case 'knockdown': case 'defeat': return f.grounded && f.vy === 0 ? (f.state === 'defeat' ? 'DEFEAT' : 'KNOCKDOWN') : 'LAUNCH';
      case 'getup': return 'GETUP';
      case 'victory': return 'VICTORY';
    }
  }

  /** Sync transform + pose from simulation state. frozen => hitstop: animation does not advance. */
  update(dt: number, f: Fighter, backward: boolean, frozen: boolean): void {
    this.root.position.set(f.x, f.y, f.z);
    this.root.rotation.y = Math.atan2(f.fx, f.fz);
    let clip = FighterModel.clipFor(f);
    if (clip === 'WALK' && backward) clip = 'BACKWARD';
    if (this.avatar && !this.avatar.hasClips) { // rigged GLB without clips: drive its bones from the procedural poses
      const frame = f.state === 'attack' ? f.attackFrame : f.stateFrame;
      const pose = this.anim.update(frozen ? 0 : dt, clip, frame);
      this.avatar.applyPose(pose, GLB_POSE_SCALE);
      this.tilt.position.y = pose[IDX_ROOTY] * GLB_ROOTY_SCALE; this.tilt.position.z = pose[IDX_ROOTZ]; this.tilt.rotation.x = pose[IDX_TILT];
      this.trail.update(this.bladeBase, this.bladeTip, false);
      return;
    }
    if (this.avatar) { // GLB path: the AnimationMixer drives the skeleton
      this.tilt.position.set(0, 0, 0); this.tilt.rotation.x = 0;
      this.avatar.play(clip === 'DODGE' ? 'DODGE_LEFT' : clip); this.avatar.update(frozen ? 0 : dt); return;
    }
    const frame = f.state === 'attack' ? f.attackFrame : f.stateFrame;
    const pose = this.anim.update(frozen ? 0 : dt, clip, frame);
    this.apply(pose);
    this.trail.update(this.bladeBase, this.bladeTip, f.state === 'attack' && f.attackPhase !== 'recovery' && f.attackFrame > (f.attack?.startup ?? 0) * 0.5);
  }

  private apply(p: Pose): void {
    JOINTS.forEach((j, i) => this.joints[j].rotation.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
    this.tilt.position.y = p[IDX_ROOTY];
    this.tilt.position.z = p[IDX_ROOTZ];
    this.tilt.rotation.x = p[IDX_TILT];
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.avatar?.dispose();
    this.trail.dispose(scene);
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Ribbon trail following a blade; fades out when inactive. Single reused geometry. */
class WeaponTrail {
  private static N = 14;
  private pts: Array<[THREE.Vector3, THREE.Vector3]> = [];
  private mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(WeaponTrail.N * 2 * 3);
  private col = new Float32Array(WeaponTrail.N * 2 * 4);
  private a = new THREE.Vector3(); private b = new THREE.Vector3();

  constructor(scene: THREE.Scene, color: number) {
    const N = WeaponTrail.N;
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const c = new THREE.Color(color);
    for (let i = 0; i < N * 2; i++) {
      const fade = 1 - Math.floor(i / 2) / (N - 1);
      this.col.set([c.r, c.g, c.b, fade * 0.7], i * 4);
    }
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(base: THREE.Object3D, tip: THREE.Object3D, on: boolean): void {
    const N = WeaponTrail.N;
    if (on) {
      base.getWorldPosition(this.a); tip.getWorldPosition(this.b);
      this.pts.unshift([this.a.clone(), this.b.clone()]);
      if (this.pts.length > N) this.pts.pop();
    } else if (this.pts.length) this.pts.pop();
    this.mesh.visible = this.pts.length > 1;
    if (!this.mesh.visible) return;
    for (let i = 0; i < N; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      this.pos.set([p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh); this.geo.dispose(); (this.mesh.material as THREE.Material).dispose();
  }
}

