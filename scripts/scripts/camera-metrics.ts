// Measures how "busy" each camera style is over long simulated fights (AI and human-style player, several screen shapes).
// usage: npx tsx scripts/camera-metrics.ts
import { CALM_TUNING, FULL_TUNING, HYBRID_TUNING } from '../src/camera/CameraConfig';
import { run, type Metrics, type Tuning } from './cameraSim';

const fmt = (n: number, d = 2) => n.toFixed(d).padStart(8);
const row = (name: string, m: Metrics) => console.log(`${name.padEnd(30)}${fmt(m.speedP50)}${fmt(m.speedP95)}${fmt(m.accelP95, 1)}${fmt(m.jerkP95, 0)}${fmt(m.xRevPerMin, 1)}${fmt(m.yawRateP95, 2)}${fmt(m.fovMax)}${fmt(m.safe * 100, 1)}${fmt(m.framed * 100, 1)}`);
console.log('variant'.padEnd(30) + 'v50 m/s'.padStart(8) + 'v95'.padStart(8) + 'acc95'.padStart(8) + 'jerk95'.padStart(8) + 'xRev/m'.padStart(8) + 'yaw95d/s'.padStart(8) + 'fovMax'.padStart(8) + 'safe%'.padStart(8) + 'screen%'.padStart(8));
const styles: Array<[string, Tuning]> = [['DYNAMIC (legacy)', FULL_TUNING], ['CALM (legacy)', CALM_TUNING], ['HYBRID (default)', HYBRID_TUNING]];
for (const [asp, label, inset] of [[16 / 9, '16:9', 0], [19.5 / 9, 'phone+inset', 0.14]] as const) {
  console.log(`--- ${label}, human-style player ---`);
  for (const [n, t] of styles) row(n, run({ ...t }, 150, asp, { human: true, insetBottom: inset }));
  console.log(`--- ${label}, AI vs AI ---`);
  for (const [n, t] of styles) row(n, run({ ...t }, 150, asp, { insetBottom: inset }));
}
console.log('--- HYBRID with one setting changed (16:9, human) ---');
const ab: Array<[string, Partial<Tuning>]> = [['depth rotation off', { depthYaw: 0 }], ['no yaw hysteresis/rate limit', { yawHysteresis: 0, maxYawRate: 0 }], ['dead zone 0.1 m', { deadZone: 0.1 }], ['kick x2.5', { kick: 1 }], ['faster follow (x0.7)', { follow: 0.7 }]];
for (const [n, t] of ab) row(n, run({ ...HYBRID_TUNING, ...t }, 150, 16 / 9, { human: true }));
console.log('\n(lower is calmer for v95/acc95/jerk95/xRev/yaw95; safe%/screen% should stay ~100)');
