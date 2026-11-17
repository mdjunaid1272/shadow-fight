// The ten camera scenarios from the camera redesign brief, run against the DEFAULT (HYBRID) camera.
import * as THREE from 'three';
import { tuningFor } from '../src/camera/CameraConfig';
import { FightingCamera, HYBRID_TUNING } from '../src/camera/FightingCamera';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const info = (m: string) => console.log('     ' + m);
const bounds = { x: 7.2, z: 2.4 };
const DT = 1 / 60;
const S = FightingCamera.SAFE;
const D2R = Math.PI / 180;
type F = { x: number; y: number; z: number };
const fighter = (x: number, z = 0, y = 0): F => ({ x, y, z });
const mk = (aspect = 16 / 9, insetBottom = 0, limits?: { maxX?: number; maxY?: number }): FightingCamera => {
  const c = new FightingCamera(bounds, aspect); if (insetBottom) c.setInsets({ bottom: insetBottom }); if (limits) c.setLimits(limits); return c;
};
const settle = (c: FightingCamera, a: F, b: F, frames = 400) => { for (let i = 0; i < frames; i++) c.update(a, b, DT); };
const ndc = (c: FightingCamera, x: number, y: number, z: number) => { c.camera.updateMatrixWorld(true); return new THREE.Vector3(x, y, z).project(c.camera); };
/** True if both fighters (feet + head, body width) are inside the HUD-safe screen area (+ slack). */
const inSafe = (c: FightingCamera, fs: F[], slack = 0.02): boolean => {
  for (const f of fs) for (const dx of [-0.45, 0.45]) for (const h of [0, 1.95]) {
    const v = ndc(c, f.x + dx, f.y + h, f.z);
    if (Math.abs(v.x) > S.x + slack || (v.y > 0 ? v.y > S.top + slack : -v.y > S.bottom + slack)) return false;
  }
  return true;
};
const onScreen = (c: FightingCamera, fs: F[]): boolean => fs.every((f) => [0, 1.95].every((h) => { const v = ndc(c, f.x, f.y + h, f.z); return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1; }));
const headingDeg = (c: FightingCamera) => c.debugInfo().yawDeg;
const dist = (c: FightingCamera) => c.debugInfo().distance;

// ------------------------------------------------------------------------------------------------ TEST 1
{
  const a = fighter(-2.3), b = fighter(2.3), c = mk();
  c.snap(a, b); settle(c, a, b);
  const rest = c.camera.position.clone(); let path = 0, prev = rest.clone();
  for (let i = 0; i < 300; i++) { c.update(a, b, DT); path += c.camera.position.distanceTo(prev); prev = c.camera.position.clone(); }
  const d = c.debugInfo();
  ok(path < 0.01, `T1 standing still: the camera stays put (moved ${path.toFixed(4)} m in 5 s)`);
  const mid = ndc(c, 0, 1.0, 0);
  ok(Math.abs(mid.x) < 0.12, `T1 balanced composition: fighters' midpoint is ${mid.x.toFixed(3)} from screen centre`);
  ok(inSafe(c, [a, b], 0), 'T1 both fighters fully visible, clear of the health bars');
  ok(Math.abs(d.pitchDeg) > 8 && Math.abs(d.pitchDeg) < 16, `T1 slightly elevated view: ${Math.abs(d.pitchDeg).toFixed(1)} deg looking down`);
  ok(Math.abs(d.yawDeg) > 8 && Math.abs(d.yawDeg) < 15, `T1 3/4 perspective: ${Math.abs(d.yawDeg).toFixed(1)} deg of yaw (not side-on, not frontal)`);
  info(`rest distance ${d.distance.toFixed(2)} m, fov ${d.fov}`);
}

// ------------------------------------------------------------------------------------------------ TEST 2
{
  const e = fighter(2.3), c = mk(), p = fighter(-2.3);
  c.snap(p, e); settle(c, p, e);
  let worstMid = 0, allSafe = true, worstAcc = 0, prev = c.camera.position.clone(), prevSpeed = 0;
  for (let i = 0; i < 60 * 10; i++) {
    const t = i / 60;
    const vx = t < 3 ? 0.05 : t < 4 ? 0 : t < 7 ? -0.05 : 0; // walk forward (sprint-speed), pause, walk back, stop
    p.x = Math.max(-7.2, Math.min(1.5, p.x + vx));
    c.update(p, e, DT);
    worstMid = Math.max(worstMid, Math.abs(ndc(c, (p.x + e.x) / 2, 1, 0).x));
    if (!inSafe(c, [p, e], 0.04)) allSafe = false;
    const speed = c.camera.position.distanceTo(prev); worstAcc = Math.max(worstAcc, Math.abs(speed - prevSpeed)); prevSpeed = speed; prev = c.camera.position.clone();
  }
  ok(worstMid < 0.5, `T2 forward/backward: tracking without noticeable lag (midpoint never more than ${worstMid.toFixed(2)} from centre)`);
  ok(allSafe, 'T2 the player stays inside the safe area while walking in and out');
  ok(worstAcc < 0.004, `T2 no abrupt movement: smooth acceleration (worst change of speed ${(worstAcc * 3600).toFixed(1)} m/s^2)`);
}

// ------------------------------------------------------------------------------------------------ TEST 3
{
  const a = fighter(-2), b = fighter(2), c = mk();
  c.snap(a, b); settle(c, a, b);
  const d0 = dist(c); let prevD = d0, worstJump = 0, shrink = 0, framed = true;
  for (let i = 0; i < 60 * 5; i++) {
    a.x = Math.max(-7.2, a.x - 0.04); b.x = Math.min(7.2, b.x + 0.04);
    c.update(a, b, DT); const d = dist(c);
    worstJump = Math.max(worstJump, Math.abs(d - prevD)); shrink = Math.max(shrink, prevD - d); prevD = d;
    if (!onScreen(c, [a, b])) framed = false;
  }
  settle(c, a, b, 200);
  const d1 = dist(c);
  ok(d1 > d0 * 1.12, `T3 fighters move apart: the camera zooms out (${d0.toFixed(1)} m -> ${d1.toFixed(1)} m)`);
  ok(shrink < 0.01 && worstJump < 0.2, `T3 zoom is smooth and never pulses back in while they separate (worst step ${worstJump.toFixed(3)} m)`);
  ok(framed && inSafe(c, [a, b], 0.02), 'T3 both fighters stay in frame at maximum separation');
  // and comes back in, slowly, when they close up again
  a.x = -2; b.x = 2; settle(c, a, b, 600);
  ok(Math.abs(dist(c) - d0) < 0.5, `T3 returns to the preferred framing (${dist(c).toFixed(2)} m vs ${d0.toFixed(2)} m)`);
}

// ------------------------------------------------------------------------------------------------ TEST 4
{
  const base = mk(); const a0 = fighter(-2.3), b0 = fighter(2.3);
  base.snap(a0, b0); settle(base, a0, b0); const baseYaw = headingDeg(base);

  const one = mk(); const a = fighter(-2.3), b = fighter(2.3); one.snap(a, b); settle(one, a, b);
  a.z = 2.0; b.z = -1.2; settle(one, a, b, 600); // one sustained pair of sidesteps
  const turn = Math.abs(headingDeg(one) - baseYaw);
  ok(turn > 1.5 && turn <= HYBRID_TUNING.maxDepthYaw + 1, `T4 sustained sidesteps rotate the view a little (${turn.toFixed(1)} deg, limit ${HYBRID_TUNING.maxDepthYaw})`);

  const weave = (freqRad: number, secs: number) => {
    const c = mk(); const p = fighter(-2.3), e = fighter(2.3); c.snap(p, e); settle(c, p, e);
    let last = headingDeg(c), reversals = 0, lastSign = 0, maxRate = 0, lo = 99, hi = -99, lp = 0;
    for (let i = 0; i < 60 * secs; i++) {
      p.z = Math.sin((i / 60) * freqRad) * 2.2; e.z = -Math.sin((i / 60) * freqRad) * 1.4;
      c.update(p, e, DT);
      const h = headingDeg(c); const rate = (h - last) / DT; maxRate = Math.max(maxRate, Math.abs(rate));
      lp += (rate - lp) * 0.05; const s = Math.abs(lp) > 0.4 ? Math.sign(lp) : 0; if (s && lastSign && s !== lastSign) reversals++; if (s) lastSign = s;
      last = h; lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return { reversals, maxRate, amp: hi - lo };
  };
  const rapid = weave(9, 10), slow = weave(1.2, 14);
  ok(rapid.amp < 2.5, `T4 rapid weaving (about 1.4 Hz) barely moves the camera (${rapid.amp.toFixed(2)} deg peak-to-peak)`);
  ok(slow.amp > 4 && slow.amp <= 2 * (HYBRID_TUNING.maxDepthYaw + 1), `T4 slow weaving (a sidestep every ~2.6 s) is followed gently (${slow.amp.toFixed(1)} deg peak-to-peak)`);
  const expectedFlips = Math.floor((1.2 * 14) / Math.PI); // the input itself reverses this often
  ok(slow.reversals <= expectedFlips + 2, `T4 no oscillation: the camera reverses ${slow.reversals} times, the input ${expectedFlips} times`);
  ok(Math.max(rapid.maxRate, slow.maxRate) <= HYBRID_TUNING.maxYawRate + 2.5, `T4 rotation speed is limited (${Math.max(rapid.maxRate, slow.maxRate).toFixed(1)} deg/s, limit ${HYBRID_TUNING.maxYawRate})`);
  // tiny depth wiggles are ignored (hysteresis)
  const q = mk(); const qa = fighter(-2.3), qb = fighter(2.3); q.snap(qa, qb); settle(q, qa, qb); const y0 = headingDeg(q); let dev = 0;
  for (let i = 0; i < 60 * 5; i++) { qa.z = Math.sin(i * 0.3) * 0.25; qb.z = Math.cos(i * 0.27) * 0.2; q.update(qa, qb, DT); dev = Math.max(dev, Math.abs(headingDeg(q) - y0)); }
  ok(dev < 1.5, `T4 tiny depth wiggles do not turn the camera (${dev.toFixed(2)} deg)`);
  // fighters standing on top of each other never flips the camera
  const w = mk(); const wa = fighter(0.2, 0.1), wb = fighter(-0.2, -0.1); w.snap(wa, wb); settle(w, wa, wb);
  ok(Math.abs(headingDeg(w) - baseYaw) < 3, `T4 overlapping fighters never spin the camera (${Math.abs(headingDeg(w) - baseYaw).toFixed(2)} deg)`);
}

// ------------------------------------------------------------------------------------------------ TEST 5
{
  for (const [name, asp, inset] of [['16:9', 16 / 9, 0], ['phone 19.5:9', 19.5 / 9, 0.14]] as const) {
    const e = fighter(2.3), p = fighter(-2.3), c = mk(asp, inset); c.snap(p, e); settle(c, p, e);
    let minY = 9, maxY = -9, minD = 99, maxD = 0, safeFrames = 0, frames = 0, offScreen = 0;
    for (let i = 0; i < 60 * 8; i++) {
      const ph = (i / 60) % 1.6; p.y = ph < 0.9 ? Math.sin((ph / 0.9) * Math.PI) * 1.4 : 0; // a jump every 1.6 s
      c.update(p, e, DT);
      minY = Math.min(minY, c.camera.position.y); maxY = Math.max(maxY, c.camera.position.y);
      minD = Math.min(minD, dist(c)); maxD = Math.max(maxD, dist(c));
      frames++; if (inSafe(c, [p, e], 0.02)) safeFrames++; if (!onScreen(c, [p, e])) offScreen++;
    }
    info(`${name}: camera height varies ${(maxY - minY).toFixed(2)} m, distance varies ${(maxD - minD).toFixed(2)} m, safe ${(100 * safeFrames / frames).toFixed(1)}%`);
    ok(offScreen === 0 && safeFrames / frames > 0.97, `T5 ${name}: both fighters stay visible through repeated jumps (${offScreen} frames off screen)`);
    ok(maxY - minY < 1.0, `T5 ${name}: no excessive vertical camera movement (${(maxY - minY).toFixed(2)} m)`);
    ok((maxD - minD) / minD < 0.12, `T5 ${name}: no zoom pulses when jumping (${(((maxD - minD) / minD) * 100).toFixed(1)}% distance change)`);
  }
}

// ------------------------------------------------------------------------------------------------ TEST 6
{
  const a = fighter(-1.2), b = fighter(1.2), c = mk(); c.snap(a, b); settle(c, a, b);
  const rest = c.camera.position.clone(), d0 = dist(c); let maxDisp = 0, minD = 99, framed = true;
  for (let i = 0; i < 60 * 4; i++) {
    if (i % 12 === 0) { c.kick(1, 0.45); c.addShake(0.14); } // a combo: a light hit every 0.2 s
    if (i === 120) { c.kick(1, 0.15); c.kick(1, 0.8); c.addShake(0.3); c.lowAngle(0.3, 0.9); } // heavy strike + knockdown
    c.update(a, b, DT);
    maxDisp = Math.max(maxDisp, c.camera.position.distanceTo(rest)); minD = Math.min(minD, dist(c)); if (!inSafe(c, [a, b], 0.04)) framed = false;
  }
  ok(maxDisp < 0.45, `T6 combos and heavy hits only nudge the camera (max ${maxDisp.toFixed(2)} m from rest)`);
  ok(minD > d0 * 0.99, `T6 no zoom during combos (closest ${(minD / d0 * 100).toFixed(1)}% of normal distance)`);
  ok(framed, 'T6 the fight stays framed while taking hits');
  settle(c, a, b, 400); ok(c.camera.position.distanceTo(rest) < 0.05, 'T6 returns exactly to its framing after the exchange');
}

// ------------------------------------------------------------------------------------------------ TEST 7
{
  const a = fighter(-2.3), b = fighter(2.3), c = mk(); c.snap(a, b); settle(c, a, b);
  const rest = c.camera.position.clone(), d0 = dist(c); let worst = 0, prev = rest.clone(), minD = 99, bothVisible = true, peak = 0;
  c.cinematic(a, 1.3, 1, { zoom: 0.09 });
  for (let i = 0; i < 60 * 8; i++) {
    c.update(a, b, DT); const p = c.camera.position;
    worst = Math.max(worst, p.distanceTo(prev)); prev = p.clone(); peak = Math.max(peak, p.distanceTo(rest)); minD = Math.min(minD, dist(c));
    if (!onScreen(c, [a, b])) bothVisible = false;
  }
  ok(peak > 0.5 && worst < 0.12, `T7 ultimate: a visible but smooth cinematic move (moves ${peak.toFixed(2)} m, worst per-frame step ${worst.toFixed(3)} m)`);
  ok(minD / d0 > 0.88 && minD / d0 < 1.0, `T7 ultimate: a controlled zoom (closest ${(minD / d0 * 100).toFixed(1)}% of normal distance)`);
  ok(bothVisible, 'T7 ultimate: the opponent stays in view throughout');
  ok(c.camera.position.distanceTo(rest) < 0.06 && Math.abs(c.camera.fov - 34) < 0.05, `T7 ultimate: smooth return to the fight camera (residual ${c.camera.position.distanceTo(rest).toFixed(3)} m, FOV ${c.camera.fov.toFixed(2)})`);
  // intensity slider 0 disables the movement but never breaks the framing
  const z = mk(); z.tuning.cinematic = 0; z.snap(a, b); settle(z, a, b); const zr = z.camera.position.clone(); let zp = 0;
  z.cinematic(a, 1.3, 1); for (let i = 0; i < 200; i++) { z.update(a, b, DT); zp = Math.max(zp, z.camera.position.distanceTo(zr)); }
  ok(zp < 0.05, `T7 cinematic intensity 0 gives a camera that never leaves the fight frame (${zp.toFixed(3)} m)`);
  // knockdown / KO low angle stays above the floor
  const k = mk(); k.snap(a, b); settle(k, a, b); const y0 = k.camera.position.y; let minY = 99;
  k.cinematic(b, 1.1, 0.75, { low: 0.5 }); k.lowAngle(0.3, 0.9);
  for (let i = 0; i < 200; i++) { k.update(a, b, DT); minY = Math.min(minY, k.camera.position.y); }
  ok(minY < y0 - 0.1 && minY > 0.7, `T7 KO/knockdown: subtle low angle (${y0.toFixed(2)} -> ${minY.toFixed(2)} m), never near the floor`);
}

// ------------------------------------------------------------------------------------------------ TEST 8
{
  const corners: Array<[string, F, F]> = [
    ['both at opposite walls', fighter(-7.2, -2.4), fighter(7.2, 2.4)], ['left wall', fighter(-7.2, 0), fighter(-5.4, 0)], ['right wall', fighter(5.4, 0), fighter(7.2, 0)],
    ['front corner', fighter(6.8, 2.4), fighter(7.2, 2.0)], ['back corner', fighter(-7.2, -2.4), fighter(-6.0, -2.4)],
  ];
  for (const [name, a, b] of corners) {
    const c = mk(); c.snap(a, b); settle(c, a, b, 600);
    const p = c.camera.position;
    ok(onScreen(c, [a, b]) && inSafe(c, [a, b], 0.03), `T8 ${name}: both fighters visible (camera x ${p.x.toFixed(1)})`);
    ok(Math.abs(p.x) <= bounds.x + 5 + 1e-6 && p.y >= 0.7, `T8 ${name}: camera stays within arena limits and above the floor`);
  }
  // the dojo's walls and ceiling: with its limits the camera never leaves the room, even at maximum zoom-out
  const lim = { maxX: 9.8, maxY: 5.4 }, a = fighter(-7.2, -2.4), b = fighter(7.2, 2.4), c = mk(16 / 9, 0, lim);
  c.snap(a, b); let maxX = 0, maxY = 0;
  for (let i = 0; i < 600; i++) { c.update(a, b, DT); maxX = Math.max(maxX, Math.abs(c.camera.position.x)); maxY = Math.max(maxY, c.camera.position.y); }
  ok(maxX <= lim.maxX + 1e-6 && maxY <= lim.maxY + 1e-6 && onScreen(c, [a, b]), `T8 dojo limits respected (x ${maxX.toFixed(2)} <= ${lim.maxX}, y ${maxY.toFixed(2)} <= ${lim.maxY}) with both fighters still on screen`);
}

// ------------------------------------------------------------------------------------------------ TEST 9
{
  const shapes: Array<[string, number, number]> = [['16:9 touch', 16 / 9, 0.14], ['18:9', 2, 0.14], ['19.5:9', 19.5 / 9, 0.14], ['20:9', 20 / 9, 0.14], ['21:9', 21 / 9, 0.14], ['4:3 tablet', 4 / 3, 0.14], ['16:9 desktop', 16 / 9, 0]];
  for (const [name, asp, inset] of shapes) {
    let worstHead = -9, worstFeet = 9, worstTorso = 9, offScreen = 0;
    for (const [ax, bx, jump] of [[-2.3, 2.3, 0], [-0.9, 0.9, 0], [-6, 6, 0], [-2.3, 2.3, 1.4], [-7.2, -3, 0]] as const) {
      const a = fighter(ax, 0, jump), b = fighter(bx), c = mk(asp, inset); c.snap(a, b); settle(c, a, b, 500);
      for (const f of [a, b]) {
        worstHead = Math.max(worstHead, ndc(c, f.x, f.y + 1.95, f.z).y);
        worstFeet = Math.min(worstFeet, ndc(c, f.x, f.y, f.z).y);
        worstTorso = Math.min(worstTorso, ndc(c, f.x, f.y + 1.0, f.z).y);
      }
      if (!onScreen(c, [a, b])) offScreen++;
    }
    const controlsClear = inset === 0 || worstTorso > -0.3; // the touch-control band is the bottom ~35% of the screen
    ok(offScreen === 0 && worstHead <= S.top + 0.02 && worstFeet >= -S.bottom - 0.02 && controlsClear, `T9 ${name}: heads ${worstHead.toFixed(2)} (<= ${S.top}), feet ${worstFeet.toFixed(2)}, torso ${worstTorso.toFixed(2)}${inset ? ' (above the control band)' : ''}`);
  }
}

// ------------------------------------------------------------------------------------------------ TEST 10
{
  const script = (t: number): [F, F] => {
    const a = fighter(-2.3 + (t < 3 ? t * 1.2 : t < 5 ? 3.6 : 3.6 - (t - 5) * 1.5), Math.sin(t * 1.1) * 1.4, t > 2.5 && t < 3.3 ? Math.sin(((t - 2.5) / 0.8) * Math.PI) * 1.3 : 0);
    const b = fighter(2.3 + Math.sin(t * 0.7) * 1.2, Math.cos(t * 0.9) * 0.8);
    a.x = Math.max(-7.2, Math.min(7.2, a.x)); return [a, b];
  };
  const times = [1.5, 3.0, 4.2, 6.0, 7.5];
  const play = (dtStep: number) => {
    const c = mk(); const [a0, b0] = script(0); c.snap(a0, b0);
    let t = 0, finite = true, safe = 0, n = 0, next = 0; const poses: Array<{ pos: THREE.Vector3; yaw: number; dist: number }> = [];
    while (t < 8) {
      const [a, b] = script(t); c.update(a, b, dtStep); t += dtStep;
      const p = c.camera.position; if (![p.x, p.y, p.z, c.camera.fov].every(Number.isFinite)) finite = false;
      n++; if (inSafe(c, [a, b], 0.04)) safe++;
      if (next < times.length && t >= times[next] - 1e-9) { poses.push({ pos: p.clone(), yaw: headingDeg(c), dist: dist(c) }); next++; }
    }
    return { poses, finite, safe: safe / n };
  };
  const ref = play(1 / 60);
  const worst = (r: ReturnType<typeof play>) => ({ pos: Math.max(...r.poses.map((q, i) => q.pos.distanceTo(ref.poses[i].pos))), yaw: Math.max(...r.poses.map((q, i) => Math.abs(q.yaw - ref.poses[i].yaw))), dist: Math.max(...r.poses.map((q, i) => Math.abs(q.dist - ref.poses[i].dist))) });
  const r30 = play(1 / 30), r20 = play(1 / 20), r10 = play(1 / 10);
  const w30 = worst(r30), w20 = worst(r20), w10 = worst(r10);
  info(`worst pose difference vs 60 fps over 5 mid-motion snapshots: 30fps ${w30.pos.toFixed(2)} m, 20fps ${w20.pos.toFixed(2)} m, 10fps ${w10.pos.toFixed(2)} m`);
  ok(ref.finite && r30.finite && r20.finite && r10.finite, 'T10 stable at every frame rate (no NaN)');
  ok(w30.pos < 0.15 && w20.pos < 0.3 && w10.pos < 0.7, `T10 frame-rate independent: poses at 30 / 20 / 10 fps are within ${w30.pos.toFixed(2)} / ${w20.pos.toFixed(2)} / ${w10.pos.toFixed(2)} m of the 60 fps camera while moving`);
  ok(w20.yaw < 2 && w20.dist < 0.6, `T10 same rotation and zoom at 20 fps (yaw ${w20.yaw.toFixed(2)} deg, distance ${w20.dist.toFixed(2)} m apart)`);
  ok(r20.safe > 0.97 && r10.safe > 0.93, `T10 fighters stay framed even at 20 / 10 fps (${(r20.safe * 100).toFixed(1)}% / ${(r10.safe * 100).toFixed(1)}%)`);
}
// ------------------------------------------------------------------------------------------------ camera distance setting
{
  const restDist = (mul: number, asp = 16 / 9) => { const c = mk(asp); Object.assign(c.tuning, tuningFor('hybrid', 1, mul)); const a = fighter(-2.3), b = fighter(2.3); c.snap(a, b); settle(c, a, b, 500); return { d: dist(c), c, a, b }; };
  const near = restDist(0.9), def = restDist(1.0), far = restDist(1.5);
  ok(near.d < def.d && def.d < far.d && Math.abs(far.d / def.d - 1.5) < 0.12, `distance setting scales the view: 0.9x ${near.d.toFixed(1)} m, 1.0x ${def.d.toFixed(1)} m, 1.5x ${far.d.toFixed(1)} m`);
  ok(def.d > 13.5 && def.d < 15, `the default rest view is ${def.d.toFixed(1)} m (was 11.8 m before this change)`);
  ok(inSafe(far.c, [far.a, far.b], 0) && inSafe(near.c, [near.a, near.b], 0), 'fighters stay fully framed at the nearest and farthest settings');
  ok(restDist(100).d <= restDist(1.8).d + 0.01 && restDist(-3).d >= restDist(0.8).d - 0.01, 'out-of-range distance settings are clamped (0.8x - 1.8x)');
}
// ------------------------------------------------------------------------------------------------ zoom pulses
{
  const a = fighter(-2.3), b = fighter(2.3), c = mk();
  c.snap(a, b); settle(c, a, b);
  const rest = dist(c);
  c.zoomPulse(-0.1, 0.3);
  let minD = rest, framed = true;
  for (let i = 0; i < 40; i++) { c.update(a, b, DT); minD = Math.min(minD, dist(c)); framed = framed && onScreen(c, [a, b]); }
  ok(minD < rest * 0.95, `zoom-in pulse punches in (${rest.toFixed(2)} -> ${minD.toFixed(2)} m)`);
  ok(framed, 'fighters stay on screen during a zoom-in pulse');
  settle(c, a, b, 300);
  ok(Math.abs(dist(c) - rest) < 0.05, 'camera returns to its rest distance after the pulse');
  c.zoomPulse(0.1, 0.5); let maxD = rest;
  for (let i = 0; i < 40; i++) { c.update(a, b, DT); maxD = Math.max(maxD, dist(c)); }
  ok(maxD > rest * 1.05, `zoom-out pulse pulls back (${rest.toFixed(2)} -> ${maxD.toFixed(2)} m)`);
  c.zoomPulse(-5, 0.5); let m2 = rest; for (let i = 0; i < 60; i++) { c.update(a, b, DT); m2 = Math.min(m2, dist(c)); }
  ok(m2 > rest * 0.8, 'pulse strength is clamped (never more than ~15% in)');
}
console.log(fails ? `\n${fails} FAILED` : '\nALL CAMERA SCENARIOS PASSED');
process.exit(fails ? 1 : 0);
