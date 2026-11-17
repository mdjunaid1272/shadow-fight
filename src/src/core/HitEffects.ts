import * as THREE from 'three';

interface Spark { sprite: THREE.Sprite; life: number; max: number; size: number }

/** Pooled hit-spark effect: a fixed set of additive sprites is reused, never allocated at runtime. */
export class HitEffects {
  private pool: Spark[] = [];
  private tex: THREE.CanvasTexture;

  constructor(private scene: THREE.Scene, size = 14) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    // star spikes
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 8; i++) { c.save(); c.translate(64, 64); c.rotate((i * Math.PI) / 4); c.beginPath(); c.moveTo(0, -3); c.lineTo(i % 2 ? 40 : 62, 0); c.lineTo(0, 3); c.fill(); c.restore(); }
    this.tex = new THREE.CanvasTexture(cv);
    for (let i = 0; i < size; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.visible = false; scene.add(sprite);
      this.pool.push({ sprite, life: 0, max: 1, size: 1 });
    }
  }

  spawn(x: number, y: number, z: number, blocked: boolean, strong: boolean): void {
    const s = this.pool.find((p) => p.life <= 0) ?? this.pool[0];
    s.life = s.max = strong ? 0.26 : 0.16; s.size = strong ? 1.5 : 1.0;
    s.sprite.position.set(x, y, z); s.sprite.visible = true;
    (s.sprite.material as THREE.SpriteMaterial).color.set(blocked ? 0x6fb4ff : strong ? 0xffd27a : 0xffa060);
    s.sprite.material.rotation = Math.random() * 3;
  }

  /** Large coloured flash (special / ultimate start, shadow energy burst). */
  flash(x: number, y: number, z: number, color: number, size: number, life = 0.45): void {
    const s = this.pool.find((p) => p.life <= 0) ?? this.pool[0];
    s.life = s.max = life; s.size = size;
    s.sprite.position.set(x, y, z); s.sprite.visible = true;
    (s.sprite.material as THREE.SpriteMaterial).color.set(color);
  }

  update(dt: number): void {
    for (const s of this.pool) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sprite.visible = false; continue; }
      const k = 1 - s.life / s.max;
      const sc = s.size * (0.4 + k * 0.9);
      s.sprite.scale.set(sc, sc, 1);
      s.sprite.material.opacity = 0.65 * (1 - k * k);
    }
  }

  dispose(): void {
    for (const s of this.pool) { this.scene.remove(s.sprite); s.sprite.material.dispose(); }
    this.tex.dispose();
  }
}
