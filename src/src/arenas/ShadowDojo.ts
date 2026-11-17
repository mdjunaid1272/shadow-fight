import * as THREE from 'three';
import type { Arena } from './Arena';
import { ArenaBase, canvasTex } from './ArenaBase';

/** Arena 2: dark wooden dojo, paper lanterns, moody spotlight and drifting dust. */
export class ShadowDojo extends ArenaBase implements Arena {
  readonly id = 'dojo'; readonly name = 'Shadow Dojo';
  readonly bounds = { x: 6.6, z: 2.2 };
  /** Side walls are at x = +/-11 and the ceiling at y = 6.5: keep the camera inside the room. */
  readonly cameraLimits = { maxX: 9.8, maxY: 5.4 };
  private dust!: THREE.Points;
  private static DUST = 140;
  private lanterns: THREE.PointLight[] = [];

  build(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    scene.background = new THREE.Color(0x07060b);
    scene.fog = new THREE.Fog(0x0a0810, 14, 42);
    renderer.toneMappingExposure = 1.15;

    // ---- lighting: dim ambient, one hard warm spot with shadows, amber lantern glows
    this.group.add(new THREE.HemisphereLight(0x8090c0, 0x1a1420, 0.55));
    const spot = new THREE.SpotLight(0xffd9a8, 220, 40, 0.62, 0.55, 1.4);
    spot.position.set(-2.5, 10, 6); spot.target.position.set(0, 0, 0); spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.03;
    this.group.add(spot, spot.target);
    const rim = new THREE.DirectionalLight(0xff3a50, 0.7); rim.position.set(5, 4, -9); this.group.add(rim);
    for (const x of [-6.5, 6.5]) {
      const l = new THREE.PointLight(0xffa850, 38, 16, 2); l.position.set(x, 3.2, -4); this.group.add(l); this.lanterns.push(l);
    }

    // ---- floor: dark wooden planks + inlaid ring
    const planks = canvasTex(512, 512, (c) => {
      c.fillStyle = '#4a3020'; c.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 8; i++) {
        const v = 55 + Math.random() * 30; c.fillStyle = `rgb(${v + 20},${v},${v - 20})`; c.fillRect(i * 64 + 2, 0, 60, 512);
        for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(20,10,5,${Math.random() * 0.25})`; c.fillRect(i * 64 + 4 + Math.random() * 56, Math.random() * 512, 1 + Math.random() * 2, 20 + Math.random() * 90); }
      }
      c.fillStyle = '#120a06'; for (let i = 0; i <= 8; i++) c.fillRect(i * 64 - 1, 0, 3, 512);
    });
    planks.repeat.set(5, 2);
    this.add(new THREE.BoxGeometry(24, 0.3, 13), this.track(new THREE.MeshStandardMaterial({ map: planks, roughness: 0.55, metalness: 0.05 })), 0, -0.15, -1, false);
    const ring = this.add(new THREE.RingGeometry(2.2, 2.35, 48), this.mat(0x8a1428, 0.5, { emissive: 0x3a0610, emissiveIntensity: 0.8, side: THREE.DoubleSide }), 0, 0.012, 0, false);
    ring.rotation.x = -Math.PI / 2;

    // ---- back wall: shoji panels with warm paper glow + wooden frame
    const wood = this.mat(0x2b1a10, 0.8), darkWood = this.mat(0x170d08, 0.85);
    const paperTex = canvasTex(128, 128, (c) => {
      c.fillStyle = '#d9b27a'; c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(120,80,40,${Math.random() * 0.12})`; c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    });
    const paper = this.track(new THREE.MeshStandardMaterial({ map: paperTex, emissive: 0x6a4020, emissiveMap: paperTex, emissiveIntensity: 0.55, roughness: 0.95 }));
    for (let i = -4; i <= 4; i++) {
      this.add(new THREE.BoxGeometry(2.3, 4.2, 0.06), paper, i * 2.5, 2.4, -6.2, false);
      this.add(new THREE.BoxGeometry(0.1, 4.4, 0.14), wood, i * 2.5 - 1.25, 2.4, -6.15, false);
      this.add(new THREE.BoxGeometry(2.4, 0.07, 0.12), wood, i * 2.5, 2.4, -6.1, false);
      this.add(new THREE.BoxGeometry(2.4, 0.07, 0.12), wood, i * 2.5, 3.3, -6.1, false);
    }
    this.add(new THREE.BoxGeometry(24, 0.3, 0.3), darkWood, 0, 4.7, -6.1, false);
    this.add(new THREE.BoxGeometry(24, 0.3, 0.3), darkWood, 0, 0.1, -6.1, false);

    // ---- hanging banner with emblem
    const emblem = canvasTex(256, 512, (c) => {
      c.fillStyle = '#6e0f20'; c.fillRect(0, 0, 256, 512);
      c.strokeStyle = '#e8d8b0'; c.lineWidth = 10; c.beginPath(); c.arc(128, 190, 70, 0, 6.28); c.stroke();
      c.fillStyle = '#e8d8b0'; c.beginPath(); c.moveTo(70, 330); c.lineTo(186, 150); c.lineTo(200, 160); c.lineTo(90, 340); c.fill();
      c.fillStyle = '#1a0a0a'; c.fillRect(0, 0, 256, 18); c.fillRect(0, 494, 256, 18);
    }, false);
    this.add(new THREE.PlaneGeometry(2.2, 4.4), this.track(new THREE.MeshStandardMaterial({ map: emblem, roughness: 0.9, side: THREE.DoubleSide })), 0, 2.9, -5.9, false);

    // ---- pillars, ceiling beams
    for (const x of [-10, -7.5, 7.5, 10]) this.add(new THREE.CylinderGeometry(0.28, 0.3, 6.2, 12), darkWood, x, 3, -4.5);
    for (const x of [-11, 11]) this.add(new THREE.BoxGeometry(0.4, 6.2, 12), darkWood, x, 3, -1, false);
    for (let i = -3; i <= 3; i++) this.add(new THREE.BoxGeometry(0.35, 0.4, 14), darkWood, i * 3.4, 6.1, -1, false);
    this.add(new THREE.BoxGeometry(26, 0.3, 14), this.mat(0x0b0807), 0, 6.5, -1, false);

    // ---- paper lanterns
    const glow = this.track(new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9030, emissiveIntensity: 2.2, roughness: 0.9 }));
    for (const [x, z, y] of [[-6.5, -4, 3.2], [6.5, -4, 3.2], [-3.2, -5, 3.8], [3.2, -5, 3.8]] as const) {
      const l = this.add(new THREE.SphereGeometry(0.34, 14, 10), glow, x, y, z, false); l.scale.set(1, 1.25, 1);
      this.add(new THREE.CylinderGeometry(0.01, 0.01, 6.5 - y, 4), darkWood, x, (6.5 + y) / 2, z, false);
      this.add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), darkWood, x, y + 0.45, z, false);
    }

    // ---- weapon rack
    for (let i = 0; i < 4; i++) { const s = this.add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), wood, 8.2 + i * 0.25, 1.3, -5); s.rotation.z = 0.12 - i * 0.05; }
    this.add(new THREE.BoxGeometry(1.4, 0.1, 0.25), darkWood, 8.6, 0.6, -5);
    this.add(new THREE.BoxGeometry(1.4, 0.1, 0.25), darkWood, 8.6, 1.6, -5);

    // ---- drifting dust motes
    this.dust = this.points(ShadowDojo.DUST, (i, p) => { p[i * 3] = (Math.random() - 0.5) * 18; p[i * 3 + 1] = Math.random() * 6; p[i * 3 + 2] = -5 + Math.random() * 10; }, 0xffe0b0, 0.05, 0.5);

    scene.add(this.group);
  }

  update(dt: number, time: number): void {
    const a = (this.dust.geometry.attributes.position as THREE.BufferAttribute);
    const arr = a.array as Float32Array;
    for (let i = 0; i < ShadowDojo.DUST; i++) {
      arr[i * 3] += Math.sin(time * 0.3 + i) * dt * 0.15;
      arr[i * 3 + 1] += Math.cos(time * 0.5 + i * 1.7) * dt * 0.08 + dt * 0.03;
      if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = 0;
    }
    a.needsUpdate = true;
    this.lanterns.forEach((l, i) => { l.intensity = 38 + Math.sin(time * 6 + i * 2) * 3 + Math.sin(time * 13 + i) * 1.5; });
  }

  dispose(scene: THREE.Scene): void { this.disposeAll(scene); }
}
