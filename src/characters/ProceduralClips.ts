import { AnimationController, IDX_ROOTY, makePose, mixPose, type Pose, type PoseDef } from './AnimationController';
import type { CharacterDef, WeaponKind } from './CharacterData';

/**
 * TEMPORARY procedural animation library - one stance + attack set per weapon.
 * Every clip is registered as 'procedural-fallback'; replace by loading GLB
 * AnimationClips under the same names (AnimationController.register).
 *
 * Attacks are authored as two key poses (WIND-UP and STRIKE); the runtime
 * timeline adds anticipation, a snapping acceleration into the strike, an
 * overshoot follow-through and an eased recovery, all timed from the attack's
 * frame data so animation and hitbox always agree.
 *
 * WEAPON_ATTACK is an explicit alias of HEAVY (the weapon strike).
 */
const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

// ------------------------------------------------------------------ guard stances
const GUARDS: Record<WeaponKind, PoseDef> = {
  katana: {
    rootY: -0.05, hips: V(6, 15, 0), torso: V(8, 18, 0), head: V(-6, -30, 0),
    shR: V(-70, 0, -12), elR: V(-55, 0, 0), shL: V(-50, 0, 18), elL: V(-75, 0, 0),
    hpR: V(-22, 0, 4), knR: V(28, 0, 0), hpL: V(14, 0, -4), knL: V(22, 0, 0),
  },
  daggers: { // low, coiled, daggers held in reverse-ready forward grip
    rootY: -0.13, hips: V(12, 20, 0), torso: V(16, 24, 0), head: V(-12, -38, 0),
    shR: V(-62, 0, -22), elR: V(-105, 0, 0), shL: V(-58, 0, 24), elL: V(-100, 0, 0),
    hpR: V(-28, 0, 6), knR: V(46, 0, 0), hpL: V(20, 0, -6), knL: V(40, 0, 0),
  },
  gauntlets: { // wide boxing guard, fists at the chin
    rootY: -0.1, hips: V(8, 10, 0), torso: V(12, 12, 0), head: V(-10, -18, 0),
    shR: V(-38, 0, -14), elR: V(-118, 0, 0), shL: V(-42, 0, 16), elL: V(-122, 0, 0),
    hpR: V(-20, 0, 9), knR: V(38, 0, 0), hpL: V(16, 0, -9), knL: V(34, 0, 0),
  },
  spear: { // long side-on stance, spear leveled at the opponent
    rootY: -0.07, hips: V(6, 28, 0), torso: V(8, 32, 0), head: V(-4, -44, 0),
    shR: V(-62, 0, -16), elR: V(-38, 0, 0), shL: V(-72, 0, 26), elL: V(-58, 0, 0),
    hpR: V(-30, 0, 4), knR: V(26, 0, 0), hpL: V(20, 0, -4), knL: V(22, 0, 0),
  },
};

interface Atk { wind: PoseDef; strike: PoseDef }

// ------------------------------------------------------------------ attack key poses
const SHARED: Record<string, Atk> = {
  KICK: {
    wind: { torso: V(-8, 10, 0), hips: V(-4, 10, 0), hpR: V(-70, 0, 4), knR: V(105, 0, 0), hpL: V(8, 0, -4), knL: V(30, 0, 0), rootY: -0.06 },
    strike: { rootY: -0.02, rootZ: 0.12, torso: V(-24, 15, 0), hips: V(-10, 15, 0), hpR: V(-102, 0, 4), knR: V(6, 0, 0), hpL: V(6, 0, -4), knL: V(14, 0, 0) },
  },
  AIRLIGHT: {
    wind: { rootY: 0.02, torso: V(10, -35, 0), shR: V(-120, 0, -50), elR: V(-50, 0, 0), shL: V(-60, 0, 25), hpR: V(-55, 0, 4), knR: V(75, 0, 0), hpL: V(-25, 0, -4), knL: V(55, 0, 0) },
    strike: { rootY: 0.02, rootZ: 0.1, torso: V(24, 45, 0), hips: V(10, 20, 0), shR: V(-95, 0, 40), elR: V(-8, 0, 0), shL: V(-40, 0, 25), hpR: V(-60, 0, 4), knR: V(70, 0, 0), hpL: V(-30, 0, -4), knL: V(60, 0, 0) },
  },
  LOWKICK: { // crouched low poke
    wind: { rootY: -0.3, torso: V(20, 10, 0), hips: V(10, 10, 0), hpR: V(-30, 0, 4), knR: V(90, 0, 0), hpL: V(30, 0, -4), knL: V(90, 0, 0) },
    strike: { rootY: -0.36, rootZ: 0.15, torso: V(26, 20, 0), hips: V(14, 14, 0), hpR: V(-85, 0, 4), knR: V(10, 0, 0), hpL: V(40, 0, -4), knL: V(95, 0, 0) },
  },
  SWEEP: { // spinning low sweep
    wind: { rootY: -0.3, torso: V(24, -40, 0), hips: V(12, -20, 0), hpR: V(-20, 0, 4), knR: V(100, 0, 0), hpL: V(30, 0, -4), knL: V(95, 0, 0), shR: V(-60, 0, -40), shL: V(-60, 0, 40) },
    strike: { rootY: -0.4, rootZ: 0.2, torso: V(30, 60, 0), hips: V(18, 40, 0), hpR: V(-70, 0, 4), knR: V(5, 0, 0), hpL: V(40, 0, -4), knL: V(100, 0, 0), shR: V(-30, 0, -60), shL: V(-30, 0, 60) },
  },
  LAUNCHER: { // rising uppercut-style strike
    wind: { rootY: -0.22, torso: V(26, -20, 0), hips: V(14, -8, 0), shR: V(20, 0, -20), elR: V(-80, 0, 0), hpR: V(-30, 0, 4), knR: V(70, 0, 0), hpL: V(26, 0, -4), knL: V(70, 0, 0) },
    strike: { rootY: 0.02, rootZ: 0.2, torso: V(-12, 20, 0), hips: V(-4, 12, 0), shR: V(-170, 0, -10), elR: V(-6, 0, 0), shL: V(-40, 0, 20), hpR: V(-20, 0, 4), knR: V(20, 0, 0), hpL: V(10, 0, -4), knL: V(20, 0, 0) },
  },
  AIRHEAVY: { // diving overhead
    wind: { rootY: 0.04, torso: V(-10, 0, 0), shR: V(-138, 0, -10), elR: V(-40, 0, 0), shL: V(-134, 0, 10), elL: V(-40, 0, 0), hpR: V(-40, 0, 4), knR: V(60, 0, 0), hpL: V(-22, 0, -4), knL: V(46, 0, 0) },
    strike: { rootY: 0.02, rootZ: 0.12, torso: V(50, 0, 0), hips: V(20, 0, 0), shR: V(-50, 0, -6), elR: V(-4, 0, 0), shL: V(-50, 0, 6), elL: V(-4, 0, 0), hpR: V(-70, 0, 4), knR: V(50, 0, 0), hpL: V(-30, 0, -4), knL: V(40, 0, 0) },
  },
  AIRKICK: { // flying kick
    wind: { rootY: 0.03, torso: V(-4, 0, 0), hpR: V(-40, 0, 4), knR: V(56, 0, 0), hpL: V(-24, 0, -4), knL: V(40, 0, 0), shR: V(-66, 0, -16), shL: V(-66, 0, 16) },
    strike: { rootY: 0.03, rootZ: 0.14, torso: V(-18, 0, 0), hpR: V(-92, 0, 4), knR: V(10, 0, 0), hpL: V(-20, 0, -4), knL: V(46, 0, 0), shR: V(-60, 0, -26), shL: V(-60, 0, 26) },
  },
  GRAB: { // both hands reach for the opponent
    wind: { rootY: -0.1, torso: V(10, 0, 0), shR: V(-70, 0, -20), elR: V(-60, 0, 0), shL: V(-70, 0, 20), elL: V(-60, 0, 0) },
    strike: { rootY: -0.12, rootZ: 0.22, torso: V(24, 0, 0), hips: V(10, 0, 0), shR: V(-100, 0, -14), elR: V(-6, 0, 0), shL: V(-100, 0, 14), elL: V(-6, 0, 0), hpR: V(-40, 0, 4), knR: V(40, 0, 0), hpL: V(26, 0, -4) },
  },
  AXEKICK: { // forward + kick: leg raised high, then chopped down
    wind: { rootY: -0.02, torso: V(-12, 8, 0), hips: V(-6, 6, 0), hpR: V(-118, 0, 4), knR: V(34, 0, 0), hpL: V(8, 0, -4), knL: V(24, 0, 0), shR: V(-70, 0, -24), shL: V(-70, 0, 24) },
    strike: { rootY: -0.1, rootZ: 0.12, torso: V(24, 8, 0), hips: V(12, 6, 0), hpR: V(-42, 0, 4), knR: V(8, 0, 0), hpL: V(20, 0, -4), knL: V(34, 0, 0), shR: V(-60, 0, -30), shL: V(-60, 0, 30) },
  },
  BACKKICK: { // back + kick: bend forward and drive the leg out behind
    wind: { rootY: -0.1, torso: V(14, 10, 0), hips: V(8, 6, 0), hpR: V(14, 0, 4), knR: V(54, 0, 0), hpL: V(14, 0, -4), knL: V(36, 0, 0), shR: V(-80, 0, -20), shL: V(-80, 0, 20) },
    strike: { rootY: -0.12, rootZ: -0.08, torso: V(48, 10, 0), hips: V(22, 6, 0), hpR: V(58, 0, 4), knR: V(8, 0, 0), hpL: V(16, 0, -4), knL: V(40, 0, 0), shR: V(-60, 0, -30), shL: V(-60, 0, 30) },
  },
  SPINSLASH: { // sideways + heavy: a full body twist with the weapon out wide
    wind: { rootY: -0.1, torso: V(10, -85, 0), hips: V(6, -40, 0), shR: V(-70, 0, -70), elR: V(-20, 0, 0), shL: V(-70, 0, 70), elL: V(-20, 0, 0), hpR: V(-26, 0, 8), knR: V(40, 0, 0), hpL: V(20, 0, -8), knL: V(40, 0, 0) },
    strike: { rootY: -0.12, rootZ: 0.12, torso: V(14, 88, 0), hips: V(8, 46, 0), shR: V(-80, 0, 40), elR: V(-6, 0, 0), shL: V(-80, 0, -40), elL: V(-6, 0, 0), hpR: V(-40, 0, 8), knR: V(40, 0, 0), hpL: V(30, 0, -8), knL: V(30, 0, 0) },
  },
  SPINKICK: { // sideways + kick: spinning heel kick
    wind: { rootY: -0.06, torso: V(10, -60, 0), hips: V(6, -30, 0), hpR: V(-20, 0, 4), knR: V(60, 0, 0), hpL: V(12, 0, -4), knL: V(34, 0, 0), shR: V(-70, 0, -30), shL: V(-70, 0, 30) },
    strike: { rootY: -0.04, rootZ: 0.1, torso: V(-10, 72, 0), hips: V(-6, 38, 0), hpR: V(-92, 0, 4), knR: V(8, 0, 0), hpL: V(8, 0, -4), knL: V(24, 0, 0), shR: V(-60, 0, -50), shL: V(-60, 0, 50) },
  },
  DIVEKICK: { // forward + kick in the air: tuck, then both legs drive down and forward
    wind: { rootY: 0.03, torso: V(-4, 0, 0), hpR: V(-40, 0, 4), knR: V(56, 0, 0), hpL: V(-24, 0, -4), knL: V(40, 0, 0), shR: V(-66, 0, -16), shL: V(-66, 0, 16) },
    strike: { rootY: 0.02, rootZ: 0.1, torso: V(24, 0, 0), hpR: V(-82, 0, 4), knR: V(14, 0, 0), hpL: V(-58, 0, -4), knL: V(22, 0, 0), shR: V(-42, 0, -30), shL: V(-42, 0, 30) },
  },
  AIRSPIN: { // sideways + heavy in the air: spinning slash
    wind: { rootY: 0.04, torso: V(-6, -60, 0), hips: V(-2, -28, 0), shR: V(-100, 0, -60), elR: V(-20, 0, 0), shL: V(-100, 0, 60), elL: V(-20, 0, 0), hpR: V(-40, 0, 4), knR: V(60, 0, 0), hpL: V(-22, 0, -4), knL: V(46, 0, 0) },
    strike: { rootY: 0.02, rootZ: 0.08, torso: V(10, 72, 0), hips: V(4, 34, 0), shR: V(-90, 0, 50), elR: V(-6, 0, 0), shL: V(-90, 0, -50), elL: V(-6, 0, 0), hpR: V(-50, 0, 4), knR: V(50, 0, 0), hpL: V(-28, 0, -4), knL: V(40, 0, 0) },
  },
  FLIPKICK: { // rising flip kick (launcher finisher)
    wind: { rootY: -0.2, torso: V(30, 10, 0), hips: V(14, 6, 0), hpR: V(-40, 0, 4), knR: V(80, 0, 0), hpL: V(30, 0, -4), knL: V(80, 0, 0), shR: V(-60, 0, -24), shL: V(-60, 0, 24) },
    strike: { rootY: 0.05, rootZ: 0.1, torso: V(-30, 10, 0), hips: V(-14, 6, 0), hpR: V(-112, 0, 4), knR: V(10, 0, 0), hpL: V(-28, 0, -4), knL: V(40, 0, 0), shR: V(-60, 0, -34), shL: V(-60, 0, 34) },
  },
  KNEE: { // knee strike
    wind: { rootY: -0.1, torso: V(14, 0, 0), hpR: V(-30, 0, 4), knR: V(70, 0, 0), hpL: V(14, 0, -4), knL: V(34, 0, 0), shR: V(-70, 0, -20), shL: V(-70, 0, 20) },
    strike: { rootY: -0.04, rootZ: 0.14, torso: V(20, 0, 0), hips: V(10, 0, 0), hpR: V(-95, 0, 4), knR: V(96, 0, 0), hpL: V(10, 0, -4), knL: V(24, 0, 0), shR: V(-92, 0, -10), shL: V(-92, 0, 10) },
  },
};

const ATTACKS: Record<WeaponKind, Record<string, Atk>> = {  katana: {
    LIGHT1: {
      wind: { torso: V(8, -38, 0), hips: V(6, -12, 0), shR: V(-85, 0, -62), elR: V(-60, 0, 0), shL: V(-40, 0, 25) },
      strike: { rootZ: 0.14, torso: V(14, 48, 0), hips: V(6, 38, 0), shR: V(-95, 0, 38), elR: V(-15, 0, 0), shL: V(-30, 0, 20), hpR: V(-36, 0, 4), knR: V(36, 0, 0), hpL: V(20, 0, -4), knL: V(15, 0, 0) },
    },
    LIGHT2: {
      wind: { torso: V(10, 52, 0), hips: V(6, 32, 0), shR: V(-95, 0, 42), elR: V(-40, 0, 0) },
      strike: { rootZ: 0.14, torso: V(16, -42, 0), hips: V(6, -18, 0), shR: V(-100, 0, -68), elR: V(-12, 0, 0), hpR: V(-40, 0, 4), knR: V(40, 0, 0), hpL: V(22, 0, -4) },
    },
    HEAVY: {
      wind: { rootY: -0.08, torso: V(-14, 10, 0), hips: V(-8, 0, 0), shR: V(-178, 0, -8), elR: V(-30, 0, 0), shL: V(-165, 0, 15), elL: V(-40, 0, 0), hpR: V(-12, 0, 4), knR: V(20, 0, 0), hpL: V(22, 0, -4), knL: V(32, 0, 0) },
      strike: { rootY: -0.2, rootZ: 0.3, torso: V(40, 0, 0), hips: V(22, 0, 0), shR: V(-52, 0, -5), elR: V(-4, 0, 0), shL: V(-48, 0, 10), elL: V(-8, 0, 0), hpR: V(-58, 0, 4), knR: V(58, 0, 0), hpL: V(32, 0, -4), knL: V(10, 0, 0) },
    },
    SPECIAL: {
      wind: { rootY: -0.22, torso: V(16, -66, 0), hips: V(16, -38, 0), shR: V(-62, 0, -80), elR: V(-20, 0, 0), shL: V(-30, 0, 30), hpR: V(-36, 0, 4), knR: V(58, 0, 0), hpL: V(32, 0, -4), knL: V(46, 0, 0) },
      strike: { rootY: -0.28, rootZ: 0.45, torso: V(44, 76, 0), hips: V(24, 48, 0), shR: V(-96, 0, 58), elR: V(-5, 0, 0), shL: V(-20, 0, 40), hpR: V(-74, 0, 4), knR: V(52, 0, 0), hpL: V(36, 0, -4), knL: V(15, 0, 0) },
    },
    ULTIMATE: {
      wind: { rootY: -0.24, torso: V(-14, 0, 0), hips: V(-4, 0, 0), shR: V(-182, 0, -15), elR: V(-20, 0, 0), shL: V(-176, 0, 15), elL: V(-30, 0, 0), head: V(-16, -20, 0), hpR: V(-30, 0, 8), knR: V(50, 0, 0), hpL: V(30, 0, -8), knL: V(50, 0, 0) },
      strike: { rootY: -0.34, rootZ: 0.55, torso: V(54, 0, 0), hips: V(30, 0, 0), shR: V(-40, 0, -5), elR: V(-3, 0, 0), shL: V(-35, 0, 10), elL: V(-5, 0, 0), hpR: V(-78, 0, 4), knR: V(62, 0, 0), hpL: V(40, 0, -4), knL: V(8, 0, 0) },
    },
  },

  daggers: {
    LIGHT1: { // right dagger cross-slash
      wind: { torso: V(14, -32, 0), hips: V(10, -10, 0), shR: V(-70, 0, -58), elR: V(-62, 0, 0) },
      strike: { rootZ: 0.2, torso: V(20, 44, 0), hips: V(10, 28, 0), shR: V(-92, 0, 28), elR: V(-8, 0, 0), hpR: V(-40, 0, 6), knR: V(46, 0, 0), hpL: V(24, 0, -6) },
    },
    LIGHT2: { // left dagger reverse slash
      wind: { torso: V(14, 48, 0), hips: V(10, 28, 0), shL: V(-70, 0, 74), elL: V(-62, 0, 0) },
      strike: { rootZ: 0.2, torso: V(20, -46, 0), hips: V(10, -20, 0), shL: V(-92, 0, -34), elL: V(-8, 0, 0), hpR: V(-30, 0, 6), hpL: V(30, 0, -6), knL: V(30, 0, 0) },
    },
    HEAVY: { // spinning double slash
      wind: { rootY: -0.2, torso: V(10, -95, 0), hips: V(6, -48, 0), shR: V(-78, 0, -85), elR: V(-30, 0, 0), shL: V(-78, 0, 85), elL: V(-30, 0, 0), hpR: V(-30, 0, 6), knR: V(60, 0, 0), hpL: V(24, 0, -6), knL: V(60, 0, 0) },
      strike: { rootY: -0.2, rootZ: 0.32, torso: V(22, 78, 0), hips: V(10, 44, 0), shR: V(-98, 0, 24), elR: V(-6, 0, 0), shL: V(-98, 0, -24), elL: V(-6, 0, 0), hpR: V(-50, 0, 6), knR: V(50, 0, 0), hpL: V(30, 0, -6), knL: V(24, 0, 0) },
    },
    SPECIAL: { // Phantom Dash: coil, then a long low lunge
      wind: { rootY: -0.34, rootZ: -0.12, torso: V(34, -28, 0), hips: V(20, -10, 0), shR: V(24, 0, -22), elR: V(-70, 0, 0), shL: V(24, 0, 22), elL: V(-70, 0, 0), hpR: V(-20, 0, 6), knR: V(80, 0, 0), hpL: V(30, 0, -6), knL: V(80, 0, 0), head: V(-30, -10, 0) },
      strike: { rootY: -0.38, rootZ: 0.5, torso: V(44, 18, 0), hips: V(24, 10, 0), shR: V(-110, 0, -8), elR: V(-4, 0, 0), shL: V(-62, 0, 20), elL: V(-40, 0, 0), hpR: V(-82, 0, 4), knR: V(26, 0, 0), hpL: V(42, 0, -4), knL: V(8, 0, 0), head: V(-40, 0, 0) },
    },
    ULTIMATE: { // Shadow Barrage: cross overhead, burst into a spread flurry
      wind: { rootY: -0.22, torso: V(-10, 0, 0), shR: V(-172, 0, -26), elR: V(-26, 0, 0), shL: V(-172, 0, 26), elL: V(-26, 0, 0), hpR: V(-26, 0, 8), knR: V(60, 0, 0), hpL: V(26, 0, -8), knL: V(60, 0, 0) },
      strike: { rootY: -0.3, rootZ: 0.45, torso: V(34, 0, 0), hips: V(18, 0, 0), shR: V(-72, 0, -64), elR: V(-8, 0, 0), shL: V(-72, 0, 64), elL: V(-8, 0, 0), hpR: V(-60, 0, 8), knR: V(52, 0, 0), hpL: V(36, 0, -8), knL: V(20, 0, 0) },
    },
  },

  gauntlets: {
    LIGHT1: { // jab
      wind: { torso: V(10, -28, 0), hips: V(6, -10, 0), shR: V(-32, 0, -16), elR: V(-135, 0, 0) },
      strike: { rootZ: 0.18, torso: V(14, 38, 0), hips: V(8, 24, 0), shR: V(-92, 0, -4), elR: V(-4, 0, 0), hpR: V(-34, 0, 9), knR: V(40, 0, 0), hpL: V(22, 0, -9) },
    },
    LIGHT2: { // cross
      wind: { torso: V(10, 30, 0), hips: V(6, 16, 0), shL: V(-34, 0, 18), elL: V(-135, 0, 0) },
      strike: { rootZ: 0.2, torso: V(16, -40, 0), hips: V(8, -22, 0), shL: V(-92, 0, 4), elL: V(-4, 0, 0), hpR: V(-30, 0, 9), hpL: V(26, 0, -9), knL: V(40, 0, 0) },
    },
    HEAVY: { // overhead double-fist slam
      wind: { rootY: -0.06, torso: V(-22, 0, 0), hips: V(-10, 0, 0), shR: V(-172, 0, -10), elR: V(-35, 0, 0), shL: V(-172, 0, 10), elL: V(-35, 0, 0), hpR: V(-14, 0, 9), knR: V(24, 0, 0), hpL: V(16, 0, -9), knL: V(30, 0, 0) },
      strike: { rootY: -0.26, rootZ: 0.28, torso: V(52, 0, 0), hips: V(26, 0, 0), shR: V(-48, 0, -6), elR: V(-4, 0, 0), shL: V(-48, 0, 6), elL: V(-4, 0, 0), hpR: V(-62, 0, 9), knR: V(64, 0, 0), hpL: V(34, 0, -9), knL: V(18, 0, 0) },
    },
    SPECIAL: { // Ground Breaker: deep crouch, ground punch
      wind: { rootY: -0.3, torso: V(20, -62, 0), hips: V(14, -30, 0), shR: V(34, 0, -12), elR: V(-24, 0, 0), shL: V(-60, 0, 30), elL: V(-90, 0, 0), hpR: V(-40, 0, 9), knR: V(80, 0, 0), hpL: V(30, 0, -9), knL: V(80, 0, 0) },
      strike: { rootY: -0.42, rootZ: 0.34, torso: V(46, 32, 0), hips: V(24, 18, 0), shR: V(-28, 0, -6), elR: V(-4, 0, 0), shL: V(-70, 0, 20), elL: V(-70, 0, 0), hpR: V(-84, 0, 9), knR: V(98, 0, 0), hpL: V(40, 0, -9), knL: V(96, 0, 0), head: V(-30, 0, 0) },
    },
    ULTIMATE: { // Titan Wrath: arms flung wide, then both fists crash together
      wind: { rootY: -0.1, torso: V(-28, 0, 0), hips: V(-10, 0, 0), shR: V(-24, 0, -92), elR: V(-12, 0, 0), shL: V(-24, 0, 92), elL: V(-12, 0, 0), head: V(-20, 0, 0), hpR: V(-18, 0, 12), knR: V(30, 0, 0), hpL: V(18, 0, -12), knL: V(30, 0, 0) },
      strike: { rootY: -0.38, rootZ: 0.4, torso: V(58, 0, 0), hips: V(30, 0, 0), shR: V(-82, 0, 16), elR: V(-20, 0, 0), shL: V(-82, 0, -16), elL: V(-20, 0, 0), hpR: V(-70, 0, 9), knR: V(70, 0, 0), hpL: V(38, 0, -9), knL: V(30, 0, 0) },
    },
  },

  spear: {
    LIGHT1: { // quick thrust
      wind: { torso: V(8, -30, 0), hips: V(4, -8, 0), shR: V(-42, 0, -28), elR: V(-105, 0, 0) },
      strike: { rootZ: 0.28, torso: V(12, 24, 0), hips: V(6, 16, 0), shR: V(-86, 0, -4), elR: V(-3, 0, 0), shL: V(-82, 0, 12), elL: V(-26, 0, 0), hpR: V(-48, 0, 4), knR: V(40, 0, 0), hpL: V(26, 0, -4) },
    },
    LIGHT2: { // horizontal sweep
      wind: { torso: V(8, -32, 0), hips: V(4, -10, 0), shR: V(-96, 0, -48), elR: V(-30, 0, 0), shL: V(-80, 0, 34) },
      strike: { rootZ: 0.2, torso: V(12, 50, 0), hips: V(6, 32, 0), shR: V(-92, 0, 50), elR: V(-6, 0, 0), shL: V(-82, 0, 26), hpR: V(-40, 0, 4), knR: V(36, 0, 0), hpL: V(22, 0, -4) },
    },
    HEAVY: { // overhead smash
      wind: { rootY: -0.08, torso: V(-16, 12, 0), shR: V(-168, 0, -18), elR: V(-26, 0, 0), shL: V(-150, 0, 22), elL: V(-40, 0, 0), hpR: V(-14, 0, 4), knR: V(22, 0, 0), hpL: V(20, 0, -4), knL: V(32, 0, 0) },
      strike: { rootY: -0.22, rootZ: 0.34, torso: V(42, 0, 0), hips: V(22, 0, 0), shR: V(-46, 0, 0), elR: V(-4, 0, 0), shL: V(-42, 0, 12), elL: V(-12, 0, 0), hpR: V(-60, 0, 4), knR: V(60, 0, 0), hpL: V(34, 0, -4), knL: V(12, 0, 0) },
    },
    SPECIAL: { // Piercing Wind: coil, then a long lunging thrust
      wind: { rootY: -0.24, rootZ: -0.1, torso: V(20, -44, 0), hips: V(12, -16, 0), shR: V(-30, 0, -22), elR: V(-104, 0, 0), shL: V(-60, 0, 30), elL: V(-70, 0, 0), hpR: V(-30, 0, 4), knR: V(60, 0, 0), hpL: V(30, 0, -4), knL: V(60, 0, 0) },
      strike: { rootY: -0.32, rootZ: 0.55, torso: V(42, 12, 0), hips: V(22, 8, 0), shR: V(-86, 0, 0), elR: V(0, 0, 0), shL: V(-84, 0, 10), elL: V(-14, 0, 0), hpR: V(-74, 0, 4), knR: V(22, 0, 0), hpL: V(44, 0, -4), knL: V(6, 0, 0) },
    },
    ULTIMATE: { // Dragon Tempest: spear raised and spun, then a huge low sweep
      wind: { rootY: -0.14, torso: V(-10, -30, 0), shR: V(-172, 0, -62), elR: V(-20, 0, 0), shL: V(-150, 0, 40), elL: V(-30, 0, 0), hpR: V(-22, 0, 4), knR: V(36, 0, 0), hpL: V(22, 0, -4), knL: V(36, 0, 0) },
      strike: { rootY: -0.34, rootZ: 0.45, torso: V(46, -74, 0), hips: V(24, -34, 0), shR: V(-32, 0, 72), elR: V(-4, 0, 0), shL: V(-44, 0, 40), elL: V(-12, 0, 0), hpR: V(-64, 0, 4), knR: V(66, 0, 0), hpL: V(38, 0, -4), knL: V(16, 0, 0) },
    },
  },
};

const ease = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const easeOut = (t: number) => { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); };
const easeInQuad = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t; };

export function registerClips(ctrl: AnimationController, def: CharacterDef): void {
  const kind = def.weapon;
  const G = makePose(GUARDS[kind]);
  const P = (d: PoseDef): Pose => makePose(d, G);
  const out = new Float32Array(G.length);
  const tmp = new Float32Array(G.length);

  // ---- locomotion
  // per-character idle personality: Shinobi bounces on his toes, Titan breathes slow and heavy, Akira sways with the spear.
  const persona = { ronin: { f: 2.6, a: 1, s: 1 }, shinobi: { f: 3.8, a: 2.2, s: 1.6 }, titan: { f: 1.7, a: 1.8, s: 0.6 }, akira: { f: 2.2, a: 1.2, s: 2.2 } }[def.id] ?? { f: 2.6, a: 1, s: 1 };
  const breathe = (time: number) => { // weight shift + breathing on top of the stance
    const b = Math.sin(time * persona.f) * persona.a, sway = Math.sin(time * 1.3) * persona.s;
    tmp.set(G);
    tmp[0] += b * 0.02;           // hips pitch
    tmp[3] += b * 0.018;          // torso pitch
    tmp[1 * 3 + 1] += sway * 0.05; // torso yaw drift
    tmp[3 * 3 + 2] += b * 0.02;    // left shoulder
    tmp[IDX_ROOTY] += -b * 0.012 - Math.abs(sway) * 0.006;
    return tmp;
  };
  ctrl.register('IDLE', ({ time }) => breathe(time), 0.15);

  const walk = (dir: number) => ({ time }: { time: number }) => {
    const ph = time * 9 * dir, s = Math.sin(ph);
    const lift = Math.max(0, Math.sin(ph)), lift2 = Math.max(0, -Math.sin(ph));
    return P({
      rootY: GUARDS[kind].rootY! + Math.abs(Math.cos(ph)) * 0.025,
      rootZ: Math.sin(ph) * 0.02,
      hpR: V(-22 - 28 * s, 0, 4), knR: V(28 + 44 * lift2, 0, 0),
      hpL: V(14 + 28 * s, 0, -4), knL: V(22 + 44 * lift, 0, 0),
      torso: V(8 + Math.abs(Math.cos(ph)) * 2, GUARDS[kind].torso![1] + s * 4, 0),
    });
  };
  ctrl.register('WALK', walk(1), 0.1);
  ctrl.register('BACKWARD', walk(-1), 0.1);

  ctrl.register('RUN', ({ time }) => {
    const ph = time * 13, s = Math.sin(ph), lift = Math.max(0, s), lift2 = Math.max(0, -s);
    return P({
      rootY: GUARDS[kind].rootY! - 0.04 + Math.abs(Math.cos(ph)) * 0.05, rootZ: 0.06,
      torso: V(24, 10 + s * 8, 0), hips: V(14, 0, 0), head: V(-16, -10, 0),
      hpR: V(-30 - 52 * s, 0, 4), knR: V(40 + 70 * lift2, 0, 0), hpL: V(18 + 52 * s, 0, -4), knL: V(30 + 70 * lift, 0, 0),
      shR: V(-60 + s * 38, 0, -14), elR: V(-95, 0, 0), shL: V(-60 - s * 38, 0, 14), elL: V(-95, 0, 0),
    });
  }, 0.1);
  ctrl.register('FALL', ({ time }) => P({
    rootY: 0.04, torso: V(4, GUARDS[kind].torso![1], 0), head: V(-10, -20, 0), hips: V(0, 10, 0),
    shR: V(-112, 0, -46 + Math.sin(time * 10) * 4), shL: V(-112, 0, 46 - Math.sin(time * 10) * 4), elR: V(-30, 0, 0), elL: V(-30, 0, 0),
    hpR: V(-30, 0, 8), knR: V(40, 0, 0), hpL: V(-8, 0, -8), knL: V(26, 0, 0),
  }), 0.08);
  ctrl.register('LAND', ({ frame }) => {
    const k = Math.max(0, 1 - frame / 7);
    return P({ rootY: -0.1 - 0.28 * k, torso: V(14 + 20 * k, GUARDS[kind].torso![1], 0), hips: V(12, 10, 0), hpR: V(-30 - 30 * k, 0, 8), knR: V(40 + 55 * k, 0, 0), hpL: V(14 + 20 * k, 0, -8), knL: V(34 + 55 * k, 0, 0) });
  }, 0.03);
  const dodge = (side: number) => ({ frame }: { frame: number }) => {
    const k = ease(Math.min(1, frame / 6));
    return P({
      rootY: -0.24, rootZ: -0.06 * k, torso: V(side > 0 ? 34 * k : 8, 18 + side * 22 * k, side * -10 * k), hips: V(22, 15 + side * 26 * k, 0), head: V(-22, -20, 0),
      shR: V(-50, 0, -22), shL: V(-40, 0, 22), elR: V(-95, 0, 0), elL: V(-95, 0, 0),
      hpR: V(-46, 0, 14 + side * 6), knR: V(58, 0, 0), hpL: V(36, 0, -14 - side * 6), knL: V(58, 0, 0),
    });
  };
  ctrl.register('DODGE_RIGHT', dodge(1), 0.05);
  ctrl.register('DODGE_LEFT', dodge(-1), 0.05);
  ctrl.register('HIT_BACK', ({ frame }) => {
    const rec = Math.exp(-frame / 7);
    return mixPose(G, P({ rootY: -0.12, rootZ: 0.12 * rec, torso: V(34, -8, 0), hips: V(14, -6, 0), head: V(24, 10, 0), shR: V(30, 0, -30), elR: V(-20, 0, 0), shL: V(36, 0, 34), hpR: V(-18, 0, 4), knR: V(30, 0, 0), hpL: V(8, 0, -4) }), 0.55 + 0.45 * rec, out);
  }, 0.03);
  ctrl.register('STAGGER', ({ frame }) => {
    const wob = Math.sin(frame * 0.55) * Math.exp(-frame / 14);
    return P({
      rootY: -0.1, rootZ: -0.12 + wob * 0.04, torso: V(-22 + wob * 8, 14 + wob * 12, wob * 6), hips: V(-8, 8, 0), head: V(-18, -16, 0),
      shR: V(-96, 0, -34 + wob * 10), elR: V(-70, 0, 0), shL: V(-86, 0, 34 - wob * 10), elL: V(-70, 0, 0),
      hpR: V(18, 0, 4), knR: V(30, 0, 0), hpL: V(-22, 0, -4), knL: V(46, 0, 0),
    });
  }, 0.05);

  ctrl.register('JUMP', ({ frame }) => P({
    rootY: 0.02 + Math.min(1, frame / 6) * 0.02, hpR: V(-58, 0, 4), knR: V(80, 0, 0), hpL: V(-24, 0, -4), knL: V(58, 0, 0),
    shR: V(-96, 0, -20), shL: V(-92, 0, 25), torso: V(10, GUARDS[kind].torso![1], 0),
  }), 0.08);

  ctrl.register('CROUCH', ({ time }) => P({ // low guard: knees deeply bent, hands up, head tucked
    rootY: -0.4 + Math.sin(time * 2.4) * 0.008, torso: V(26, 18, 0), hips: V(20, 14, 0), head: V(-18, -20, 0),
    shR: V(-100, 0, -24), elR: V(-112, 0, 0), shL: V(-100, 0, 24), elL: V(-112, 0, 0),
    hpR: V(-62, 0, 8), knR: V(112, 0, 0), hpL: V(-38, 0, -8), knL: V(104, 0, 0),
  }), 0.08);

  ctrl.register('BLOCK', ({ frame }) => {
    const rec = Math.exp(-frame / 5); // recoil right after impact
    return P({
      rootY: -0.13, rootZ: -0.12 * rec, torso: V(14 + 8 * rec, 18, 0), head: V(-12, -20, 0),
      shR: V(-108, 0, -28), elR: V(-108, 0, 0), shL: V(-108, 0, 28), elL: V(-108, 0, 0),
      hpR: V(-30, 0, 6), knR: V(46, 0, 0), hpL: V(18, 0, -6), knL: V(40, 0, 0),
    });
  }, 0.06);

  ctrl.register('DODGE', ({ frame }) => {
    const k = Math.min(1, frame / 6);
    return P({
      rootY: -0.22, rootZ: -0.05 * k, torso: V(30 * ease(k), 18, 0), hips: V(22, 15, 0), head: V(-20, -20, 0),
      shR: V(-50, 0, -20), shL: V(-40, 0, 20), elR: V(-95, 0, 0), elL: V(-95, 0, 0),
      hpR: V(-46, 0, 14), knR: V(58, 0, 0), hpL: V(36, 0, -14), knL: V(58, 0, 0),
    });
  }, 0.05);

  // ---- reactions (recoil decays over the first frames, then relaxes toward a stagger)
  const hit = (flip: number, heavy: boolean) => ({ frame }: { frame: number }) => {
    const rec = Math.exp(-frame / (heavy ? 9 : 6));
    const k = 0.55 + 0.45 * rec;
    const amp = heavy ? 1.5 : 1;
    return mixPose(G, P({
      rootY: -0.1 - 0.04 * amp, rootZ: -0.14 * amp * rec,
      torso: V(-26 * amp, 10 * flip * amp, 6 * flip), hips: V(-12 * amp, 10 * flip, 0), head: V(-30 * amp, -12 * flip, 0),
      shR: V(-30, 0, -45), elR: V(-30, 0, 0), shL: V(-18, 0, 45), hpR: V(-12, 0, 4), knR: V(34, 0, 0), hpL: V(10, 0, -4),
    }), k * Math.min(1, amp), out);
  };
  ctrl.register('HIT_FRONT', hit(1, false), 0.03);
  ctrl.register('HIT_FRONT_B', hit(-1, false), 0.03);
  ctrl.register('HIT_HEAVY', hit(1, true), 0.03);

  const LYING = makePose({ tilt: -90, rootY: 0.14, hips: V(0, 0, 0), torso: V(0, 0, 0), head: V(-10, 0, 0), shR: V(-10, 0, -50), elR: V(-10, 0, 0), shL: V(-10, 0, 50), elL: V(-10, 0, 0), hpR: V(0, 0, 6), knR: V(5, 0, 0), hpL: V(0, 0, -6), knL: V(5, 0, 0) });
  ctrl.register('LAUNCH', ({ time }) => makePose({ tilt: -50 - Math.min(40, time * 70), rootY: 0.2, hips: V(-24, 0, 0), torso: V(-18, 0, 0), head: V(-28, 0, 0), shR: V(-125, 0, -62), elR: V(-30, 0, 0), shL: V(-105, 0, 62), elL: V(-30, 0, 0), hpR: V(-34, 0, 4), knR: V(44, 0, 0), hpL: V(12, 0, -4), knL: V(44, 0, 0) }), 0.04);
  ctrl.register('KNOCKDOWN', ({ frame }) => mixPose(LYING, makePose({ ...{ tilt: -82 }, rootY: 0.2 }, LYING), Math.exp(-frame / 4) * 0.6, out), 0.06);
  ctrl.register('DEFEAT', () => LYING, 0.08);
  ctrl.register('GETUP', ({ frame }) => {
    const t = frame / 28;
    const crouch = P({ rootY: -0.25, torso: V(30, 10, 0), hips: V(20, 0, 0), hpR: V(-60, 0, 6), knR: V(100, 0, 0), hpL: V(30, 0, -6), knL: V(100, 0, 0), shR: V(-40, 0, -30), shL: V(-40, 0, 30), elR: V(-60, 0, 0), elL: V(-60, 0, 0) });
    return t < 0.55 ? mixPose(LYING, crouch, ease(t / 0.55), out) : mixPose(crouch, G, ease((t - 0.55) / 0.45), out);
  }, 0.05);
  ctrl.register('VICTORY', ({ time }) => P({
    rootY: -0.02 + Math.sin(time * 3) * 0.01, torso: V(-8, 0, 0), head: V(-12, 0, 0),
    shR: V(-172, 0, -14), elR: V(-22, 0, 0), shL: V(-24, 0, 26), elL: V(-24, 0, 0),
    hpR: V(-6, 0, 6), knR: V(8, 0, 0), hpL: V(6, 0, -6), knL: V(8, 0, 0), hips: V(0, 0, 0),
  }), 0.2);

  // ---- attacks: timeline built from frame data
  for (const a of Object.values(def.stats.attacks)) {
    if (ctrl.has(a.clip)) continue;
    const key = a.poseSet ?? a.clip; // a move may reuse another move's key poses but keeps its own timing
    const pair = ATTACKS[kind][key] ?? SHARED[key];
    if (!pair) { console.warn(`[Animation] no key poses for ${kind}/${key}`); continue; }
    const wind = P(pair.wind), strike = P(pair.strike);
    const antic = mixPose(G, wind, -0.16);          // small counter-move before the wind-up
    const over = mixPose(wind, strike, 1.14);        // overshoot for follow-through
    const su = a.startup, ac = a.active, re = a.recovery;
    // wind-up completes early; the strike pose peaks late in the active window so the blade sweeps through the hit
    const tA = su * 0.28, tW = su * 0.55, tS = su + ac * 0.7, tE = su + ac;
    ctrl.register(a.clip, ({ frame }) => {
      if (frame <= tA) return mixPose(G, antic, ease(frame / Math.max(1, tA)), out);
      if (frame <= tW) return mixPose(antic, wind, ease((frame - tA) / Math.max(1, tW - tA)), out);
      if (frame <= tS) return mixPose(wind, strike, easeInQuad((frame - tW) / Math.max(1, tS - tW)), out);
      if (frame <= tE) return mixPose(strike, over, easeOut((frame - tS) / Math.max(1, tE - tS)), out);
      return mixPose(over, G, ease((frame - tE) / Math.max(1, re * 0.92)), out);
    }, 0.035);
  }
  ctrl.alias('WEAPON_ATTACK', 'HEAVY');
}
