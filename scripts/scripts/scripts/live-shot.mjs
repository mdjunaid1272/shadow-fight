// Dev tool: open the game in headless Chrome in REAL time, record console errors, run scripted steps, capture screenshots.
// usage: node scripts/live-shot.mjs <url> <outPrefix> <seconds,seconds,...>
// optional: env STEPS='[{"at":12,"js":"document.title"}]' - each js is evaluated at that second and its value printed
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, prefix, times = '10'] = process.argv.slice(2);
const steps = process.env.STEPS ? JSON.parse(process.env.STEPS) : [];
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9400 + Math.floor(Math.random() * 400);
const dir = mkdtempSync(join(tmpdir(), 'sc-live-'));
const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist',
  `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://localhost:${port}/json`)).json(); if (tabs.some((t) => t.type === 'page')) break; } catch { /* retry */ } await sleep(250); }
const page = tabs.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = []; const logs = []; const tests = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  else if (msg.method === 'Runtime.consoleAPICalled' && String(msg.params.args[0]?.value ?? '').startsWith('TEST:')) tests.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
// env VIEW="844x390" sets the viewport; env TOUCH=1 emulates a touch device (touch controls appear)
const [vw, vh] = (process.env.VIEW ?? '1280x720').split('x').map(Number);
await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!process.env.TOUCH });
if (process.env.TOUCH) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url });
const start = Date.now();

const timeline = [
  ...times.split(',').filter(Boolean).map((x) => ({ at: Number(x), shot: true })),
  ...steps.map((s) => ({ at: s.at, js: s.js })),
].sort((a, b) => a.at - b.at);

for (const ev of timeline) {
  await sleep(Math.max(0, ev.at * 1000 - (Date.now() - start)));
  if (ev.js) {
    const r = await send('Runtime.evaluate', { expression: ev.js, awaitPromise: true, returnByValue: true });
    console.log('js @' + ev.at + 's =>', JSON.stringify(r.result?.value ?? r.exceptionDetails?.text));
    continue;
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${prefix}_${ev.at}s.png`, Buffer.from(shot.data, 'base64'));
  const fps = await send('Runtime.evaluate', { expression: "document.querySelector('.fps')?.textContent ?? ''" });
  console.log('shot @' + ev.at + 's  fps=' + fps.result?.value);
}
if (tests.length) console.log(tests.join('\n'));
console.log(errors.length ? 'UNCAUGHT ERRORS:\n' + errors.join('\n') : 'no uncaught errors');
if (logs.length) console.log('console warnings/errors:\n' + [...new Set(logs)].slice(0, 8).join('\n'));
ws.close(); proc.kill();
await sleep(500);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(0);
