// Shared by camera-metrics.ts and camera.test.ts: simulates AI-vs-AI fights at 60 Hz with the real camera and the same hooks as Game.ts.
import * as THREE from 'three';
import { EnemyAI } from '../src/ai/EnemyAI';
import { FightingCamera } from '../src/camera/FightingCamera';
import { CHARACTERS } from '../src/characters/CharacterData';
import { CombatManager } from '../src/combat/CombatManager';
import { Fighter } from '../src/combat/Fighter';
import { emptyInput, type FighterInput } from '../src/combat/types';

const bounds = { x: 7.2, z: 2.4 };
const DT = 1 / 60;

// deterministic AI so every variant watches the same fight
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

export type Tuning = FightingCamera['tuning'];
export interface Metrics { speedP50: number; speedP95: number; accelP95: number; jerkP95: number; xRevPerMin: number; yawRateP95: number; fovMax: number; framed: number; /** fraction of frames both fighters stay inside the HUD-safe area */ safe: number; /** fraction of frames the zoom-out guard was active, and its mean extra zoom while active */ guardActive: number; guardMean: number }

function pct(a: number[], p: number): number { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; }

/** A human-style player: sprints to the edges, rushes in, jumps with air attacks, sidesteps, throws combos. */
function humanInput(f: number): FighterInput {
  const t = (f / 60) % 14, i = emptyInput();
  if (t < 3) i.fwd = -1;
  else if (t < 4) i.block = true;
  else if (t < 8.5) i.fwd = 1;
  else if (t < 9.2) { i.fwd = 1; if (Math.floor(f) % 60 === 0) i.jump = true; }
  else if (t < 10) { if (Math.floor(f) % 50 === 0) i.dodge = Math.floor(t) % 2 ? 1 : -1; }
  else if (Math.floor(f) % 22 === 0) i.pressed.push(['light', 'light', 'heavy', 'kick'][Math.floor(f / 22) % 4] as 'light');
  if (t > 8.6 && t < 8.7) i.jump = true;
  return i;
}

export function run(tune: Partial<Tuning>, seconds = 240, aspect = 16 / 9, opts: { insetBottom?: number; human?: boolean } = {}): Metrics {
  seed = 12345; const realRandom = Math.random; Math.random = rnd;
  const [ra, sh] = [CHARACTERS[0], CHARACTERS[1]];
  const a = new Fighter(ra.stats, bounds), b = new Fighter(sh.stats, bounds); a.reset(-2.3, 0, 1); b.reset(2.3, 0, -1);
  const cm = new CombatManager([a, b]);
  const ai1 = new EnemyAI('NORMAL', 'BALANCED'), ai2 = new EnemyAI('NORMAL', 'AGGRESSIVE');
  const cam = new FightingCamera(bounds, aspect); Object.assign(cam.tuning, tune); if (opts.insetBottom) cam.setInsets({ bottom: opts.insetBottom });
  cam.snap(a, b);
  let cutCooldown = 0;
  // same camera hooks as Game.ts
  cm.events.on('hit', (h) => {
    const att = cm.fighters[h.attacker], def = cm.fighters[h.defender]; let dx = def.x - att.x; dx = Math.sign(dx);
    cam.addShake(h.blocked ? 0.06 : h.knockdown ? 0.3 : 0.14); cam.kick(dx, h.blocked ? 0.15 : h.knockdown ? 0.8 : 0.45); if (h.knockdown) cam.lowAngle(0.3, 0.9);
  });
  cm.events.on('special', (s) => { if (s.cinematic) { cam.cinematic(cm.fighters[s.who], 1.3, 1, { zoom: 0.09 }); cam.addShake(0.2); } else cam.addShake(0.1); });
  cm.events.on('ko', ({ loser }) => { cam.cinematic(cm.fighters[loser], 1.1, 0.75, { low: 0.5 }); });

  const pos: THREE.Vector3[] = []; const yaws: number[] = []; const fovs: number[] = [];
  let guardFrames = 0, guardSum = 0, framedFrames = 0, safeFrames = 0, frames = 0, lastX = [a.x, b.x];
  const dir = new THREE.Vector3(), proj = new THREE.Vector3();
  const steps = seconds * 60;
  for (let f = 0; f < steps; f++) {
    cm.step([opts.human ? humanInput(f) : ai1.think(a, b), ai2.think(b, a)]);
    if (a.health <= 0 || b.health <= 0) { // round over -> new round (a camera cut, excluded from the stats)
      for (let i = 0; i < 60; i++) cam.update(a, b, DT);
      a.reset(-2.3, 0, 1); b.reset(2.3, 0, -1); a.energy = b.energy = 0; cam.snap(a, b); cutCooldown = 60; continue;
    }
    let actionDir = 0;
    for (const fi of cm.fighters) if (fi.state === 'attack' && fi.attackPhase !== 'recovery') actionDir += fi.fx >= 0 ? 1 : -1;
    const speed = Math.max(Math.abs(a.x - lastX[0]), Math.abs(b.x - lastX[1])) / DT; lastX = [a.x, b.x];
    cam.setHints({ actionDir, speed });
    cam.update(a, b, DT);
    if (cutCooldown > 0) { cutCooldown--; continue; }
    pos.push(cam.camera.position.clone()); cam.camera.getWorldDirection(dir); yaws.push(Math.atan2(dir.x, -dir.z)); fovs.push(cam.camera.fov);
    cam.camera.updateMatrixWorld(true);
    let ok = true;
    for (const fi of [a, b]) for (const h of [0.05, 1.9]) { proj.set(fi.x, fi.y + h, fi.z).project(cam.camera); if (Math.abs(proj.x) > 0.98 || Math.abs(proj.y) > 0.98) ok = false; }
    let safeOk = true; const S = FightingCamera.SAFE;
    for (const fi of [a, b]) for (const dx of [-0.45, 0.45]) for (const h of [0, 1.95]) { proj.set(fi.x + dx, fi.y + h, fi.z).project(cam.camera); if (Math.abs(proj.x) > S.x + 0.005 || (proj.y > 0 ? proj.y > S.top + 0.005 : -proj.y > S.bottom + 0.005)) safeOk = false; }
    const sv = (cam as unknown as { safety: { value: number } }).safety.value; if (sv > 1.005) { guardFrames++; guardSum += sv; }
    frames++; if (ok) framedFrames++; if (safeOk) safeFrames++;
  }
  Math.random = realRandom;

  const v: number[] = [], vx: number[] = [], ac: number[] = [], jk: number[] = [], yr: number[] = [];
  for (let i = 1; i < pos.length; i++) { const d = pos[i].clone().sub(pos[i - 1]).multiplyScalar(60); v.push(d.length()); vx.push(d.x); yr.push(Math.abs(yaws[i] - yaws[i - 1]) * 60 * 57.2958); }
  for (let i = 1; i < v.length; i++) ac.push(Math.abs(v[i] - v[i - 1]) * 60);
  for (let i = 1; i < ac.length; i++) jk.push(Math.abs(ac[i] - ac[i - 1]) * 60);
  // direction reversals of the (lightly filtered) horizontal velocity, ignoring tiny drifts
  let lp = 0, last = 0, rev = 0; for (const x of vx) { lp += (x - lp) * 0.1; const s = Math.abs(lp) > 0.3 ? Math.sign(lp) : 0; if (s && last && s !== last) rev++; if (s) last = s; }
  return {
    speedP50: pct(v, 0.5), speedP95: pct(v, 0.95), accelP95: pct(ac, 0.95), jerkP95: pct(jk, 0.95),
    xRevPerMin: rev / (v.length / 3600), yawRateP95: pct(yr, 0.95), fovMax: Math.max(...fovs), framed: framedFrames / frames, safe: safeFrames / frames, guardActive: guardFrames / frames, guardMean: guardFrames ? guardSum / guardFrames : 1,
  };
}

