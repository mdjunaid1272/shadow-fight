import * as THREE from 'three';

export interface EmitOpts {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size: number; sizeEnd?: number;
  color: number; alpha?: number;
  gravity?: number; drag?: number;
}

const VERT = /* glsl */ `
attribute vec4 aColor; attribute float aSize;
varying vec4 vColor; uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec4 vColor; uniform float uSoft;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * pow(1.0 - d, uSoft));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Fixed-capacity GPU point-sprite particle pool (one draw call, zero runtime
 * allocation). New particles overwrite the oldest slot when full.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array; private vel: Float32Array;
  private col: Float32Array; private size: Float32Array;
  private age: Float32Array; private life: Float32Array;
  private s0: Float32Array; private s1: Float32Array; private a0: Float32Array;
  private grav: Float32Array; private drag: Float32Array;
  private head = 0;
  private live = 0;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private c = new THREE.Color();

  constructor(scene: THREE.Scene, capacity: number, additive: boolean, soft: number) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3); this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4); this.size = new Float32Array(capacity);
    this.age = new Float32Array(capacity).fill(1); this.life = new Float32Array(capacity).fill(1);
    this.s0 = new Float32Array(capacity); this.s1 = new Float32Array(capacity); this.a0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity); this.drag = new Float32Array(capacity);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 }, uSoft: { value: soft } },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }

  setScale(s: number): void { this.mat.uniforms.uScale.value = s; }
  get alive(): number { return this.live; }

  emit(o: EmitOpts): void {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx ?? 0; this.vel[i * 3 + 1] = o.vy ?? 0; this.vel[i * 3 + 2] = o.vz ?? 0;
    this.c.set(o.color);
    this.col[i * 4] = this.c.r; this.col[i * 4 + 1] = this.c.g; this.col[i * 4 + 2] = this.c.b; this.col[i * 4 + 3] = o.alpha ?? 1;
    this.age[i] = 0; this.life[i] = o.life; this.s0[i] = o.size; this.s1[i] = o.sizeEnd ?? o.size * 0.3;
    this.a0[i] = o.alpha ?? 1; this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0;
    this.size[i] = o.size;
    this.live = Math.max(1, this.live); // wake the updater
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) { this.size[i] = 0; continue; }
      live++;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] < 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t) * (1 - t * 0.3);
    }
    this.live = live;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void { scene.remove(this.points); this.geo.dispose(); this.mat.dispose(); }
}
