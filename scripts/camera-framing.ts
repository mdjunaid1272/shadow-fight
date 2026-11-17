import { CALM_TUNING } from '../src/camera/FightingCamera';
import { run } from './cameraSim';
const OLD = { ...CALM_TUNING, distScale: 1.0, frameGuard: 0 };   // the camera you just had
const NEW = { ...CALM_TUNING };                                    // wider + frame guarantee
const row = (n: string, m: ReturnType<typeof run>) => console.log(`${n.padEnd(34)} safe-area ${(m.safe * 100).toFixed(1).padStart(5)}%   in-screen ${(m.framed * 100).toFixed(1).padStart(5)}%   guard ${(m.guardActive * 100).toFixed(0).padStart(3)}%@${m.guardMean.toFixed(2)}   speed95 ${m.speedP95.toFixed(2)}   jerk95 ${m.jerkP95.toFixed(0).padStart(4)}   reversals ${m.xRevPerMin.toFixed(1).padStart(5)}/min`);
for (const [label, asp, inset] of [['desktop 16:9', 16 / 9, 0], ['phone 19.5:9 + touch inset', 19.5 / 9, 0.14], ['4:3', 4 / 3, 0]] as const) {
  for (const human of [true, false]) {
    row(`OLD  ${label} ${human ? '(human player)' : '(AI)'}`, run(OLD, 140, asp, { insetBottom: inset, human }));
    row(`NEW  ${label} ${human ? '(human player)' : '(AI)'}`, run(NEW, 140, asp, { insetBottom: inset, human }));
  }
}
