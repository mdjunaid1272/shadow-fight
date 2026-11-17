// Measures how far the fighters' midpoint trails the screen centre while they move at walking / running / dashing speed.
// usage: npx tsx scripts/camera-lag.ts
import * as THREE from 'three';
import { FightingCamera } from '../src/camera/FightingCamera';

const DT = 1 / 60;
const bounds = { x: 7.2, z: 2.4 };
type F = { x: number; y: number; z: number };
const ndcX = (c: FightingCamera, x: number, z: number) => { c.camera.updateMatrixWorld(true); return new THREE.Vector3(x, 1, z).project(c.camera).x; };

export function lag(speed: number, aspect = 16 / 9): { steady: number; peak: number; stop: number } {
  const c = new FightingCamera({ x: 40, z: 2.4 }, aspect);
  const a: F = { x: -2.3, y: 0, z: 0 }, b: F = { x: 2.3, y: 0, z: 0 };
  c.snap(a, b); for (let i = 0; i < 300; i++) c.update(a, b, DT);
  let peak = 0, steady = 0;
  for (let i = 0; i < 120; i++) { // 2 s of travel, both fighters together
    a.x += speed * DT; b.x += speed * DT; c.update(a, b, DT);
    const e = Math.abs(ndcX(c, (a.x + b.x) / 2, 0)); peak = Math.max(peak, e); if (i > 90) steady = Math.max(steady, e);
  }
  let stop = 0; // after they stop: how far does the camera overshoot / still trail?
  for (let i = 0; i < 90; i++) { c.update(a, b, DT); stop = Math.max(stop, Math.abs(ndcX(c, (a.x + b.x) / 2, 0))); }
  return { steady, peak, stop };
}
if (process.argv[1]?.includes('camera-lag')) {
  console.log('speed m/s   steady lag (screen half-widths)   peak   after-stop max');
  for (const s of [2, 3.5, 5, 7]) { const r = lag(s); console.log(`${String(s).padStart(5)}      ${r.steady.toFixed(3).padStart(8)}                      ${r.peak.toFixed(3)}   ${r.stop.toFixed(3)}`); }
}
void bounds;
