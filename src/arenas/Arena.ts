import type * as THREE from 'three';
import type { ArenaBounds } from '../combat/Fighter';

/** Contract every arena implements; the game never touches arena internals. */
export interface Arena {
  readonly id: string;
  readonly name: string;
  /** Valid combat area half-extents (fighters are clamped inside). */
  readonly bounds: ArenaBounds;
  /** Optional camera limits (m) so the camera never ends up inside walls or above a ceiling. */
  readonly cameraLimits?: { maxX?: number; maxY?: number };
  /** Add lights, geometry and background to the scene. */
  build(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void;
  update(dt: number, time: number): void;
  dispose(scene: THREE.Scene): void;
}
