// Copies Three's Draco + Basis (KTX2) decoders into public/libs so GLB assets with geometry /
// texture compression can be loaded at runtime. Run: npm run prepare:libs
import { cpSync, mkdirSync, existsSync } from 'node:fs';

const base = 'node_modules/three/examples/jsm/libs';
const jobs = [[`${base}/draco/gltf`, 'public/libs/draco'], [`${base}/basis`, 'public/libs/basis']];
for (const [from, to] of jobs) {
  if (!existsSync(from)) { console.error(`missing ${from} - run npm install first`); process.exit(1); }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
