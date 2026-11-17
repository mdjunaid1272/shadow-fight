import * as THREE from 'three';
import type { Arena } from './Arena';
import { ArenaBase, canvasTex } from './ArenaBase';

/** Arena 3: basalt platform over a lava lake, ruined fortress, rising embers. */
export class VolcanicFortress extends ArenaBase implements Arena {
  readonly id = 'volcano'; readonly name = 'Volcanic Fortress';
  readonly bounds = { x: 6.8, z: 2.3 };
  private embers!: THREE.Points;
  private lavaTex!: THREE.CanvasTexture;
  private glow!: THREE.PointLight;
  private bgTex!: THREE.Texture;
  private static EMBERS = 170;

  build(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    this.bgTex = canvasTex(8, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#0c0407'); g.addColorStop(0.5, '#4a1208'); g.addColorStop(1, '#c4401a');
      c.fillStyle = g; c.fillRect(0, 0, 8, 256);
    }, false);
    scene.background = this.bgTex;
    scene.fog = new THREE.Fog(0x7a2a12, 14, 46);
    renderer.toneMappingExposure = 1.35;

    this.group.add(new THREE.HemisphereLight(0xff9a6a, 0x3a1a14, 1.25));
    const key = new THREE.DirectionalLight(0xffa070, 2.8); key.position.set(-6, 11, 8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); const sc = key.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 8; sc.bottom = -6; sc.near = 1; sc.far = 40;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    const rim = new THREE.DirectionalLight(0x6a8aff, 1.3); rim.position.set(7, 5, -9);
    this.group.add(key, rim);
    this.glow = new THREE.PointLight(0xff4a14, 70, 22, 2); this.glow.position.set(0, -0.3, 1.5); this.group.add(this.glow);

    // ---- cracked basalt platform with glowing seams
    const rock = canvasTex(512, 512, (c) => {
      c.fillStyle = '#26211f'; c.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 5000; i++) { const v = 20 + Math.random() * 40; c.fillStyle = `rgb(${v + 8},${v},${v - 4})`; c.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
      c.strokeStyle = '#ff6a1a'; c.lineWidth = 3; c.shadowColor = '#ff4a00'; c.shadowBlur = 8;
      for (let i = 0; i < 9; i++) { c.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120; c.lineTo(x, y); } c.stroke(); }
    });
    rock.repeat.set(4, 2);
    this.add(new THREE.BoxGeometry(18, 0.6, 7), this.track(new THREE.MeshStandardMaterial({ map: rock, roughness: 0.95, emissive: 0x3a0e00, emissiveMap: rock, emissiveIntensity: 0.45 })), 0, -0.3, 0, false);
    const edge = this.mat(0x15110f, 0.9);
    for (const z of [-3.6, 3.6]) this.add(new THREE.BoxGeometry(18.4, 0.5, 0.35), edge, 0, 0.12, z, true);

    // ---- lava lake (scrolling emissive texture)
    this.lavaTex = canvasTex(256, 256, (c) => {
      c.fillStyle = '#b02a05'; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 160; i++) { const r = 8 + Math.random() * 34; const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(255,220,80,0.9)'); g.addColorStop(1, 'rgba(255,90,10,0)'); c.save(); c.translate(Math.random() * 256, Math.random() * 256); c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2); c.restore(); }
      for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(30,8,4,${0.25 + Math.random() * 0.4})`; c.beginPath(); c.ellipse(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 16, 3 + Math.random() * 8, Math.random() * 3, 0, 6.28); c.fill(); }
    });
    this.lavaTex.repeat.set(8, 6);
    const lava = this.add(new THREE.PlaneGeometry(140, 100), this.track(new THREE.MeshBasicMaterial({ map: this.lavaTex, color: 0xffb080 })), 0, -1.4, -25, false);
    lava.rotation.x = -Math.PI / 2;

    // ---- fortress silhouette with glowing windows
    const stone = this.mat(0x2e2522, 0.95), roof = this.mat(0x1a1210, 0.9);
    const window = this.track(new THREE.MeshStandardMaterial({ color: 0xff8030, emissive: 0xff5a10, emissiveIntensity: 2.5 }));
    const tower = (x: number, z: number, h: number, r: number) => {
      this.add(new THREE.CylinderGeometry(r * 0.85, r, h, 10), stone, x, h / 2 - 1.2, z);
      this.add(new THREE.ConeGeometry(r * 1.2, r * 1.8, 10), roof, x, h - 1.2 + r * 0.9, z);
      for (let k = 0; k < 3; k++) this.add(new THREE.BoxGeometry(0.25, 0.5, 0.1), window, x + (k - 1) * r * 0.4, h * (0.45 + k * 0.17) - 1.2, z + r * 0.9, false);
    };
    tower(-10, -14, 11, 1.7); tower(10, -15, 13, 1.9); tower(-3.5, -18, 8, 1.4); tower(4, -19, 15, 2.1); tower(-17, -20, 9, 1.6); tower(17, -21, 10, 1.7);
    this.add(new THREE.BoxGeometry(34, 5.5, 1.6), stone, 0, 1.6, -16.5);
    for (let i = -7; i <= 7; i++) this.add(new THREE.BoxGeometry(1.1, 0.9, 1.7), stone, i * 2.3, 4.6, -16.5);
    this.add(new THREE.BoxGeometry(2.6, 3.2, 0.3), this.mat(0x050303), 0, 0.4, -15.6, false); // gate
    for (const x of [-1.6, 1.6]) this.add(new THREE.BoxGeometry(0.6, 0.6, 0.15), window, x, 3.2, -15.6, false);

    // ---- jagged rocks around the arena
    const rocks = this.mat(0x2a211f, 0.95, { flatShading: true });
    for (let i = 0; i < 14; i++) {
      const x = (i < 7 ? -1 : 1) * (10.5 + (i % 7) * 1.6), z = -4 - (i % 5) * 1.8, h = 2.5 + (i * 7 % 5);
      const c = this.add(new THREE.ConeGeometry(1 + (i % 3) * 0.5, h, 5), rocks, x, h / 2 - 1.3, z);
      c.rotation.y = i; c.rotation.z = (i % 2 ? 1 : -1) * 0.1;
    }

    // ---- rising embers
    this.embers = this.points(VolcanicFortress.EMBERS, (i, p) => {
      p[i * 3] = (Math.random() - 0.5) * 30; p[i * 3 + 1] = -1 + Math.random() * 10; p[i * 3 + 2] = -10 + Math.random() * 16;
    }, 0xff8a30, 0.045, 0.95);

    scene.add(this.group);
  }

  update(dt: number, time: number): void {
    this.lavaTex.offset.x = time * 0.012; this.lavaTex.offset.y = time * 0.006;
    this.glow.intensity = 70 + Math.sin(time * 3.1) * 8 + Math.sin(time * 7.7) * 5;
    const a = this.embers.geometry.attributes.position as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    for (let i = 0; i < VolcanicFortress.EMBERS; i++) {
      arr[i * 3 + 1] += (0.5 + (i % 7) * 0.12) * dt;
      arr[i * 3] += Math.sin(time * 0.8 + i) * dt * 0.4;
      if (arr[i * 3 + 1] > 9) { arr[i * 3 + 1] = -1.2; arr[i * 3] = (Math.random() - 0.5) * 30; }
    }
    a.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void { this.bgTex.dispose(); this.lavaTex.dispose(); this.disposeAll(scene); }
}
