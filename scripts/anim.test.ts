import * as THREE from 'three';
import { AnimationController, IDX_ROOTY, IDX_ROOTZ, JOINTS, POSE_SIZE } from '../src/characters/AnimationController';
import { CHARACTERS } from '../src/characters/CharacterData';
import { applyStyle, STYLE_IDS } from '../src/combat/Styles';
import { registerClips } from '../src/characters/ProceduralClips';
import { ParticleSystem } from '../src/core/ParticleSystem';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const DT = 1 / 60;
const REQUIRED = ['IDLE', 'WALK', 'BACKWARD', 'JUMP', 'BLOCK', 'DODGE', 'HIT_FRONT', 'HIT_FRONT_B', 'HIT_HEAVY', 'LAUNCH', 'KNOCKDOWN', 'DEFEAT', 'GETUP', 'VICTORY', 'RUN', 'FALL', 'LAND', 'DODGE_LEFT', 'DODGE_RIGHT', 'HIT_BACK', 'STAGGER', 'WEAPON_ATTACK'];

// every character in every fighting style (the style adds moves, each of which needs an animation)
const DEFS = STYLE_IDS.flatMap((style) => CHARACTERS.map((c) => ({ ...c, id: style === 'classic' ? c.id : `${c.id}/${style}`, stats: applyStyle(c.stats, style) })));
for (const def of DEFS) {
  const ctrl = new AnimationController();
  registerClips(ctrl, def);
  const attackClips = [...new Set(Object.values(def.stats.attacks).map((a) => a.clip))];
  const missing = [...REQUIRED, ...attackClips].filter((c) => !ctrl.has(c));
  ok(missing.length === 0, `${def.id}: all ${REQUIRED.length + attackClips.length} clips registered${missing.length ? ' (missing ' + missing.join(',') + ')' : ''}`);

  // every attack: finite poses over its whole length, no impossible snaps, visibly different from guard
  let bad = false, worstSnap = 0, worstName = '', minTravel = Infinity, travelName = '';
  for (const a of Object.values(def.stats.attacks)) {
    const c2 = new AnimationController(); registerClips(c2, def);
    const total = a.startup + a.active + a.recovery;
    let prev = new Float32Array(POSE_SIZE); const guard = c2.update(DT, 'IDLE', 0).slice();
    for (let w = 0; w < 30; w++) prev = c2.update(DT, 'IDLE', 0).slice(); // settle in idle
    let maxFromGuard = 0;
    // prime the controller on the attack clip (its first frames include the crossfade from idle)
    for (let f = 0; f <= total; f++) {
      const p = c2.update(DT, a.clip, f);
      for (let i = 0; i < POSE_SIZE; i++) { if (!Number.isFinite(p[i])) bad = true; }
      let snap = 0;
      for (let i = 0; i < JOINTS.length * 3; i++) snap = Math.max(snap, Math.abs(p[i] - prev[i]));
      if (f > 0 && snap > worstSnap) { worstSnap = snap; worstName = `${a.id}@${f}`; }
      for (let i = 0; i < JOINTS.length * 3; i++) maxFromGuard = Math.max(maxFromGuard, Math.abs(p[i] - guard[i]));
      if (Math.abs(p[IDX_ROOTY]) > 0.7 || Math.abs(p[IDX_ROOTZ]) > 0.8) bad = true;
      prev = p.slice();
    }
    if (maxFromGuard < minTravel) { minTravel = maxFromGuard; travelName = a.id; }
  }
  ok(!bad, `${def.id}: attack poses are finite and root offsets sane`);
  ok(worstSnap < 1.1, `${def.id}: no impossible joint snap (worst ${((worstSnap * 180) / Math.PI).toFixed(0)} deg/frame at ${worstName})`);
  ok(minTravel > 0.45, `${def.id}: every attack moves the body visibly (least: ${travelName} ${((minTravel * 180) / Math.PI).toFixed(0)} deg)`);
}

// strike should be reached on/after the active frames begin, not long before (timing matches hitbox)
{
  const def = CHARACTERS[0]; const a = def.stats.attacks.heavy;
  const ctrl = new AnimationController(); registerClips(ctrl, def);
  for (let w = 0; w < 30; w++) ctrl.update(DT, 'IDLE', 0);
  const series: number[] = [];
  for (let f = 0; f <= a.startup + a.active + a.recovery; f++) { const p = ctrl.update(DT, a.clip, f); series.push(p[1 * 3]); } // torso pitch (leans forward into the strike)
  const strikeFrame = series.indexOf(Math.max(...series.slice(0, a.startup + a.active + 2)));
  const peakFrame = series.indexOf(Math.min(...series.slice(0, a.startup + 1)));
  ok(strikeFrame >= a.startup - 4 && strikeFrame <= a.startup + a.active + 1, `heavy strike pose lands in the active window (frame ${strikeFrame}, active ${a.startup}-${a.startup + a.active}; windup peak ${peakFrame})`);
}

// particle pool: bounded, recycles, fades to nothing
{
  const scene = new THREE.Scene();
  const ps = new ParticleSystem(scene, 100, true, 1);
  for (let i = 0; i < 1000; i++) ps.emit({ x: 0, y: 1, z: 0, vx: 1, vy: 2, life: 0.3, size: 0.1, color: 0xffffff, gravity: -9 });
  ps.update(DT);
  ok(ps.alive <= 100, `particle pool stays within capacity (alive ${ps.alive} of 100 after 1000 emits)`);
  for (let i = 0; i < 60; i++) ps.update(DT);
  ok(ps.alive === 0, 'particles all expire');
  const pos = (ps.points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
  ok([...pos].every(Number.isFinite), 'particle positions stay finite');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL ANIMATION/VFX TESTS PASSED');
process.exit(fails ? 1 : 0);
