import * as THREE from 'three';
import type { ArenaBounds } from '../combat/Fighter';
import { CALM_TUNING, FULL_TUNING, HYBRID_TUNING, type CameraTuning } from './CameraConfig';

export { CALM_TUNING, FULL_TUNING, HYBRID_TUNING };
export type { CameraTuning };

interface P { x: number; y?: number; z: number }

/** Critically damped spring (Unity-style SmoothDamp): no overshoot, no jitter, stable at any step size. */
class Spring {
  v = 0;
  constructor(public value = 0) {}
  step(target: number, smoothTime: number, dt: number): number {
    const t = Math.max(0.0001, smoothTime), omega = 2 / t, x = omega * dt;
    const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.value - target, temp = (this.v + omega * change) * dt;
    this.v = (this.v - omega * temp) * e;
    this.value = target + (change + temp) * e;
    return this.value;
  }
  snap(v: number): void { this.value = v; this.v = 0; }
}

const clamp = THREE.MathUtils.clamp;
const D2R = Math.PI / 180;
const smooth01 = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Arena-specific camera limits so the camera never ends up inside walls / above ceilings. */
export interface CameraLimits { maxX?: number; maxY?: number }
export type CameraMode = 'MENU' | 'INTRO' | 'CINEMATIC' | 'ACCENT' | 'COMBAT';

/**
 * The battle camera: ONE controller, configured by CameraTuning (see CameraConfig.ts).
 *
 *  - Elevated 3/4 perspective (configurable pitch + yaw) that shows arena depth.
 *  - Critically damped follow of the fighters' midpoint with separate smoothing for X / Y / Z / rotation and a dead zone.
 *  - Depth rotation: yaws a little when fighters separate in depth - with hysteresis, an angular limit and a rate limit.
 *  - Distance solved from the real screen fit (head, feet, body width inside the HUD-safe area); preferred distance shrinks a
 *    little in close combat; zoom OUT is faster than zoom IN; hysteresis prevents zoom "breathing".
 *  - Combat feel: small directional hit impulse, clamped shake, cinematic moves (ultimate / KO / victory) and a low-angle accent.
 *  - Frame-rate independent: updates are sub-stepped, so 15 fps behaves like 60 fps.
 *  - Frame guarantee, screen insets for touch UI, arena limits, never below the floor.
 */
export class FightingCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Live configuration - assign a preset (tuningFor) or tweak individual values. */
  readonly tuning: CameraTuning = { ...HYBRID_TUNING };

  private x = new Spring(); private y = new Spring(1.1); private z = new Spring();
  private dist = new Spring(11.8); private yaw = new Spring(11 * D2R);
  private lookX = new Spring(); private lookY = new Spring(1.1); private lookZ = new Spring();
  private fov = new Spring(34);
  private lead = new Spring(); private vxLP = 0;
  private time = 0;

  private shake = 0;
  private introK = 0; private introK2 = new Spring(0);
  private cineFocus: P | null = null; private cineLeft = 0; private cineStrength = 1;
  private cineK = new Spring(0);
  private cineOrbit = 0; private cineLow = 0; private orbitT = 0;
  /** Cinematic zoom-in fraction (0 = none). Fights use 0 except a small, controlled ultimate zoom; previews use a close-up. */
  private cineZoom = 0;
  private zoomK = new Spring(0); private zoomLeft = 0; private zoomAmt = 0; private zoomIn_ = 0.07; private zoomOut_ = 0.3;
  private lowK = new Spring(0); private lowLeft = 0; private lowAmt = 0;
  /** Camera roll (a dutch tilt) for style flourishes: eased in, held, eased back to level. */
  private rollK = new Spring(0); private rollLeft = 0; private rollAmt = 0;

  /** Live action hints from the game (see setHints). */
  private hint = { actionDir: 0, speed: 0 };
  private actionLead = new Spring(); private fovKick = new Spring();
  /** Dead-zone / hysteresis anchors: small movements are absorbed so panning, zoom and rotation feel deliberate. */
  private anchorX = 0; private anchorDist = 11.8; private angAnchor = 0; private angLP = 0;

  /**
   * Frame guarantee: both fighters (feet, head, body width) must stay inside this part of the screen (NDC), which keeps them
   * clear of the screen edges and of the health bars across the top.
   */
  static readonly SAFE = { x: 0.88, top: 0.72, bottom: 0.9 };
  /** The real screen edge (with a hair of margin): only crossing THIS triggers the instant last-resort correction. */
  private static readonly HARD = { x: 0.97, top: 0.97, bottom: 0.97 };
  /** Extra half-width (m) around each fighter when solving the distance, covering smoothing lag. */
  static LAG_HALF = 1.8;
  private fitCam = new THREE.PerspectiveCamera(); private fitV = new THREE.Vector3();
  private safety = new Spring(1);
  private holdT = 0;

  /** Directional hit kick: a target that decays, eased in (drive) and followed by a spring - no sudden velocity jump, so no jolt. */
  private kickX = new Spring(); private kickY = new Spring();
  private kickTX = 0; private kickTY = 0; private kickDX = 0; private kickDY = 0;
  /** Slow drifting menu camera. */
  private menuK = new Spring(); private menuOn = false;
  /** Screen-space insets (fractions of height) so UI like touch controls does not cover the fighters. */
  private insetBottom = 0; private insetTop = 0;
  private limits: CameraLimits = {};
  private tmp = new THREE.Vector3();
  private dbg = { sep: 0, yawTarget: 0, distTarget: 0 };

  constructor(private bounds: ArenaBounds, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.tuning.baseFov, aspect, 0.1, 200);
    this.apply();
  }

  resize(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); this.applyInsets(); }

  /** Arena-specific limits (e.g. the dojo's ceiling and side walls). */
  setLimits(l: CameraLimits): void { this.limits = { ...l }; }

  /**
   * Reserve screen space (fractions of the viewport height, 0..0.3) for UI. The picture is shifted so the
   * fighters sit in the free area - e.g. bottom: 0.14 keeps phones' on-screen buttons off the fighters.
   */
  setInsets(i: { top?: number; bottom?: number }): void {
    this.insetTop = clamp(i.top ?? 0, 0, 0.3); this.insetBottom = clamp(i.bottom ?? 0, 0, 0.3); this.applyInsets();
  }
  private applyInsets(): void {
    const shift = (this.insetBottom - this.insetTop) / 2; // fraction of height the picture moves up
    if (Math.abs(shift) < 1e-4) { this.camera.clearViewOffset(); return; }
    const H = 1000, W = H * this.camera.aspect;
    this.camera.setViewOffset(W, H, 0, shift * H, W, H);
  }

  /** Directional kick: a hit pushes the camera along the blow's direction (dirX = world x of the push), then it springs back. */
  kick(dirX: number, strength: number): void {
    const s = clamp(strength, 0, 1.2) * this.tuning.kick * this.tuning.impact;
    this.kickTX = clamp(this.kickTX + Math.sign(dirX || 1) * s * 0.3, -0.5, 0.5);
    this.kickTY = clamp(this.kickTY - s * 0.1, -0.2, 0.2);
  }

  /** Menu mode: the camera drifts slowly so menu screens feel alive. */
  setMenuMode(on: boolean): void { this.menuOn = on; }

  /** Trauma-style shake; clamped so it can never become excessive. */
  addShake(amount: number): void { this.shake = Math.min(0.55, this.shake + amount * this.tuning.shake * this.tuning.impact); }

  /**
   * Per-frame action context so the camera reacts to the fight, not just to positions:
   *  - actionDir: -1..1, x-direction of whoever is attacking right now (lead room; off in the default style)
   *  - speed: fastest fighter speed in m/s (FOV widening; off in the default style)
   */
  setHints(h: { actionDir?: number; speed?: number }): void {
    this.hint.actionDir = clamp(h.actionDir ?? 0, -1, 1); this.hint.speed = Math.max(0, h.speed ?? 0);
  }

  /**
   * Focus on `focus` for `seconds`, then ease back. Options: `orbit` = extra orbit speed (rad/s) around the focus (victory
   * sweep), `low` = 0..1 drop to a low dramatic angle (KO), `zoom` = fraction of distance to close in (0 = none).
   * Pan / orbit / low scale with the player's cinematic intensity.
   */
  cinematic(focus: P, seconds: number, strength = 1, opts?: { orbit?: number; low?: number; zoom?: number }): void {
    this.cineFocus = focus; this.cineLeft = seconds; this.cineStrength = strength;
    this.cineOrbit = opts?.orbit ?? 0; this.cineLow = opts?.low ?? 0; this.cineZoom = opts?.zoom ?? 0;
    if (!this.cineOrbit) this.orbitT = 0;
  }

  /** Subtle low-angle accent (knockdowns) without panning away from the fight. */
  /** Zoom pulse: amount < 0 punches IN (e.g. -0.1 = 10% closer), > 0 pulls OUT; holds `seconds`, then eases back. Limited to -15%..+20%; the frame guard still applies. */
  zoomPulse(amount: number, seconds: number, inTime = 0.07, outTime = 0.3): void {
    this.zoomAmt = clamp(amount, -0.15, 0.2) * this.tuning.cinematic; this.zoomLeft = seconds; this.zoomIn_ = inTime; this.zoomOut_ = outTime;
  }
  /** Tilt the camera by deg degrees (limited to +-6) for seconds, then ease back to level. Scaled by the cinematic intensity. */
  roll(deg: number, seconds: number): void { this.rollAmt = clamp(deg, -6, 6); this.rollLeft = seconds; }
  lowAngle(amount: number, seconds: number): void { this.lowAmt = clamp(amount, 0, 1); this.lowLeft = seconds; }

  /** Round-start sweep: starts higher and angled, then settles into the fight frame. */
  intro(): void { this.introK = 1; this.introK2.snap(1); }

  /** Snap (no smoothing), used at round start / after arena changes. */
  snap(a: P, b: P): void {
    this.anchorX = (a.x + b.x) / 2;
    const t = this.targets(a, b, 0.016, true);
    this.kickX.snap(0); this.kickY.snap(0); this.kickTX = this.kickTY = this.kickDX = this.kickDY = 0; this.menuK.snap(this.menuOn ? 1 : 0); this.lowK.snap(0); this.lowLeft = 0; this.rollK.snap(0); this.rollLeft = 0; this.zoomK.snap(0); this.zoomLeft = 0;
    this.x.snap(t.mx); this.y.snap(t.my); this.z.snap(t.mz);
    this.dist.snap(t.dist); this.yaw.snap(t.yaw);
    this.lookX.snap(t.mx); this.lookY.snap(t.my); this.lookZ.snap(t.mz);
    this.fov.snap(this.tuning.baseFov); this.lead.snap(0); this.cineK.snap(0); this.shake = 0;
    this.actionLead.snap(0); this.fovKick.snap(0); this.orbitT = 0;
    this.safety.snap(1); this.apply();
    this.safety.snap(this.fitScale(a, b, true)); this.apply();
  }

  /** Advance by `rawDt` seconds. Long frames are sub-stepped so low frame rates behave like high ones. */
  update(a: P, b: P, rawDt: number): void {
    const total = Math.min(rawDt, 0.25);
    const n = Math.max(1, Math.ceil(total / (1 / 40)));
    const h = total / n;
    for (let i = 0; i < n; i++) this.step(a, b, h);
    this.apply();
  }

  private step(a: P, b: P, dt: number): void {
    const T = this.tuning, ci = T.cinematic;
    this.time += dt;
    const t = this.targets(a, b, dt);

    this.cineLeft = Math.max(0, this.cineLeft - dt);
    const cineK = this.cineK.step(this.cineLeft > 0 ? this.cineStrength : 0, this.cineLeft > 0 ? 0.28 : 0.55, dt);
    if (this.cineLeft <= 0 && cineK < 0.002) this.cineFocus = null;
    const cK = cineK * ci; // pan / orbit / low scale with cinematic intensity
    const introK = this.introK > 0 ? this.introK2.step(0, 0.75, dt) : 0;
    if (introK < 0.002) this.introK = 0;
    this.lowLeft = Math.max(0, this.lowLeft - dt);
    this.rollLeft = Math.max(0, this.rollLeft - dt);
    this.rollK.step(this.rollLeft > 0 ? this.rollAmt : 0, this.rollLeft > 0 ? 0.16 : 0.45, dt);
    this.zoomLeft = Math.max(0, this.zoomLeft - dt);
    this.zoomK.step(this.zoomLeft > 0 ? this.zoomAmt : 0, this.zoomLeft > 0 ? this.zoomIn_ : this.zoomOut_, dt);
    const lowK = this.lowK.step(this.lowLeft > 0 ? this.lowAmt : 0, this.lowLeft > 0 ? 0.18 : 0.6, dt);

    let mx = t.mx, mz = t.mz, my = t.my, dist = t.dist, yaw = t.yaw;
    const cf = this.cineFocus;
    if (cf) {
      mx += (cf.x - mx) * 0.6 * cK; mz += (cf.z - mz) * 0.6 * cK; my += 0.15 * cK;
      dist *= 1 - this.cineZoom * cineK; // previews: close-up; ultimate: small controlled zoom; everything else: 0
      const side = cf.x < t.mx ? 1 : -1;
      if (this.cineOrbit && this.cineLeft > 0) this.orbitT = clamp(this.orbitT + this.cineOrbit * dt, -1.2, 1.2);
      yaw += side * (0.34 + this.orbitT) * cK; // show the focus fighter's profile (+ optional sweep)
      my -= this.cineLow * 0.45 * cK;
    } else this.orbitT *= Math.exp(-3 * dt);
    my -= lowK * 0.45 * ci;
    mx = clamp(mx + this.actionLead.step(this.hint.actionDir * 0.75 * T.actionLead, 0.32, dt), -this.bounds.x, this.bounds.x);
    yaw += 0.55 * introK; my += 0.9 * introK;
    const menuK = this.menuK.step(this.menuOn ? 1 : 0, 1.2, dt);
    if (menuK > 0.001) { yaw += Math.sin(this.time * 0.17) * 0.24 * menuK; my += (0.25 + Math.sin(this.time * 0.11) * 0.18) * menuK; }
    const decay = Math.exp(-7 * dt), ease = 1 - Math.exp(-dt / 0.04);
    this.kickTX *= decay; this.kickTY *= decay;
    this.kickDX += (this.kickTX - this.kickDX) * ease; this.kickDY += (this.kickTY - this.kickDY) * ease;
    this.kickX.step(this.kickDX, 0.12, dt); this.kickY.step(this.kickDY, 0.12, dt);
    this.kickX.value = clamp(this.kickX.value, -0.45, 0.45); this.kickY.value = clamp(this.kickY.value, -0.25, 0.1); // a barrage can never drag the camera far

    // ---- springs: separate smoothing for X / Y / Z / rotation / zoom
    const fs = T.follow;
    this.x.step(mx, T.followX * fs * (cf ? 0.75 : 1), dt);
    this.y.step(my, T.followY * fs * (my > this.y.value + 0.05 ? 0.45 : 1), dt); // rise quickly with a jump, settle slowly
    this.z.step(mz, T.followZ * fs, dt);
    // zoom OUT is faster than zoom IN, and speeds up the further behind it is (so the guard rarely has to step in)
    const behind = dist - this.dist.value;
    this.dist.step(dist, (behind > 0 ? T.zoomOut * clamp(1 - behind / 3, 0.4, 1) : T.zoomIn) * fs, dt);
    const prevYaw = this.yaw.value;
    this.yaw.step(yaw, T.rotSmooth * fs, dt);
    if (T.maxYawRate > 0 && introK < 0.01 && !cf) { // angular speed limit (not while a cinematic or the intro is steering)
      const lim = T.maxYawRate * D2R * dt, dv = this.yaw.value - prevYaw;
      if (Math.abs(dv) > lim) { this.yaw.value = prevYaw + Math.sign(dv) * lim; this.yaw.v *= 0.5; }
    }
    const ll = T.lookLag;
    this.lookX.step(this.x.value, 0.12 * ll, dt); this.lookY.step(my, 0.22 * ll, dt); this.lookZ.step(this.z.value, 0.2 * ll, dt);
    const speedFov = clamp(this.hint.speed / 7, 0, 1) * 2.4 * T.speedFov;
    this.fov.step(T.baseFov - this.cineZoom * 15 * Math.min(1, cineK) + this.fovKick.step(speedFov, 0.35, dt), 0.25, dt);

    // ---- frame guarantee: pull back at once if a fighter would leave the safe area, ease back in slowly afterwards
    const need = Math.ceil(this.fitScale(a, b) * 50 - 1e-6) / 50, hard = this.fitScale(a, b, true);
    if (need > this.safety.value + 0.005) this.holdT = 1.3; else this.holdT -= dt;
    const goal = this.holdT > 0 ? Math.max(need, this.safety.value) : need;
    // small corrections are gentle, large ones fast: smooth time 0.35 s up to 0.12 s as the demand approaches 10%
    this.safety.step(goal, goal > this.safety.value ? 0.35 - 0.23 * clamp((goal - 1) / 0.1, 0, 1) : 1.8, dt);
    if (this.safety.value < hard) this.safety.snap(hard); // last resort: never let a fighter be off-screen
    if (this.safety.value < 1) this.safety.snap(1);

    this.shake *= Math.exp(-8 * dt);
  }

  // ------------------------------------------------------------------ framing targets
  private targets(a: P, b: P, dt: number, snap = false) {
    const T = this.tuning;
    const mxRaw = (a.x + b.x) / 2, mzRaw = (a.z + b.z) / 2;
    // dead zone: the anchor only moves once the midpoint leaves a small window around it (also drives the velocity lead)
    const prevAnchor = this.anchorX;
    if (Math.abs(mxRaw - this.anchorX) > T.deadZone) this.anchorX = mxRaw - Math.sign(mxRaw - this.anchorX) * T.deadZone;
    const vxRaw = (this.anchorX - prevAnchor) / Math.max(dt, 0.001);
    this.vxLP = snap ? 0 : this.vxLP + (vxRaw - this.vxLP) * (1 - Math.exp(-dt / 0.12)); // low-pass: stop/start jitter must not shake the camera
    const vx = this.vxLP;
    // velocity feed-forward: a critically damped follower trails a moving target by speed * smoothTime, so lead by that much
    const lead = this.lead.step(clamp(vx * (T.followX * T.follow + 0.12 * T.lookLag) * T.leadGain, -2.2, 2.2), 0.1, dt);

    const bx = this.bounds.x, bz = this.bounds.z;
    const mx = clamp(this.anchorX + lead, -bx, bx);
    const mz = clamp(mzRaw, -bz, bz);
    const ya = a.y ?? 0, yb = b.y ?? 0;
    const my = T.lookHeight + 0.5 * Math.max(ya, yb); // follow jumps so a leap does not push the head under the HUD

    const dx = b.x - a.x, dz = b.z - a.z;
    const sep = Math.hypot(dx, dz), spread = Math.hypot(dx, dz * 0.6);

    // ---- depth rotation: yaw a little toward the fighter line, ONLY when depth separation genuinely changes
    const flip = dx < 0 ? -1 : 1; // treat the line as left->right regardless of which fighter is where
    const angRaw = Math.atan2(dz * flip, Math.max(Math.abs(dx), 0.001)) * smooth01((spread - 0.6) / 1.4); // fades out when fighters overlap
    // low-pass: rapid weaving in depth is averaged out; a sustained sidestep still turns the view
    this.angLP = snap || T.yawFilter <= 0 ? angRaw : this.angLP + (angRaw - this.angLP) * (1 - Math.exp(-dt / T.yawFilter));
    const ang = this.angLP;
    const hyst = T.yawHysteresis * D2R;
    if (snap) this.angAnchor = ang; else if (Math.abs(ang - this.angAnchor) > hyst) this.angAnchor = ang - Math.sign(ang - this.angAnchor) * hyst;
    const maxD = T.maxDepthYaw * D2R;
    const yaw = T.yaw * D2R + T.depthYaw * clamp(this.angAnchor * 0.7, -maxD, maxD);

    // ---- zoom: preferred distance (a little closer in close combat), enlarged by the screen-fit solver when needed
    const pref = T.baseDistance * T.distScale * (T.closeFactor + (1 - T.closeFactor) * smooth01((sep - 1.6) / 3.4));
    let distRaw: number;
    if (T.frameGuard) {
      distRaw = this.solveDist(a, b, mx, my, mz, yaw, Math.max(pref, T.minDistance));
    } else { // previous analytic estimate (kept so the old behaviour can still be reproduced in tests)
      const tanH = Math.tan((T.baseFov * D2R) / 2);
      const wantByWidth = (spread / 2 + 3.4) / (tanH * this.camera.aspect);
      const wantByHeight = (1.7 + Math.max(ya, yb) * 0.9) / tanH + 2;
      distRaw = clamp(Math.max(wantByWidth, wantByHeight * 0.75), 7.6, 26) * T.distScale;
    }
    // zoom hysteresis: ignore distance changes smaller than zoomHyst (fighters shuffling back and forth)
    if (snap || Math.abs(distRaw - this.anchorDist) > T.zoomHyst) this.anchorDist = snap ? distRaw : distRaw - Math.sign(distRaw - this.anchorDist) * T.zoomHyst;
    this.dbg.sep = sep; this.dbg.yawTarget = yaw; this.dbg.distTarget = this.anchorDist;

    return { mx, my, mz, dist: this.anchorDist, yaw };
  }

  // ------------------------------------------------------------------ fit solver + guard
  /** Fighters to keep in frame. (A 0.3 s look-ahead was tried and removed: predicted positions kept demanding a wider view.) */
  private fighterSet(a: P, b: P): P[] { return [a, b]; }

  /** The one eye-position formula (elevated 3/4 view), shared by apply() and every fit check. Respects arena limits. */
  private eyeFor(x: number, y: number, z: number, yaw: number, dist: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.tuning.pitch * D2R, cp = Math.cos(p), sp = Math.sin(p);
    out.set(x - Math.sin(yaw) * dist * cp, y + dist * sp, z * 0.6 + Math.cos(yaw) * dist * cp);
    return this.limitEye(out);
  }
  private limitEye(e: THREE.Vector3): THREE.Vector3 {
    const mx = this.limits.maxX ?? this.bounds.x + 5;
    e.x = clamp(e.x, -mx, mx); e.y = clamp(e.y, 0.7, this.limits.maxY ?? 99);
    return e;
  }

  private syncFitCam(): THREE.PerspectiveCamera {
    const fc = this.fitCam;
    fc.projectionMatrix.copy(this.camera.projectionMatrix); fc.projectionMatrixInverse.copy(this.camera.projectionMatrixInverse);
    return fc;
  }

  /** Largest |screen position| / limit over the fighters' extremes (feet + head, `half` metres either side) for a framing. >1 = outside. */
  private overshoot(fc: THREE.PerspectiveCamera, fighters: P[], pose: { x: number; y: number; z: number; lx: number; ly: number; lz: number; yaw: number; dist: number }, S: { x: number; top: number; bottom: number }, half: number): number {
    this.eyeFor(pose.x, pose.y, pose.z, pose.yaw, pose.dist, fc.position);
    fc.lookAt(pose.lx, pose.ly, pose.lz * 0.6); fc.updateMatrixWorld(true);
    let worst = 0;
    for (const f of fighters) for (const dx of [-half, half]) for (const h of [0, 1.95]) {
      this.fitV.set(f.x + dx, (f.y ?? 0) + h, f.z).project(fc);
      if (this.fitV.z > 1) return 9;
      worst = Math.max(worst, Math.abs(this.fitV.x) / S.x, this.fitV.y > 0 ? this.fitV.y / S.top : -this.fitV.y / S.bottom);
    }
    return worst;
  }

  /** Guard: extra distance multiplier (>= 1) needed so both fighters fit from the CURRENT smoothed pose. */
  private fitScale(a: P, b: P, hard = false): number {
    if (!this.tuning.frameGuard || this.menuOn || (this.cineZoom >= 0.3 && this.cineLeft > 0)) return 1; // off, or previews frame on purpose
    const fc = this.syncFitCam(), set = this.fighterSet(a, b), S = hard ? FightingCamera.HARD : FightingCamera.SAFE;
    let s = 1;
    for (let i = 0; i < 4; i++) {
      const o = this.overshoot(fc, set, { x: this.x.value, y: this.y.value, z: this.z.value, lx: this.lookX.value, ly: this.lookY.value, lz: this.lookZ.value, yaw: this.yaw.value, dist: this.dist.value * (1 + this.zoomK.value) * s }, S, 0.45);
      if (o <= 1) break;
      s = Math.min(2.4, s * (1 + (o - 1) * 0.95));
    }
    return s;
  }

  /** Target distance: the smallest (never below `minD`) at which both fighters fit the safe area for the framing, with extra width for smoothing lag. */
  private solveDist(a: P, b: P, mx: number, my: number, mz: number, yaw: number, minD: number): number {
    const fc = this.syncFitCam(), set = this.fighterSet(a, b);
    let d = minD;
    for (let i = 0; i < 6; i++) {
      const o = this.overshoot(fc, set, { x: mx, y: my, z: mz, lx: mx, ly: my, lz: mz, yaw, dist: d }, FightingCamera.SAFE, FightingCamera.LAG_HALF);
      if (o <= 1) break;
      d *= 1 + (o - 1) * 0.95;
    }
    return clamp(d, minD, this.tuning.maxDistance);
  }

  // ------------------------------------------------------------------ output
  private apply(): void {
    const yaw = this.yaw.value, dist = this.dist.value * (1 + this.zoomK.value) * this.safety.value;
    const s = this.shake * this.shake;
    const ox = (Math.sin(this.time * 61) + Math.sin(this.time * 97) * 0.5) * 0.08 * s;
    const oy = (Math.cos(this.time * 73) + Math.cos(this.time * 113) * 0.5) * 0.07 * s;
    const sway = Math.sin(this.time * 0.6) * 0.02 * this.tuning.sway; // barely-there breathing movement

    this.eyeFor(this.x.value, this.y.value, this.z.value, yaw, dist, this.tmp);
    this.tmp.x += ox + sway + this.kickX.value; this.tmp.y += oy + this.kickY.value;
    this.camera.position.copy(this.limitEye(this.tmp));
    this.camera.lookAt(this.lookX.value, this.lookY.value, this.lookZ.value * 0.6);
    if (Math.abs(this.rollK.value) > 0.001) this.camera.rotateZ(this.rollK.value * D2R * Math.min(1, this.tuning.cinematic));
    this.camera.rotateZ(((Math.sin(this.time * 47) * 0.012) + (Math.sin(this.time * 83) * 0.006)) * s * 6); // tiny roll with shake
    if (Math.abs(this.camera.fov - this.fov.value) > 0.001) { this.camera.fov = this.fov.value; this.camera.updateProjectionMatrix(); }
  }

  /** Development readout (see Game's ?camdebug overlay). */
  debugInfo() {
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const mode: CameraMode = this.menuOn ? 'MENU' : this.introK > 0 ? 'INTRO' : this.cineLeft > 0 || this.cineK.value > 0.05 ? 'CINEMATIC' : this.lowK.value > 0.05 ? 'ACCENT' : 'COMBAT';
    return {
      mode, pos: this.camera.position.toArray() as [number, number, number],
      yawDeg: Math.atan2(dir.x, -dir.z) / D2R, pitchDeg: Math.asin(clamp(dir.y, -1, 1)) / D2R,
      distance: this.dist.value * (1 + this.zoomK.value) * this.safety.value, fov: this.camera.fov, separation: this.dbg.sep,
      yawTargetDeg: this.dbg.yawTarget / D2R, targetDistance: this.dbg.distTarget, guardScale: this.safety.value,
    };
  }
}
