import * as THREE from 'three';
import { HitEffects } from './HitEffects';
import { ParticleSystem } from './ParticleSystem';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

interface Ring { obj: THREE.Object3D; mat: THREE.Material & { opacity: number; color: THREE.Color }; life: number; max: number; size: number; ground: boolean }

/**
 * Combat VFX director. Owns two pooled particle systems (additive sparks /
 * energy and alpha dust / shadow smoke), pooled shockwave rings and the
 * impact flash sprites. Nothing is allocated while playing.
 */
export class VFX {
  private sparks: ParticleSystem;
  private smoke: ParticleSystem;
  private flashes: HitEffects;
  private rings: Ring[] = [];
  private ringTex: THREE.CanvasTexture;
  private groundGeo = new THREE.RingGeometry(0.82, 1, 48);
  /** 0.5..1 - lowered automatically on weak devices to cut particle counts. */
  density = 1;

  constructor(private scene: THREE.Scene) {
    this.sparks = new ParticleSystem(scene, 900, true, 1.6);
    this.smoke = new ParticleSystem(scene, 360, false, 0.9);
    this.flashes = new HitEffects(scene, 14);

    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(64, 64, 40, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    this.ringTex = new THREE.CanvasTexture(cv);

    for (let i = 0; i < 8; i++) { // camera-facing impact rings
      const mat = new THREE.SpriteMaterial({ map: this.ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(mat); s.visible = false; scene.add(s);
      this.rings.push({ obj: s, mat, life: 0, max: 1, size: 1, ground: false });
    }
    for (let i = 0; i < 5; i++) { // flat ground shockwaves
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const m = new THREE.Mesh(this.groundGeo, mat); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      this.rings.push({ obj: m, mat, life: 0, max: 1, size: 1, ground: true });
    }
  }

  private n(count: number): number { return Math.max(1, Math.round(count * this.density)); }

  private ring(ground: boolean, x: number, y: number, z: number, color: number, size: number, life: number): void {
    const r = this.rings.find((q) => q.ground === ground && q.life <= 0) ?? this.rings.find((q) => q.ground === ground)!;
    r.life = r.max = life; r.size = size; r.obj.position.set(x, y, z); r.obj.visible = true; r.mat.color.set(color);
  }

  /** A landed hit. dir is the unit push direction (attacker -> defender). */
  hit(o: { x: number; y: number; z: number; dx: number; dz: number; color: number; strength: number; blocked: boolean; knockdown: boolean }): void {
    const { x, y, z, dx, dz, blocked, knockdown } = o;
    const s = Math.max(0.2, Math.min(1.2, o.strength));
    const count = this.n((blocked ? 9 : knockdown ? 38 : 17) * (0.6 + 0.7 * s));
    const base = blocked ? 0x9fd0ff : o.color;
    for (let i = 0; i < count; i++) {
      const sp = rand(2.6, 7.5) * (0.7 + s * 0.6) * (blocked ? 0.8 : 1);
      const side = rand(-0.9, 0.9);
      this.sparks.emit({
        x, y, z,
        vx: dx * sp * rand(0.4, 1.2) - dz * side * sp * 0.6 + rand(-1, 1),
        vy: rand(0.4, 1) * sp * 0.75,
        vz: dz * sp * rand(0.4, 1.2) + dx * side * sp * 0.6 + rand(-1, 1),
        life: rand(0.18, 0.45), size: rand(0.05, 0.11) * (0.8 + s * 0.5), sizeEnd: 0.01,
        color: i % 3 === 0 ? 0xffffff : base, gravity: -9, drag: 1.4,
      });
    }
    this.flashes.spawn(x, y, z, blocked, knockdown);
    this.ring(false, x, y, z, blocked ? 0x9fd0ff : 0xffe0b0, blocked ? 1.1 : 1.5 + s, 0.22);
    if (!blocked) for (let i = 0; i < this.n(2 + Math.round(s * 3)); i++) this.smoke.emit({ x, y: y - 0.2, z, vx: dx * rand(0.2, 1) + rand(-0.4, 0.4), vy: rand(0.2, 0.8), vz: dz * rand(0.2, 1) + rand(-0.4, 0.4), life: rand(0.35, 0.6), size: 0.25, sizeEnd: 0.8, color: 0xe8dcc8, alpha: 0.28, drag: 2 });
    if (knockdown) this.dust(x, z, 8, 0.45, 2.2);
  }

  /** Ground dust puff (footsteps, landings, dodges, knockdown thuds). */
  dust(x: number, z: number, count: number, size: number, spread = 1): void {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * TAU, sp = rand(0.4, 1.4) * spread;
      this.smoke.emit({ x: x + Math.cos(a) * 0.15, y: 0.08, z: z + Math.sin(a) * 0.15, vx: Math.cos(a) * sp, vy: rand(0.2, 0.7), vz: Math.sin(a) * sp, life: rand(0.5, 0.95), size, sizeEnd: size * 2.8, color: 0xb9a98e, alpha: 0.36, drag: 2.2 });
    }
  }

  /** Heavy ground impact: shockwave ring + radial dust + low sparks. */
  groundSlam(x: number, z: number, color: number, radius = 3): void {
    this.ring(true, x, 0.04, z, color, radius, 0.45);
    this.dust(x, z, 16, 0.5, 3.2);
    for (let i = 0; i < this.n(14); i++) {
      const a = Math.random() * TAU, sp = rand(2, 6);
      this.sparks.emit({ x, y: 0.1, z, vx: Math.cos(a) * sp, vy: rand(1, 3), vz: Math.sin(a) * sp, life: rand(0.25, 0.5), size: 0.07, sizeEnd: 0.01, color, gravity: -9, drag: 1 });
    }
  }

  /** Called every frame while a special/ultimate winds up: dark shadow smoke + rising energy motes. */
  chargeWisps(x: number, y: number, z: number, color: number, power: number): void {
    const n = this.n(power > 1 ? 4 : 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = rand(0.35, 0.9);
      this.sparks.emit({ x: x + Math.cos(a) * r, y: y + rand(-0.6, 0.4), z: z + Math.sin(a) * r, vx: -Math.cos(a) * 0.5, vy: rand(0.8, 2.2), vz: -Math.sin(a) * 0.5, life: rand(0.4, 0.7), size: rand(0.07, 0.13), sizeEnd: 0.01, color, drag: 0.5 });
    }
    if (Math.random() < 0.7 * this.density) {
      const a = Math.random() * TAU, r = rand(0.3, 0.7);
      this.smoke.emit({ x: x + Math.cos(a) * r, y: y - 0.5, z: z + Math.sin(a) * r, vx: Math.cos(a) * 0.3, vy: rand(0.6, 1.4), vz: Math.sin(a) * 0.3, life: rand(0.6, 1), size: 0.3, sizeEnd: 0.9, color: 0x1a0a2a, alpha: 0.5, drag: 0.8 });
    }
  }

  /** Streak of energy behind a dashing special. */
  dashTrail(x: number, y: number, z: number, color: number): void {
    for (let i = 0; i < this.n(3); i++) {
      this.sparks.emit({ x: x + rand(-0.2, 0.2), y: y + rand(-0.8, 0.5), z: z + rand(-0.2, 0.2), vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.5), vz: rand(-0.3, 0.3), life: rand(0.25, 0.4), size: rand(0.12, 0.2), sizeEnd: 0.02, color, alpha: 0.9, drag: 2 });
    }
  }

  /** Big radial release when a special / ultimate fires (or a KO lands). */
  burst(x: number, y: number, z: number, color: number, big: boolean): void {
    const count = this.n(big ? 95 : 46);
    for (let i = 0; i < count; i++) {
      const th = Math.random() * TAU, ph = Math.acos(rand(-0.4, 1)), sp = rand(3, big ? 11 : 8);
      this.sparks.emit({ x, y, z, vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp * 0.8, vz: Math.sin(ph) * Math.sin(th) * sp, life: rand(0.35, 0.8), size: rand(0.06, 0.14), sizeEnd: 0.01, color: i % 4 === 0 ? 0xffffff : color, gravity: -3, drag: 1.2 });
    }
    this.ring(false, x, y, z, color, big ? 6 : 3.6, big ? 0.5 : 0.35);
    this.ring(true, x, 0.05, z, color, big ? 4.5 : 2.6, big ? 0.55 : 0.4);
    this.flashes.flash(x, y, z, color, big ? 3.6 : 2.2, big ? 0.5 : 0.35);
    this.dust(x, z, big ? 14 : 7, 0.45, 2.4);
  }

  perfectDodge(x: number, y: number, z: number): void {
    for (let i = 0; i < this.n(18); i++) {
      const a = Math.random() * TAU, sp = rand(1.5, 4);
      this.sparks.emit({ x, y: y + rand(-0.6, 0.5), z, vx: Math.cos(a) * sp, vy: rand(0, 1.5), vz: Math.sin(a) * sp, life: rand(0.3, 0.6), size: rand(0.06, 0.1), sizeEnd: 0.01, color: i % 2 ? 0x6fe0ff : 0xffffff, drag: 1.5 });
    }
    this.ring(false, x, y, z, 0x6fe0ff, 2.2, 0.3);
  }

  /** Per-frame: sync point size to the viewport and advance every effect. */
  update(dt: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void {
    const h = renderer.domElement.height;
    const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.sparks.setScale(scale); this.smoke.setScale(scale);
    this.sparks.update(dt); this.smoke.update(dt); this.flashes.update(dt);
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.obj.visible = false; continue; }
      const k = 1 - r.life / r.max, e = 1 - (1 - k) * (1 - k);
      const sc = r.size * (0.25 + e * 0.9);
      r.obj.scale.set(sc, r.ground ? sc : sc, sc);
      r.mat.opacity = (1 - k) * (1 - k) * (r.ground ? 0.8 : 0.9);
    }
  }

  get particleCount(): number { return this.sparks.alive + this.smoke.alive; }

  dispose(): void {
    this.sparks.dispose(this.scene); this.smoke.dispose(this.scene); this.flashes.dispose();
    for (const r of this.rings) { this.scene.remove(r.obj); r.mat.dispose(); }
    this.groundGeo.dispose(); this.ringTex.dispose();
  }
}
