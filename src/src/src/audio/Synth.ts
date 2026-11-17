/**
 * PLACEHOLDER AUDIO: no recorded sound assets exist yet, so these effects are
 * synthesized at runtime and handed to Howler as WAV data URIs. Replace any
 * entry with a real file (see AudioManager.register) without touching callers.
 */
const RATE = 22050;

type Fn = (t: number, i: number, n: number) => number;
const rnd = () => Math.random() * 2 - 1;
const env = (t: number, dur: number, attack = 0.005, power = 2) =>
  Math.min(1, t / attack) * Math.pow(Math.max(0, 1 - t / dur), power);

function build(dur: number, fn: Fn): Float32Array {
  const n = Math.floor(dur * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i, n);
  return out;
}

/** One-pole low-pass state helper */
function lp(cut: number): (x: number) => number {
  let y = 0; const a = Math.min(1, (2 * Math.PI * cut) / RATE);
  return (x) => (y += a * (x - y));
}

function toWavUri(samples: Float32Array, gain = 0.9): string {
  const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  let peak = 0.0001; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(samples[i]));
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, (samples[i] / peak) * gain)) * 32767, true);
  let bin = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:audio/wav;base64,' + btoa(bin);
}

const whoosh = (dur: number, f0: number, f1: number): Float32Array => {
  let y = 0;
  return build(dur, (t) => {
    const k = t / dur;
    const a = Math.min(1, (2 * Math.PI * (f0 + (f1 - f0) * k)) / RATE); // sweeping low-pass
    y += a * (rnd() - y);
    return y * Math.sin(Math.PI * k) * 2;
  });
};
const thud = (dur: number, f: number, noise: number): Float32Array => {
  const l = lp(2500);
  return build(dur, (t) => (Math.sin(2 * Math.PI * f * (1 - t * 2.2) * t) * 0.9 + l(rnd()) * noise * Math.exp(-t * 60)) * env(t, dur, 0.002, 2.5));
};

const clang = (dur: number, base: number, noise: number): Float32Array =>
  build(dur, (t) => {
    const ring = Math.sin(2 * Math.PI * base * t) + 0.7 * Math.sin(2 * Math.PI * base * 1.5 * t) + 0.5 * Math.sin(2 * Math.PI * base * 2.32 * t) + 0.3 * Math.sin(2 * Math.PI * base * 3.7 * t);
    return (ring * 0.25 + rnd() * noise * Math.exp(-t * 90)) * env(t, dur, 0.001, 2.2);
  });

const sweep = (dur: number, f0: number, f1: number, shimmer = 0): Float32Array => {
  let ph = 0; const l = lp(3000);
  return build(dur, (t) => { const k = t / dur; ph += (f0 + (f1 - f0) * k) / RATE; return (Math.sin(ph * 6.2832) * 0.6 + Math.sin(ph * 12.566) * 0.2 * shimmer + l(rnd()) * 0.15) * Math.sin(Math.PI * Math.min(1, k * 1.05)); });
};

const tone = (dur: number, freqs: number[], step: number): Float32Array =>
  build(dur, (t) => {
    let s = 0;
    freqs.forEach((f, idx) => { const tt = t - idx * step; if (tt > 0) s += Math.sin(2 * Math.PI * f * tt) * env(tt, dur - idx * step, 0.01, 1.6) * 0.5; });
    return s;
  });

function music(): Float32Array {
  const dur = 16;
  const l = lp(220);
  return build(dur, (t) => {
    const drone = Math.sin(2 * Math.PI * 55 * t) * 0.35 + Math.sin(2 * Math.PI * 82.4 * t) * 0.2 + Math.sin(2 * Math.PI * 110 * t + Math.sin(t * 0.7)) * 0.12;
    const beat = t % 1; const taiko = Math.sin(2 * Math.PI * (70 - beat * 30) * beat) * Math.exp(-beat * 7) * (Math.floor(t) % 4 === 0 ? 0.9 : 0.35);
    const sh = (t % 2) < 1 ? 0 : l(rnd()) * Math.exp(-(t % 1) * 5) * 0.4;
    const bell = Math.floor(t / 4) % 2 === 0 ? 0 : Math.sin(2 * Math.PI * 440 * t) * Math.exp(-(t % 4) * 1.2) * 0.05;
    const fadeEdges = Math.min(1, t / 0.2, (dur - t) / 0.2); // seamless-ish loop
    return (drone * 0.7 + taiko * 0.8 + sh + bell) * fadeEdges;
  });
}

/** name -> WAV data URI. Generated lazily (once) on first audio init. */
export function generateSoundUris(): Record<string, string> {
  return {
    swing_light: toWavUri(whoosh(0.16, 1800, 5000), 0.55),
    swing_heavy: toWavUri(whoosh(0.3, 700, 3000), 0.7),
    impact_punch: toWavUri(thud(0.2, 120, 0.9)),
    impact_kick: toWavUri(thud(0.24, 85, 0.7)),
    impact_sword: toWavUri(clang(0.28, 1400, 1.1), 0.85),
    block: toWavUri(clang(0.22, 720, 0.6), 0.8),
    dodge: toWavUri(whoosh(0.22, 500, 1400), 0.4),
    footstep: toWavUri(build(0.07, (t) => lp(900)(rnd()) * env(t, 0.07, 0.002, 3)), 0.35),
    jump: toWavUri(sweep(0.16, 220, 480), 0.35),
    land: toWavUri(thud(0.14, 60, 0.5), 0.5),
    special: toWavUri(sweep(0.5, 180, 1400, 1), 0.8),
    ultimate: toWavUri(sweep(1.1, 60, 900, 1), 1),
    ko: toWavUri(thud(0.9, 45, 0.9), 1),
    victory: toWavUri(tone(1.2, [392, 494, 587, 784], 0.14), 0.7),
    defeat: toWavUri(tone(1.2, [392, 330, 262, 196], 0.18), 0.7),
    ui: toWavUri(tone(0.1, [880], 0), 0.4),
    music: toWavUri(music(), 0.7),
  };
}

