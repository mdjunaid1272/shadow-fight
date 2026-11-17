import * as THREE from 'three';

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return t;
}

/** Shared helpers for arenas: tracked resource disposal and mesh building. */
export abstract class ArenaBase {
  protected group = new THREE.Group();
  protected disposables: Array<{ dispose(): void }> = [];

  protected track<T extends { dispose(): void }>(o: T): T { this.disposables.push(o); return o; }

  protected mat(color: number, rough = 0.85, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    return this.track(new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));
  }

  protected add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true, parent: THREE.Object3D = this.group): THREE.Mesh {
    const m = new THREE.Mesh(this.track(geo), mat); m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
  }

  /** Single draw-call particle field; caller animates the position array. */
  protected points(count: number, spawn: (i: number, pos: Float32Array) => void, color: number, size: number, opacity: number): THREE.Points {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) spawn(i, pos);
    const g = this.track(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, this.track(new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })));
    p.frustumCulled = false; this.group.add(p); return p;
  }

  protected disposeAll(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    scene.background = null; scene.fog = null;
  }
}
