import * as THREE from 'three';
import type { Arena } from './Arena';
import { ArenaBase, canvasTex } from './ArenaBase';

/** Arena 1: Japanese temple courtyard, warm daylight, cherry blossoms and falling petals. */
export class TempleCourtyard extends ArenaBase implements Arena {
  readonly id = 'temple'; readonly name = 'Temple Courtyard';
  readonly bounds = { x: 7.2, z: 2.4 };
  private petals!: THREE.Points;
  private petalData!: Float32Array;
  private static PETALS = 260;
  private bgTex?: THREE.Texture;

  build(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    // ---- background + atmosphere
    this.bgTex = canvasTex(8, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#4f6fa8'); g.addColorStop(0.55, '#e8b58e'); g.addColorStop(1, '#f6d7a8');
      c.fillStyle = g; c.fillRect(0, 0, 8, 256);
    });
    this.bgTex.wrapS = this.bgTex.wrapT = THREE.ClampToEdgeWrapping;
    scene.background = this.bgTex;
    scene.fog = new THREE.Fog(0xe8bf98, 22, 75);
    renderer.toneMappingExposure = 1.05;

    // ---- lights
    const hemi = new THREE.HemisphereLight(0xffe6c8, 0x3d3550, 1.1);
    const sun = new THREE.DirectionalLight(0xffd8a0, 2.6);
    sun.position.set(-7, 13, 9); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 8; sc.bottom = -6; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    const rim = new THREE.DirectionalLight(0x7f9bff, 0.7); rim.position.set(6, 5, -9);
    this.group.add(hemi, sun, rim);

    // ---- ground: tiled stone courtyard + raised fighting platform
    const stoneTex = canvasTex(512, 512, (c) => {
      c.fillStyle = '#8c8478'; c.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 4000; i++) { const v = 110 + Math.random() * 60; c.fillStyle = `rgba(${v},${v - 6},${v - 14},0.25)`; c.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3); }
      c.strokeStyle = 'rgba(40,34,30,0.75)'; c.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 128, 0); c.lineTo(i * 128, 512); c.moveTo(0, i * 128); c.lineTo(512, i * 128); c.stroke(); }
    });
    stoneTex.repeat.set(6, 2);
    const platform = this.add(new THREE.BoxGeometry(18, 0.3, 7), this.track(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 })), 0, -0.15, 0, false);
    platform.castShadow = false;
    const trimMat = this.mat(0x7a1020, 0.6, { emissive: 0x3a0610, emissiveIntensity: 0.6 });
    this.add(new THREE.BoxGeometry(18.2, 0.06, 0.12), trimMat, 0, 0.01, 3.5, false);
    this.add(new THREE.BoxGeometry(18.2, 0.06, 0.12), trimMat, 0, 0.01, -3.5, false);
    const gravelTex = canvasTex(256, 256, (c) => {
      c.fillStyle = '#6f6a62'; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 3000; i++) { const v = 80 + Math.random() * 70; c.fillStyle = `rgb(${v},${v - 4},${v - 10})`; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    });
    gravelTex.repeat.set(30, 20);
    const ground = this.add(new THREE.PlaneGeometry(160, 120), this.track(new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1 })), 0, -0.31, -20, false);
    ground.rotation.x = -Math.PI / 2; ground.castShadow = false;

    // ---- torii gate
    const red = this.mat(0xb3202a, 0.55), black = this.mat(0x15110f, 0.7);
    for (const x of [-3.4, 3.4]) {
      this.add(new THREE.CylinderGeometry(0.28, 0.34, 6.2, 14), red, x, 3, -7.5);
      this.add(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14), black, x, 0.1, -7.5);
    }
    this.add(new THREE.BoxGeometry(9.6, 0.4, 0.5), red, 0, 5.2, -7.5);
    const kasagi = this.add(new THREE.BoxGeometry(11.4, 0.4, 0.8), black, 0, 6.2, -7.5);
    kasagi.scale.set(1, 1, 1);
    for (const s of [-1, 1]) { const tip = this.add(new THREE.BoxGeometry(1.4, 0.4, 0.8), black, 5.9 * s, 6.45, -7.5); tip.rotation.z = 0.25 * s; }
    this.add(new THREE.BoxGeometry(7, 0.3, 0.4), red, 0, 4.4, -7.5);

    // ---- temple hall in the distance
    const wood = this.mat(0x4a2f22, 0.8), roofMat = this.mat(0x23262d, 0.6), plaster = this.mat(0xe3d4b8, 0.9);
    this.add(new THREE.BoxGeometry(22, 0.8, 9), this.mat(0x7d756a), 0, 0.1, -17);
    this.add(new THREE.BoxGeometry(16, 4.4, 6), plaster, 0, 2.9, -17);
    for (let i = -3; i <= 3; i++) this.add(new THREE.BoxGeometry(0.35, 4.4, 0.35), wood, i * 2.5, 2.9, -13.8);
    const roof = this.add(new THREE.ConeGeometry(11.5, 3.4, 4), roofMat, 0, 6.7, -17); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.82);
    const roof2 = this.add(new THREE.ConeGeometry(8, 2.2, 4), roofMat, 0, 9, -17); roof2.rotation.y = Math.PI / 4; roof2.scale.set(1.2, 1, 0.8);
    // distant mountains
    const mtn = this.mat(0x5d6d90, 1, { fog: true });
    [[-32, 11, -55, 16], [-8, 15, -62, 20], [26, 12, -58, 17], [48, 9, -50, 13]].forEach(([x, h, z, r]) => this.add(new THREE.ConeGeometry(r, h * 2, 6), mtn, x, h - 4, z, false));

    // ---- stone lanterns (toro) with warm glow
    const stone = this.mat(0x8a8378, 0.95), glowMat = this.track(new THREE.MeshStandardMaterial({ color: 0xffb860, emissive: 0xffa040, emissiveIntensity: 1.8 }));
    for (const [x, z] of [[-8.2, 3.8], [8.2, 3.8], [-8.2, -3.8], [8.2, -3.8]]) {
      this.add(new THREE.CylinderGeometry(0.25, 0.32, 0.5, 8), stone, x, 0.25, z);
      this.add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8), stone, x, 0.95, z);
      this.add(new THREE.BoxGeometry(0.55, 0.45, 0.55), stone, x, 1.65, z, true);
      this.add(new THREE.BoxGeometry(0.34, 0.3, 0.34), glowMat, x, 1.65, z, false);
      this.add(new THREE.ConeGeometry(0.55, 0.38, 4), stone, x, 2.05, z).rotation.y = Math.PI / 4;
    }

    // ---- cherry blossom trees
    const bark = this.mat(0x3b2a22, 1);
    const blossoms = [0xf4a9c0, 0xf8bcd0, 0xea8fae].map((c) => this.mat(c, 0.9, { flatShading: true, emissive: 0x8a3f5c, emissiveIntensity: 0.55 }));
    const trees: Array<[number, number, number]> = [[-9.5, -4.5, 1.2], [-5.5, -9, 1.0], [6.5, -9.5, 1.15], [10.5, -3.5, 1.3], [-12.5, -9, 1.1], [1.5, -11, 0.9]];
    trees.forEach(([x, z, s], i) => {
      const trunk = this.add(new THREE.CylinderGeometry(0.22 * s, 0.38 * s, 3.4 * s, 8), bark, x, 1.7 * s, z);
      trunk.rotation.z = (i % 2 ? 0.1 : -0.1);
      for (let k = 0; k < 5; k++) {
        const r = (1.5 + (k % 3) * 0.35) * s;
        this.add(new THREE.IcosahedronGeometry(r, 1), blossoms[(i + k) % 3], x + Math.cos(k * 1.9) * 1.4 * s, 3.8 * s + Math.sin(k * 2.3) * 0.5, z + Math.sin(k * 1.9) * 1.1 * s, true);
      }
    });

    // ---- falling petals (single Points draw call)
    const n = TempleCourtyard.PETALS;
    this.petalData = new Float32Array(n * 3);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 9; pos[i * 3 + 2] = -8 + Math.random() * 18;
      this.petalData[i * 3] = Math.random() * 6.28; this.petalData[i * 3 + 1] = 0.4 + Math.random() * 0.6; this.petalData[i * 3 + 2] = 0.5 + Math.random();
    }
    const pg = this.track(new THREE.BufferGeometry()); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.petals = new THREE.Points(pg, this.track(new THREE.PointsMaterial({ color: 0xffc4d6, size: 0.11, transparent: true, opacity: 0.9, depthWrite: false })));
    this.petals.frustumCulled = false;
    this.group.add(this.petals);

    scene.add(this.group);
  }

  update(dt: number, time: number): void {
    const p = this.petals.geometry.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < TempleCourtyard.PETALS; i++) {
      const ph = this.petalData[i * 3], fall = this.petalData[i * 3 + 1], sway = this.petalData[i * 3 + 2];
      a[i * 3] += Math.sin(time * sway + ph) * dt * 0.6 + dt * 0.25;
      a[i * 3 + 1] -= fall * dt;
      a[i * 3 + 2] += Math.cos(time * sway * 0.7 + ph) * dt * 0.3;
      if (a[i * 3 + 1] < 0) { a[i * 3 + 1] = 9; a[i * 3] = (Math.random() - 0.5) * 30; }
      if (a[i * 3] > 15) a[i * 3] = -15;
    }
    p.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    this.bgTex?.dispose();
    this.disposeAll(scene);
  }
}

