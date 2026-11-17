/**
 * Central camera configuration. Every number that shapes the battle camera lives here, grouped by purpose,
 * so the feel can be tuned (and measured by scripts/camera-metrics.ts) without touching camera logic.
 *
 *  HYBRID  (default) - elevated 3/4 view, smooth follow with a small dead zone, rotation only when depth movement
 *                      genuinely needs it (with hysteresis + rate limit), distance solved from the real screen fit.
 *  CALM    (legacy)  - the steady side-on camera of the previous version.
 *  DYNAMIC (legacy)  - the busy camera with lead room, hit kicks and depth following.
 */
export type CameraStyle = 'hybrid' | 'calm' | 'dynamic';

export interface CameraTuning {
  // ---- optional-effect strengths (0 = off, 1 = full)
  /** shifts the frame toward whoever is attacking */
  actionLead: number;
  /** how much the camera yaws with fighters' depth (z) separation */
  depthYaw: number;
  /** directional camera impulse on hits */
  kick: number;
  /** random shake on hits (clamped; never excessive) */
  shake: number;
  /** barely-there idle breathing movement */
  sway: number;
  /** FOV widening while fighters move fast */
  speedFov: number;
  /** global multiplier on every smoothing time (>1 = laggier) */
  follow: number;
  /** multiplier on the look-at lag */
  lookLag: number;
  /** 1 = solve distance from the real screen fit + frame guarantee; 0 = old analytic estimate (tests only) */
  frameGuard: number;

  // ---- framing
  /** preferred camera distance (m) at normal fighter separation, before distScale */
  baseDistance: number;
  /** overall zoom-out factor (>1 = further away) */
  distScale: number;
  /** distance multiplier at point-blank (slightly closer in close combat) */
  closeFactor: number;
  /** absolute zoom limits (m) */
  minDistance: number;
  maxDistance: number;
  /** zoom hysteresis (m): distance changes smaller than this are ignored (prevents zoom breathing) */
  zoomHyst: number;
  /** vertical field of view (deg) */
  baseFov: number;
  /** camera elevation angle (deg): 5 = nearly side-on, 11 = slightly elevated 3/4 view */
  pitch: number;
  /** base horizontal yaw (deg) for the 3/4 perspective */
  yaw: number;
  /** height (m) of the point the camera looks at */
  lookHeight: number;

  // ---- smoothing times in seconds (critically damped springs; smaller = snappier)
  followX: number;
  followY: number;
  followZ: number;
  rotSmooth: number;
  /** zoom IN is slow, zoom OUT is fast so fighters are never lost */
  zoomIn: number;
  zoomOut: number;

  // ---- dead zone and depth rotation
  /** horizontal dead zone (m): small midpoint movements are absorbed */
  deadZone: number;
  /** maximum depth-driven yaw change (deg) */
  maxDepthYaw: number;
  /** depth angle must change by this much (deg) before the camera rotates (prevents oscillation) */
  yawHysteresis: number;
  /** maximum camera rotation speed from depth following (deg/s); 0 = unlimited */
  maxYawRate: number;
  /** low-pass time (s) on the depth angle: rapid weaving is averaged out, a sustained sidestep still rotates the view; 0 = off */
  yawFilter: number;

  // ---- feel
  /** multiplier on hit impulses, shake and impact response */
  impact: number;
  /** multiplier on cinematic moves (ultimate / KO / victory), 0..1.5 */
  cinematic: number;
}

/** The busy camera of the earliest version. Kept for comparison/tests and as the "Dynamic" style. */
export const FULL_TUNING: CameraTuning = {
  actionLead: 1, depthYaw: 1, kick: 1, shake: 1, sway: 1, speedFov: 1, follow: 1, lookLag: 1, frameGuard: 1,
  baseDistance: 10.3, distScale: 1.15, closeFactor: 1, minDistance: 7.6, maxDistance: 32, zoomHyst: 0.35, baseFov: 34, pitch: 5.5, yaw: 9.2, lookHeight: 1.1,
  followX: 0.24, followY: 0.3, followZ: 0.28, rotSmooth: 0.55, zoomIn: 0.45, zoomOut: 0.18,
  deadZone: 0.22, maxDepthYaw: 18.3, yawHysteresis: 0, maxYawRate: 0, yawFilter: 0,
  impact: 1, cinematic: 1,
};

/** The steady side-on camera of the previous version (the "Calm" style). */
export const CALM_TUNING: CameraTuning = {
  ...FULL_TUNING,
  actionLead: 0, depthYaw: 0, kick: 0, shake: 0.3, sway: 0, speedFov: 0,
  followX: 0.48, followY: 0.6, followZ: 0.56, rotSmooth: 1.1, zoomIn: 0.9, zoomOut: 0.36, deadZone: 0.55,
};

/**
 * The new default: a controlled hybrid. Elevated 3/4 perspective, responsive-but-calm follow, rotation only for real depth
 * movement, slightly closer framing in close combat, faster zoom-out than zoom-in, subtle directional hit response.
 */
export const HYBRID_TUNING: CameraTuning = {
  actionLead: 0, depthYaw: 1, kick: 0.4, shake: 0.35, sway: 0, speedFov: 0, follow: 1, lookLag: 1, frameGuard: 1,
  baseDistance: 12.4, distScale: 1.15, closeFactor: 0.92, minDistance: 11.4, maxDistance: 32, zoomHyst: 0.4, baseFov: 34, pitch: 11, yaw: 11, lookHeight: 1.12,
  followX: 0.26, followY: 0.36, followZ: 0.34, rotSmooth: 0.85, zoomIn: 0.85, zoomOut: 0.36,
  deadZone: 0.2, maxDepthYaw: 12, yawHysteresis: 5, maxYawRate: 16, yawFilter: 0.42,
  impact: 1, cinematic: 1,
};

export const CAMERA_PRESETS: Record<CameraStyle, CameraTuning> = { hybrid: HYBRID_TUNING, calm: CALM_TUNING, dynamic: FULL_TUNING };

export const normalizeCameraStyle = (v: unknown): CameraStyle => (v === 'calm' || v === 'dynamic' ? v : 'hybrid');

/** Preset for a style with the player's cinematic-intensity (0..1.5) and camera-distance (0.8..1.8 x) sliders applied. */
export function tuningFor(style: CameraStyle, cinematicIntensity = 1, distanceMul = 1): CameraTuning {
  const p = CAMERA_PRESETS[style], m = Math.max(0.8, Math.min(1.8, distanceMul));
  return { ...p, cinematic: Math.max(0, Math.min(1.5, cinematicIntensity)), distScale: p.distScale * m, minDistance: p.minDistance * m };
}
