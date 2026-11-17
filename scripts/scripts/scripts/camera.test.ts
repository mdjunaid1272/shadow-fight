import * as THREE from 'three';
import { CALM_TUNING, FULL_TUNING, HYBRID_TUNING, FightingCamera } from '../src/camera/FightingCamera';
import { run } from './cameraSim';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const bounds = { x: 7.2, z: 2.4 };
/** Sections 1-14 test the camera MECHANISMS, so they run with every effect at full strength. Section 15 tests the shipped calm defaults. */
const mkCam = (aspect: number): FightingCamera => { const c = new FightingCamera(bounds, aspect); Object.assign(c.tuning, FULL_TUNING); return c; };
const DT = 1 / 60;

const inFrame = (cam: FightingCamera, f: { x: number; y: number; z: number }, margin = 0.98): boolean => {
  cam.camera.updateMatrixWorld(true);
  for (const h of [0.05, 1.0, 1.9]) {
    const v = new THREE.Vector3(f.x, f.y + h, f.z).project(cam.camera);
    if (Math.abs(v.x) > margin || Math.abs(v.y) > margin || v.z > 1) return false;
  }
  return true;
};

// 1. framing holds for scripted extremes at several aspect ratios
for (const [name, aspect] of [['16:9', 16 / 9], ['phone 19.5:9', 19.5 / 9], ['4:3', 4 / 3]] as const) {
  const cam = mkCam(aspect);
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 };
  cam.snap(a, b);
  let bad = 0, nan = false, worstStep = 0, prev = cam.camera.position.clone();
  for (let f = 0; f < 60 * 40; f++) {
    const t = f / 60;
    // fighters wander to the arena edges, sidestep in depth and jump
    a.x = -bounds.x + (Math.sin(t * 0.7) + 1) * 3.4; b.x = bounds.x - (Math.sin(t * 0.55 + 1) + 1) * 3.4;
    a.z = Math.sin(t * 1.3) * bounds.z; b.z = Math.cos(t * 0.9) * bounds.z;
    a.y = Math.max(0, Math.sin(t * 2.2)) * 1.3; b.y = Math.max(0, Math.sin(t * 1.7 + 2)) * 1.3;
    cam.update(a, b, DT);
    const p = cam.camera.position;
    if (![p.x, p.y, p.z, cam.camera.fov].every(Number.isFinite)) nan = true;
    if (!inFrame(cam, a) || !inFrame(cam, b)) bad++;
    worstStep = Math.max(worstStep, p.distanceTo(prev)); prev = p.clone();
  }
  ok(!nan, `${name}: no NaN`);
  ok(bad < 60 * 40 * 0.03, `${name}: both fighters framed >97% of frames (out of frame ${bad}/${60 * 40})`);
  ok(worstStep < 0.35, `${name}: no sudden jumps (worst per-frame move ${worstStep.toFixed(3)}m)`);
}

// 2. smoothness: a heavy knockback (0.3 m/frame decaying, as in the game) must not produce a camera jolt
{
  const cam = mkCam(16 / 9);
  const a = { x: -2, y: 0, z: 0 }, b = { x: 2, y: 0, z: 0 }; cam.snap(a, b);
  for (let i = 0; i < 120; i++) cam.update(a, b, DT);
  let kb = 0.3; let prev = cam.camera.position.clone(), worst = 0, prevStep = 0, worstAccel = 0;
  for (let i = 0; i < 120; i++) { b.x = Math.min(7.2, b.x + kb); kb *= 0.86; cam.update(a, b, DT); const step = cam.camera.position.distanceTo(prev); worst = Math.max(worst, step); worstAccel = Math.max(worstAccel, Math.abs(step - prevStep)); prevStep = step; prev = cam.camera.position.clone(); }
  ok(worst < 0.2 && worstAccel < 0.03, `knockback keeps the camera smooth (max step ${worst.toFixed(3)}m, max accel ${worstAccel.toFixed(4)})`);
}

// 3. shake is bounded even when spammed
{
  const cam = mkCam(16 / 9);
  const a = { x: -2, y: 0, z: 0 }, b = { x: 2, y: 0, z: 0 }; cam.snap(a, b);
  for (let i = 0; i < 60; i++) cam.update(a, b, DT);
  const base = cam.camera.position.clone();
  let maxOff = 0;
  for (let i = 0; i < 120; i++) { cam.addShake(0.45); cam.update(a, b, DT); maxOff = Math.max(maxOff, cam.camera.position.distanceTo(base)); }
  ok(maxOff < 1.2, `spammed hits never shake excessively (max displacement ${maxOff.toFixed(2)}m)`);
}

// 4. cinematic returns exactly to normal framing, without a pop
{
  const cam = mkCam(16 / 9);
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 }; cam.snap(a, b);
  for (let i = 0; i < 120; i++) cam.update(a, b, DT);
  const rest = cam.camera.position.clone();
  cam.cinematic(a, 1.1);
  let peak = 0, worst = 0, prev = rest.clone();
  for (let i = 0; i < 60 * 5; i++) { cam.update(a, b, DT); peak = Math.max(peak, cam.camera.position.distanceTo(rest)); worst = Math.max(worst, cam.camera.position.distanceTo(prev)); prev = cam.camera.position.clone(); }
  ok(peak > 1.5, `cinematic visibly moves the camera (peak ${peak.toFixed(2)}m)`);
  ok(cam.camera.position.distanceTo(rest) < 0.05, `cinematic returns to rest (residual ${cam.camera.position.distanceTo(rest).toFixed(3)}m)`);
  ok(worst < 0.2 && Math.abs(cam.camera.fov - 34) < 0.05, `no pops during cinematic (worst step ${worst.toFixed(3)}m, fov ${cam.camera.fov.toFixed(2)})`);
}

// 5. depth-aware orbit: sidestep separation rotates view, but within limits
{
  const cam = mkCam(16 / 9);
  const a = { x: -2, y: 0, z: -2.4 }, b = { x: 2, y: 0, z: 2.4 }; cam.snap(a, b);
  for (let i = 0; i < 240; i++) cam.update(a, b, DT);
  const flat = mkCam(16 / 9); const a2 = { x: -2, y: 0, z: 0 }, b2 = { x: 2, y: 0, z: 0 }; flat.snap(a2, b2);
  for (let i = 0; i < 240; i++) flat.update(a2, b2, DT);
  const dx = Math.abs(cam.camera.position.x - flat.camera.position.x);
  ok(dx > 0.3 && dx < 6, `orbit shifts with depth separation (dx=${dx.toFixed(2)}m) and stays limited`);
}

// 6. intro sweep settles
{
  const cam = mkCam(16 / 9);
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 }; cam.snap(a, b);
  const rest = cam.camera.position.clone();
  cam.intro();
  let startOff = 0;
  for (let i = 0; i < 5; i++) { cam.update(a, b, DT); startOff = Math.max(startOff, cam.camera.position.distanceTo(rest)); }
  for (let i = 0; i < 60 * 4; i++) cam.update(a, b, DT);
  ok(startOff > 0.1 && cam.camera.position.distanceTo(rest) < 0.05, `intro starts offset (${startOff.toFixed(2)}m) and settles (${cam.camera.position.distanceTo(rest).toFixed(3)}m)`);
}

// 7. action-aware camera: lead room, combo push-in, speed FOV
const settle = (cam: FightingCamera, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, frames = 180) => { for (let i = 0; i < frames; i++) cam.update(a, b, DT); };
{
  const a = { x: -2, y: 0, z: 0 }, b = { x: 2, y: 0, z: 0 };
  const base = mkCam(16 / 9); base.snap(a, b); settle(base, a, b);
  const lead = mkCam(16 / 9); lead.snap(a, b); lead.setHints({ actionDir: 1 }); settle(lead, a, b);
  const dx = lead.camera.position.x - base.camera.position.x;
  ok(dx > 0.3 && dx < 1.2, `lead room shifts the frame toward the attacker (+${dx.toFixed(2)}m, bounded)`);
  lead.setHints({ actionDir: 0 }); settle(lead, a, b, 240);
  ok(Math.abs(lead.camera.position.x - base.camera.position.x) < 0.05, 'lead room returns to centre when the action ends');
  const neg = mkCam(16 / 9); neg.snap(a, b); neg.setHints({ actionDir: -5 }); settle(neg, a, b);
  ok(base.camera.position.x - neg.camera.position.x < 1.2, 'lead room is clamped even with extreme hints');

  const cmb = mkCam(16 / 9); cmb.snap(a, b); cmb.setHints({ combo: 12 }); settle(cmb, a, b, 300);
  const closer = base.camera.position.distanceTo(new THREE.Vector3(0, 1.1, 0)) - cmb.camera.position.distanceTo(new THREE.Vector3(0, 1.1, 0));
  const pct = closer / base.camera.position.distanceTo(new THREE.Vector3(0, 1.1, 0));
  ok(Math.abs(pct) < 0.005, `long combos no longer zoom the camera in (${(pct * 100).toFixed(2)}%)`);

  const sp = mkCam(16 / 9); sp.snap(a, b); sp.setHints({ speed: 20 }); settle(sp, a, b, 240);
  ok(sp.camera.fov > 34.8 && sp.camera.fov < 37, `speed widens the FOV a little (${sp.camera.fov.toFixed(2)} deg, capped)`);
  sp.setHints({ speed: 0 }); settle(sp, a, b, 300);
  ok(Math.abs(sp.camera.fov - 34) < 0.05, 'FOV returns to normal');
}
// 8. orbit sweep + low KO angle
{
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 };
  const cam = mkCam(16 / 9); cam.snap(a, b); settle(cam, a, b);
  const rest = cam.camera.position.clone();
  cam.cinematic(b, 2.6, 0.8, { orbit: 0.3 });
  const xs: number[] = []; let prev = rest.clone(), worst = 0;
  for (let i = 0; i < 60 * 2.6; i++) { cam.update(a, b, DT); xs.push(cam.camera.position.x); worst = Math.max(worst, cam.camera.position.distanceTo(prev)); prev = cam.camera.position.clone(); }
  const moved = Math.abs(xs[xs.length - 1] - xs[30]);
  ok(moved > 0.5, `victory orbit keeps sweeping the camera (${moved.toFixed(2)}m between 0.5s and 2.6s)`);
  ok(worst < 0.15, `orbit is smooth (worst per-frame move ${worst.toFixed(3)}m)`);
  settle(cam, a, b, 360);
  ok(cam.camera.position.distanceTo(rest) < 0.06, `orbit returns to the fight frame (residual ${cam.camera.position.distanceTo(rest).toFixed(3)}m)`);

  const ko = mkCam(16 / 9); ko.snap(a, b); settle(ko, a, b);
  const y0 = ko.camera.position.y; let minY = y0;
  ko.cinematic(a, 1.1, 0.75, { low: 0.8 });
  for (let i = 0; i < 100; i++) { ko.update(a, b, DT); minY = Math.min(minY, ko.camera.position.y); }
  ok(minY < y0 - 0.15 && minY > 0.6, `KO drops to a lower angle without hitting the floor (${y0.toFixed(2)} -> ${minY.toFixed(2)}m)`);
  settle(ko, a, b, 360); ok(Math.abs(ko.camera.position.y - y0) < 0.05, 'KO camera returns to normal height');
}
// 9. framing still holds with every hint active, on all aspect ratios
for (const [name, aspect] of [['16:9', 16 / 9], ['phone 19.5:9', 19.5 / 9], ['4:3', 4 / 3]] as const) {
  const cam = mkCam(aspect);
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 }; cam.snap(a, b);
  let bad = 0, frames = 0;
  for (let f = 0; f < 60 * 30; f++) {
    const t = f / 60;
    a.x = -bounds.x + (Math.sin(t * 0.8) + 1) * 3.4; b.x = bounds.x - (Math.sin(t * 0.6 + 1) + 1) * 3.4;
    a.z = Math.sin(t * 1.3) * bounds.z; b.z = Math.cos(t * 0.9) * bounds.z; a.y = Math.max(0, Math.sin(t * 2.2)) * 1.3;
    cam.setHints({ actionDir: Math.sin(t * 3), speed: 4 + 4 * Math.sin(t * 2) });
    cam.update(a, b, DT); frames++;
    if (!inFrame(cam, a) || !inFrame(cam, b)) bad++;
  }
  ok(bad / frames < 0.03, `${name}: fighters stay framed with all hints active (${bad}/${frames} frames out)`);
}
// 10. dead zone / hysteresis: jitter is absorbed, real movement is followed
{
  const a = { x: -2, y: 0, z: 0 }, b = { x: 2, y: 0, z: 0 };
  const cam = mkCam(16 / 9); cam.snap(a, b); settle(cam, a, b);
  let path = 0, prev = cam.camera.position.clone();
  for (let i = 0; i < 60 * 4; i++) { const j = Math.sin(i * 0.5) * 0.12; a.x = -2 + j; b.x = 2 + j * 0.8; cam.update(a, b, DT); path += cam.camera.position.distanceTo(prev); prev = cam.camera.position.clone(); }
  ok(path < 0.12, `small back-and-forth shuffling barely moves the camera (path ${path.toFixed(3)}m)`);
  a.x = 1.5; b.x = 5.5; settle(cam, a, b, 1000);
  ok(cam.camera.position.x > 0.8, `a real 3.5m advance is followed (camera x ${cam.camera.position.x.toFixed(2)})`);
  const z0 = cam.camera.position.z;
  for (let i = 0; i < 60 * 3; i++) { const j = Math.sin(i * 0.4) * 0.15; b.x = 5.5 + j; cam.update(a, b, DT); }
  ok(Math.abs(cam.camera.position.z - z0) < 0.12, `small spread changes do not make the zoom breathe (dz ${Math.abs(cam.camera.position.z - z0).toFixed(3)}m)`);
}
// 11. directional kick
{
  const a = { x: -2, y: 0, z: 0 }, b = { x: 2, y: 0, z: 0 };
  const cam = mkCam(16 / 9); cam.snap(a, b); settle(cam, a, b);
  const x0 = cam.camera.position.x; let peak = 0;
  cam.kick(1, 1);
  for (let i = 0; i < 120; i++) { cam.update(a, b, DT); peak = Math.max(peak, cam.camera.position.x - x0); }
  ok(peak > 0.06 && peak < 0.5, `a blow to the right pushes the camera right then it returns (peak +${peak.toFixed(2)}m)`);
  const ctrl = mkCam(16 / 9); ctrl.snap(a, b); settle(ctrl, a, b, 180 + 120);
  ok(Math.abs(cam.camera.position.x - ctrl.camera.position.x) < 0.01, 'kick fully returns (vs a control camera with the same idle sway)');
  const left = mkCam(16 / 9); left.snap(a, b); settle(left, a, b);
  const l0 = left.camera.position.x; let minL = 0; left.kick(-1, 1);
  for (let i = 0; i < 120; i++) { left.update(a, b, DT); minL = Math.min(minL, left.camera.position.x - l0); }
  ok(minL < -0.06, `a blow to the left pushes the camera left (${minL.toFixed(2)}m)`);
  const spam = mkCam(16 / 9); spam.snap(a, b); settle(spam, a, b);
  const s0 = spam.camera.position.clone(); let worst = 0;
  for (let i = 0; i < 180; i++) { spam.kick(i % 2 ? 1 : -1, 1.2); spam.update(a, b, DT); worst = Math.max(worst, spam.camera.position.distanceTo(s0)); }
  ok(worst < 0.9, `kick spam stays bounded (max ${worst.toFixed(2)}m)`);
}
// 12. screen insets keep fighters out of the UI zone
{
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 };
  const feetY = (cam: FightingCamera) => { cam.camera.updateMatrixWorld(true); return new THREE.Vector3(a.x, 0, a.z).project(cam.camera).y; };
  const plain = mkCam(19.5 / 9); plain.snap(a, b); settle(plain, a, b);
  const inset = mkCam(19.5 / 9); inset.setInsets({ bottom: 0.14 }); inset.snap(a, b); settle(inset, a, b);
  const shift = feetY(inset) - feetY(plain);
  ok(shift > 0.1 && shift < 0.2, `bottom inset lifts the fighters on screen (feet +${shift.toFixed(3)} NDC)`);
  ok(inFrame(inset, a) && inFrame(inset, b), 'fighters remain fully framed with the inset');
  inset.setInsets({ bottom: 0 }); settle(inset, a, b, 5);
  ok(Math.abs(feetY(inset) - feetY(plain)) < 0.005, 'removing the inset restores the normal framing');
  inset.resize(16 / 9); ok(Number.isFinite(feetY(inset)), 'resize keeps working with insets');
}
// 13. menu drift
{
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 };
  const cam = mkCam(16 / 9); cam.snap(a, b); settle(cam, a, b);
  const rest = cam.camera.position.clone();
  cam.setMenuMode(true);
  let minX = Infinity, maxX = -Infinity, worst = 0, prev = rest.clone();
  for (let i = 0; i < 60 * 40; i++) { cam.update(a, b, DT); const p = cam.camera.position; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); worst = Math.max(worst, p.distanceTo(prev)); prev = p.clone(); }
  ok(maxX - minX > 0.5, `menu camera drifts (x range ${(maxX - minX).toFixed(2)}m over 40s)`);
  ok(worst < 0.05, `menu drift is gentle (worst per-frame move ${worst.toFixed(4)}m)`);
  cam.setMenuMode(false); settle(cam, a, b, 600);
  ok(cam.camera.position.distanceTo(rest) < 0.06, `leaving the menu returns to the fight frame (residual ${cam.camera.position.distanceTo(rest).toFixed(3)}m)`);
}
// 14. NO zoom-in during fights: ultimates, KO, victory sweep, hits and the intro never move the camera closer or narrow the FOV
{
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 };
  const dTo = (cam: FightingCamera, p: { x: number; z: number }) => cam.camera.position.distanceTo(new THREE.Vector3(p.x, 1.1, p.z));
  const scenarios: Array<[string, (c: FightingCamera) => void]> = [
    ['ultimate cinematic', (c) => c.cinematic(a, 1.3, 1, { orbit: 0.18 })],
    ['KO low-angle focus', (c) => c.cinematic(b, 1.1, 0.75, { low: 0.8 })],
    ['victory orbit', (c) => c.cinematic(a, 2.6, 0.8, { orbit: 0.3 })],
    ['hit kick', (c) => { c.kick(1, 1); }],
    ['round intro sweep', (c) => c.intro()],
    
  ];
  for (const [name, start] of scenarios) {
    const cam = mkCam(16 / 9); cam.snap(a, b); settle(cam, a, b);
    const base = dTo(cam, { x: 0, z: 0 }), baseFov = cam.camera.fov;
    start(cam);
    let minRatio = 9, minFov = 99;
    for (let i = 0; i < 60 * 4; i++) { cam.update(a, b, DT); minRatio = Math.min(minRatio, dTo(cam, { x: 0, z: 0 }) / base); minFov = Math.min(minFov, cam.camera.fov); }
    ok(minRatio > 0.93 && minFov > baseFov - 0.05, `${name}: no zoom-in (closest ${(minRatio * 100).toFixed(0)}% of normal distance, min FOV ${minFov.toFixed(2)})`);
  }
  // the character/store preview still gets its deliberate close-up
  const pv = mkCam(16 / 9); pv.snap(a, a); settle(pv, a, a);
  const pbase = dTo(pv, a); pv.cinematic(a, 99999, 1, { zoom: 0.4 }); settle(pv, a, a, 240);
  ok(dTo(pv, a) / pbase < 0.7 && pv.camera.fov < 30, `preview screens keep their close-up (${((dTo(pv, a) / pbase) * 100).toFixed(0)}% distance, FOV ${pv.camera.fov.toFixed(1)})`);
}
// 15. SHIPPED defaults: a calm, steady camera (numbers measured by scripts/camera-metrics.ts)
{
  const def = new FightingCamera(bounds, 16 / 9);
  ok(JSON.stringify(def.tuning) === JSON.stringify(HYBRID_TUNING), 'a new camera starts with the HYBRID tuning');
  const a = { x: -2, y: 0, z: 0 }, b = { x: 2, y: 0, z: 0 };
  Object.assign(def.tuning, CALM_TUNING); // this check is about the legacy CALM preset
  def.snap(a, b); settle(def, a, b);
  const x0 = def.camera.position.x; let peak = 0;
  def.kick(1, 1); def.setHints({ actionDir: 1, speed: 20 });
  for (let i = 0; i < 120; i++) { def.update(a, b, DT); peak = Math.max(peak, Math.abs(def.camera.position.x - x0)); }
  ok(peak < 0.05 && Math.abs(def.camera.fov - 34) < 0.01, `hits, attacks and dashes no longer jolt, shift or re-lens the camera (max ${peak.toFixed(3)}m, FOV ${def.camera.fov.toFixed(2)})`);

  const calm = run({ ...CALM_TUNING }, 150);
  const full = run({ ...FULL_TUNING }, 150);
  console.log(`   calm: v95 ${calm.speedP95.toFixed(2)} m/s, accel95 ${calm.accelP95.toFixed(1)}, jerk95 ${calm.jerkP95.toFixed(0)}, reversals ${calm.xRevPerMin.toFixed(1)}/min, yaw95 ${calm.yawRateP95.toFixed(2)} deg/s, framed ${(calm.framed * 100).toFixed(1)}%`);
  console.log(`   full: v95 ${full.speedP95.toFixed(2)} m/s, accel95 ${full.accelP95.toFixed(1)}, jerk95 ${full.jerkP95.toFixed(0)}, reversals ${full.xRevPerMin.toFixed(1)}/min, yaw95 ${full.yawRateP95.toFixed(2)} deg/s`);
  ok(calm.jerkP95 < 120 && calm.accelP95 < 12, `real fights: camera is smooth (jerk95 ${calm.jerkP95.toFixed(0)}, accel95 ${calm.accelP95.toFixed(1)})`);
  ok(calm.xRevPerMin < 20, `real fights: the camera rarely changes pan direction (${calm.xRevPerMin.toFixed(1)}/min)`);
  ok(calm.yawRateP95 < 5, `real fights: the view barely rotates (${calm.yawRateP95.toFixed(2)} deg/s at p95)`);
  ok(calm.speedP95 < 2.5, `real fights: peak camera speed stays gentle (${calm.speedP95.toFixed(2)} m/s at p95)`);
  ok(calm.framed >= 0.995, `real fights: both fighters framed ${(calm.framed * 100).toFixed(1)}% of the time`);
  ok(full.jerkP95 > calm.jerkP95 * 5 && full.xRevPerMin > calm.xRevPerMin * 2.5, 'regression guard: the old all-effects camera really was much busier');
  for (const [name, asp] of [['phone 19.5:9', 19.5 / 9], ['4:3', 4 / 3]] as const) {
    const m = run({ ...CALM_TUNING }, 90, asp);
    ok(m.framed >= 0.99, `${name}: fighters framed ${(m.framed * 100).toFixed(1)}% of a real fight`);
  }
}
// 16. fighters never leave the screen (player report: "my player goes out from the screen")
{
  const OLD = { ...CALM_TUNING, distScale: 1.0, frameGuard: 0 }; // the previous camera, kept to prove the bug and the fix
  const cases: Array<[string, number, number]> = [['desktop 16:9', 16 / 9, 0], ['phone 19.5:9 + touch inset', 19.5 / 9, 0.14], ['4:3', 4 / 3, 0]];
  for (const [name, asp, inset] of cases) {
    const now = run({ ...CALM_TUNING }, 140, asp, { insetBottom: inset, human: true });
    ok(now.safe >= 0.995 && now.framed >= 0.999, `${name}: a human-style player (sprints to the edges, jumps, sidesteps) stays inside the HUD-safe area ${(now.safe * 100).toFixed(2)}% of the time`);
    const ai = run({ ...CALM_TUNING }, 100, asp, { insetBottom: inset });
    ok(ai.safe >= 0.995, `${name}: AI fight stays inside the safe area ${(ai.safe * 100).toFixed(2)}%`);
    ok(now.jerkP95 < 160 && ai.jerkP95 < 160, `${name}: the frame guarantee stays smooth (jerk95 ${now.jerkP95.toFixed(0)} / ${ai.jerkP95.toFixed(0)})`);
  }
  const bugPhone = run(OLD, 140, 19.5 / 9, { insetBottom: 0.14, human: true });
  ok(bugPhone.safe < 0.99, `regression guard: the previous camera really did lose the fighter on phones (${(bugPhone.safe * 100).toFixed(1)}% inside the safe area)`);

  // the base view is wider ("a little bit zoom-out")
  const a = { x: -2.3, y: 0, z: 0 }, b = { x: 2.3, y: 0, z: 0 };
  const rest = (tune: Partial<typeof CALM_TUNING>) => { const c = new FightingCamera(bounds, 16 / 9); Object.assign(c.tuning, tune); c.snap(a, b); settle(c, a, b, 400); return c.camera.position.distanceTo(new THREE.Vector3(0, 1.1, 0)); };
  const wide = rest({ ...CALM_TUNING }), previous = rest({ ...CALM_TUNING, distScale: 1.0, frameGuard: 0 });
  ok(wide / previous > 1.08 && wide / previous < 1.25, `the resting view is ${(((wide / previous) - 1) * 100).toFixed(0)}% wider than the previous camera (${previous.toFixed(1)}m -> ${wide.toFixed(1)}m)`);

  // sprinting to the arena edge never even briefly pushes a fighter off-screen
  const cam = new FightingCamera(bounds, 16 / 9); cam.snap(a, b); settle(cam, a, b);
  const p = { x: -2.3, y: 0, z: 0 }, e = { x: 2.3, y: 0, z: 0 }; let outFrames = 0;
  for (let i = 0; i < 60 * 8; i++) {
    p.x = Math.max(-7.2, Math.min(7.2, p.x + (i < 200 ? -0.08 : 0.08))); p.y = i > 300 && i < 330 ? Math.sin(((i - 300) / 30) * Math.PI) * 1.4 : 0; // sprint away, then back with a jump
    cam.setHints({ speed: 5 }); cam.update(p, e, DT);
    cam.camera.updateMatrixWorld(true);
    for (const f of [p, e]) for (const h of [0, 1.95]) { const v = new THREE.Vector3(f.x, f.y + h, f.z).project(cam.camera); if (Math.abs(v.x) > 0.995 || Math.abs(v.y) > 0.995) outFrames++; }
  }
  ok(outFrames === 0, `a sprint to the far edge and back (with a jump) never leaves the screen (${outFrames} frames out)`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL CAMERA TESTS PASSED');
process.exit(fails ? 1 : 0);
